const assert = require("node:assert/strict");
const test = require("node:test");
const { EosApiError } = require("../src/eos/client");
const {
  buildDiscordBatch,
  createDiscordPublisher,
  normalizeDiscordMessage,
  sendDiscordBatchWithRetry,
} = require("../src/eos/discordPublisher");

function messageFixture(overrides = {}) {
  const guild = { id: "100000000000000001", name: "Venu Engineering", ownerId: "900000000000000001", iconURL: () => null };
  const parent = { id: "200000000000000001", name: "engineering", type: 0, topic: "Build Venu", position: 1 };
  const channel = {
    id: "300000000000000001",
    name: "implementation",
    type: 11,
    parent,
    parentId: parent.id,
    archived: false,
    locked: false,
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
    isThread: () => true,
  };
  const user = { id: "400000000000000001", username: "engineer", globalName: "Engineer", bot: false, displayAvatarURL: () => null };
  return {
    id: "500000000000000001",
    guild,
    channel,
    author: user,
    member: { displayName: "Engineer", roles: { cache: new Map() }, joinedAt: new Date("2026-01-01T00:00:00.000Z") },
    content: "Decision: use the normalized ingestion contract. RoboBearLLC/VenuAI#42",
    type: 0,
    url: "https://discord.com/channels/100000000000000001/300000000000000001/500000000000000001",
    reference: { messageId: "500000000000000000" },
    mentions: { users: new Map() },
    attachments: new Map(),
    createdAt: new Date("2026-08-22T10:05:00.000Z"),
    createdTimestamp: new Date("2026-08-22T10:05:00.000Z").getTime(),
    editedAt: null,
    ...overrides,
  };
}

test("normalizes Discord threads, replies, users, and timestamps for EOS", () => {
  const normalized = normalizeDiscordMessage(messageFixture());
  assert.equal(normalized.channel.id, "200000000000000001");
  assert.equal(normalized.thread.id, "300000000000000001");
  assert.equal(normalized.message.replyToMessageId, "500000000000000000");
  assert.equal(normalized.message.authorId, normalized.user.id);
  assert.equal(normalized.message.createdAt, "2026-08-22T10:05:00.000Z");
});

test("builds deterministic idempotency keys and deduplicates messages", () => {
  const first = normalizeDiscordMessage(messageFixture());
  const duplicate = normalizeDiscordMessage(messageFixture({ content: "latest representation" }));
  const batch = buildDiscordBatch([first, duplicate]);
  const replay = buildDiscordBatch([first, duplicate]);
  assert.equal(batch.messages.length, 1);
  assert.equal(batch.messages[0].content, "latest representation");
  assert.equal(batch.batchId, replay.batchId);
  assert.equal(batch.cursors[0].lastMessageId, batch.messages[0].id);
});

test("retries transient EOS failures with the same batch", async () => {
  const batch = buildDiscordBatch([normalizeDiscordMessage(messageFixture())]);
  let attempts = 0;
  const waits = [];
  const result = await sendDiscordBatchWithRetry(batch, {
    maxRetries: 3,
    wait: async (milliseconds) => waits.push(milliseconds),
    send: async (_path, request) => {
      attempts++;
      assert.deepEqual(JSON.parse(request.body), batch);
      if (attempts < 3) throw new EosApiError("temporary", 503);
      return { ok: true };
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [500, 1000]);
});

test("does not retry authentication or validation failures", async () => {
  let attempts = 0;
  await assert.rejects(() => sendDiscordBatchWithRetry({ batchId: "test" }, {
    maxRetries: 5,
    send: async () => { attempts++; throw new EosApiError("unauthorized", 401); },
  }), /unauthorized/);
  assert.equal(attempts, 1);
});

test("does not retain a permanently rejected publisher batch", async () => {
  const publisher = createDiscordPublisher({
    batchSize: 100,
    flushMs: 60_000,
    send: async () => { throw new EosApiError("invalid payload", 400); },
  });
  publisher.enqueue(messageFixture());
  await assert.rejects(() => publisher.flush(), /invalid payload/);
  assert.equal(publisher.pendingCount(), 0);
});

test("publishes a large queue in bounded batches without losing messages", async () => {
  const sent = [];
  const publisher = createDiscordPublisher({
    batchSize: 1000,
    flushMs: 60_000,
    send: async (_path, request) => { sent.push(JSON.parse(request.body)); return { ok: true }; },
  });
  for (let index = 0; index < 500; index++) {
    const id = String(600000000000000000n + BigInt(index));
    assert.equal(publisher.enqueue(messageFixture({ id, createdAt: new Date(1724321100000 + index), createdTimestamp: 1724321100000 + index })), true);
  }
  await publisher.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].messages.length, 500);
  assert.equal(publisher.pendingCount(), 0);
});
