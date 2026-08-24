const { createHash } = require("node:crypto");
const { EosApiError, eosRequest } = require("./client");

function values(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Object.values(collection);
}

function userSnapshot(user, member) {
  return {
    id: user.id,
    username: user.username || user.tag || "unknown",
    displayName: member?.displayName || user.globalName || user.username || "Unknown user",
    globalName: user.globalName || null,
    avatarUrl: typeof user.displayAvatarURL === "function" ? user.displayAvatarURL() : null,
    isBot: Boolean(user.bot),
    nickname: member?.nickname || null,
    roleIds: values(member?.roles?.cache).map((role) => role.id).filter(Boolean),
    joinedAt: member?.joinedAt?.toISOString?.() || null,
    isActive: true,
  };
}

function serverSnapshot(guild) {
  return {
    id: guild.id, name: guild.name || "Unknown Discord server", description: guild.description || null,
    iconUrl: typeof guild.iconURL === "function" ? guild.iconURL() : null, ownerId: guild.ownerId || null,
  };
}

function channelSnapshot(channel) {
  return {
    id: channel.id, name: channel.name || "unknown-channel", type: String(channel.type ?? "UNKNOWN"),
    topic: channel.topic || null, parentId: channel.parentId || null,
    position: Number.isInteger(channel.position) ? channel.position : null, isArchived: false,
    url: channel.url || null, createdAt: channel.createdAt?.toISOString?.() || null, isAccessible: true,
  };
}

function threadSnapshot(thread) {
  return {
    id: thread.id, parentChannelId: thread.parentId, ownerId: null,
    name: thread.name || "unknown-thread", type: String(thread.type ?? "THREAD"),
    isArchived: Boolean(thread.archived), isLocked: Boolean(thread.locked),
    createdAt: thread.createdAt?.toISOString?.() || null,
    archiveTimestamp: thread.archiveTimestamp?.toISOString?.() || null,
    url: thread.url || null, isAccessible: true,
  };
}

function normalizeDiscordMessage(message, { deleted = false } = {}) {
  if (!message?.guild?.id || !message?.channel?.id || !message?.author?.id) return null;
  const isThread = Boolean(message.channel.isThread?.());
  const parent = isThread ? message.channel.parent : message.channel;
  if (!parent?.id) return null;
  const channel = channelSnapshot(parent);
  const thread = isThread ? threadSnapshot(message.channel) : null;
  const createdAt = message.createdAt?.toISOString?.() || new Date(Number(message.createdTimestamp || Date.now())).toISOString();
  return {
    server: {
      id: message.guild.id,
      name: message.guild.name || "Unknown Discord server",
      description: message.guild.description || null,
      iconUrl: typeof message.guild.iconURL === "function" ? message.guild.iconURL() : null,
      ownerId: message.guild.ownerId || null,
    },
    user: userSnapshot(message.author, message.member),
    channel,
    thread,
    message: {
      id: message.id,
      channelId: parent.id,
      threadId: thread?.id || null,
      authorId: message.author.id,
      content: message.content || "",
      type: String(message.type ?? "DEFAULT"),
      url: message.url || null,
      replyToMessageId: message.reference?.messageId || null,
      mentionedUserIds: values(message.mentions?.users).map((user) => user.id).filter(Boolean),
      attachments: values(message.attachments).map((attachment) => ({
        id: attachment.id,
        filename: attachment.name || "attachment",
        url: attachment.url,
        contentType: attachment.contentType || null,
        size: Number.isInteger(attachment.size) ? attachment.size : null,
      })),
      embeds: values(message.embeds).map((embed) => ({
        title: embed.title || null, description: embed.description || null, url: embed.url || null, type: embed.data?.type || embed.type || null,
      })),
      createdAt,
      editedAt: message.editedAt?.toISOString?.() || null,
      isDeleted: deleted,
    },
  };
}

function buildDiscordBatch(envelopes, options = {}) {
  if (!envelopes.length) return null;
  const server = envelopes[0].server;
  if (envelopes.some((item) => item.server.id !== server.id)) throw new Error("A Discord ingestion batch cannot contain multiple servers");
  const unique = (items, key) => [...new Map(items.filter(Boolean).map((item) => [item[key], item])).values()];
  const messages = unique(envelopes.map((item) => item.message), "id").sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const users = unique(envelopes.map((item) => item.user), "id");
  const channels = unique(envelopes.map((item) => item.channel), "id");
  const threads = unique(envelopes.map((item) => item.thread), "id");
  const cursorMap = new Map();
  for (const message of messages) {
    const key = `${message.channelId}:${message.threadId || "channel"}`;
    const current = cursorMap.get(key);
    if (!current || current.lastMessageAt < message.createdAt || (current.lastMessageAt === message.createdAt && BigInt(current.lastMessageId) < BigInt(message.id))) {
      cursorMap.set(key, { channelId: message.channelId, threadId: message.threadId, lastMessageId: message.id, lastMessageAt: message.createdAt });
    }
  }
  const versionIdentity = messages.map((message) => `${message.id}:${message.editedAt || message.createdAt}:${message.isDeleted}`).join("|");
  const digest = createHash("sha256").update(`${server.id}|${versionIdentity}`).digest("hex").slice(0, 24);
  return { batchId: options.batchId || `discord-${server.id}-${digest}`, server, users, channels, threads, messages, cursors: [...cursorMap.values()] };
}

function isRetryable(error) {
  return !(error instanceof EosApiError) || error.status === 429 || error.status >= 500;
}

async function sendDiscordBatchWithRetry(batch, options = {}) {
  const send = options.send || eosRequest;
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const maxRetries = options.maxRetries ?? Number(process.env.EOS_DISCORD_MAX_RETRIES || 5);
  for (let attempt = 0; ; attempt++) {
    try {
      return await send("/api/discord/ingest", { method: "POST", body: JSON.stringify(batch) });
    } catch (error) {
      if (!isRetryable(error) || attempt >= maxRetries) throw error;
      const delay = error.retryAfterMs ?? Math.min(30_000, 500 * 2 ** attempt);
      await wait(delay);
    }
  }
}

function createDiscordPublisher(options = {}) {
  const queue = new Map();
  const batchSize = options.batchSize ?? Number(process.env.EOS_DISCORD_BATCH_SIZE || 100);
  const flushMs = options.flushMs ?? Number(process.env.EOS_DISCORD_FLUSH_MS || 1000);
  let timer = null;
  let flushing = null;

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush().catch((error) => console.error("Discord → EOS publish failed:", error.message));
    }, flushMs);
    timer.unref?.();
  }

  function enqueue(message, eventOptions) {
    const envelope = normalizeDiscordMessage(message, eventOptions);
    if (!envelope) return false;
    const key = `${envelope.server.id}:${envelope.message.id}`;
    queue.set(key, envelope);
    if (queue.size >= batchSize) void flush(); else schedule();
    return true;
  }

  async function doFlush() {
    if (timer) { clearTimeout(timer); timer = null; }
    const grouped = new Map();
    for (const [key, envelope] of [...queue.entries()].slice(0, batchSize)) {
      queue.delete(key);
      const group = grouped.get(envelope.server.id) || [];
      group.push(envelope);
      grouped.set(envelope.server.id, group);
    }
    try {
      const results = [];
      for (const envelopes of grouped.values()) {
        const batch = buildDiscordBatch(envelopes);
        if (batch) results.push(await sendDiscordBatchWithRetry(batch, options));
      }
      return results;
    } catch (error) {
      if (isRetryable(error)) {
        for (const envelopes of grouped.values()) for (const envelope of envelopes) queue.set(`${envelope.server.id}:${envelope.message.id}`, envelope);
        schedule();
      }
      throw error;
    } finally {
      if (queue.size) schedule();
    }
  }

  function flush() {
    if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
    return flushing;
  }

  return { enqueue, flush, pendingCount: () => queue.size };
}

module.exports = {
  buildDiscordBatch,
  createDiscordPublisher,
  normalizeDiscordMessage,
  sendDiscordBatchWithRetry,
  values,
  userSnapshot,
  serverSnapshot,
  channelSnapshot,
  threadSnapshot,
};
