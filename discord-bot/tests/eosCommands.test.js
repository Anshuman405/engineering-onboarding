const assert = require("node:assert/strict");
const test = require("node:test");
const { Collection } = require("discord.js");
const {
  eosCommand,
  handleEosCommand,
  handleConnect,
  handleOnboarding,
  handleProfile,
  handleSearch,
  handleStatus,
  handleSync,
  waitForEosReady,
} = require("../src/eos/commands");
const { EosApiError } = require("../src/eos/client");
const { buildVenuSetupEmbed } = require("../src/eos/venuSetup");

function interaction(overrides = {}) {
  const replies = [];
  return {
    user: { id: "400000000000000001" },
    options: { getString: () => null },
    editReply: async (value) => { replies.push(value); return value; },
    replies,
    ...overrides,
  };
}

test("/eos status renders the authenticated EOS status response", async () => {
  const target = interaction();
  await handleStatus(target, async (path) => {
    assert.equal(path, "/api/eos/status");
    return { data: {
      engineers: 3,
      onboarding: 1,
      activeTasks: 2,
      blockedTasks: 1,
      unassignedTasks: 4,
      recentEvents: 9,
      database: "connected",
      github: { connected: false },
      discord: { connected: true, servers: 1, channels: 14, activeMembers: 22 },
      documents: { active: 8, indexed: 7, storageConfigured: true },
      knowledge: { active: 5 },
      intelligence: { configured: false },
    } };
  });
  const embed = target.replies[0].embeds[0].toJSON();
  assert.equal(embed.title, "Engineering OS Status");
  assert.equal(embed.fields.find((field) => field.name === "Engineers").value, "3");
  assert.equal(embed.fields.find((field) => field.name === "Database").value, "Connected");
  assert.equal(embed.fields.find((field) => field.name === "Discord").value, "Live retrieval ready");
  assert.equal(embed.fields.find((field) => field.name === "Discord Metadata").value, "1 servers • 14 channels • 22 members");
  assert.equal(embed.fields.find((field) => field.name === "Documentation").value, "7/8 indexed • storage ready");
  assert.equal(embed.fields.find((field) => field.name === "GitHub").value, "Waiting for token");
});

test("/eos search is registered with one bounded query option", () => {
  const search = eosCommand.toJSON().options.find((option) => option.name === "search");
  assert.ok(search);
  assert.equal(search.options.length, 1);
  assert.equal(search.options[0].name, "query");
  assert.equal(search.options[0].required, true);
  assert.equal(search.options[0].min_length, 2);
  assert.equal(search.options[0].max_length, 500);
});

test("/eos search requests bounded context scoped to the current Discord channel", async () => {
  const target = interaction({
    guildId: "319922397899915264",
    channelId: "319932292447338517",
    options: { getString: (name) => name === "query" ? "campaign manager" : null },
  });
  let call;
  await handleSearch(target, async (path, options) => {
    call = { path, options };
    return { data: {
      documents: [{ title: "Campaign architecture", url: "https://docs.google.com/document/d/example", category: "Architecture" }],
      tasks: [{ title: "Finish campaign manager", status: "IN_PROGRESS", owner: { name: "Alex" }, github: { url: "https://github.com/Venu/repo/issues/12" } }],
      github: { issues: [], pullRequests: [{ title: "Campaign fix", url: "https://github.com/Venu/repo/pull/13" }], commits: [] },
      engineers: [],
      knowledge: [],
      discord: { messages: [{ content: "Use the new campaign pipeline", url: "https://discord.com/channels/1/2/3", occurredAt: "2026-08-26T10:00:00.000Z" }] },
      warnings: [],
    } };
  });
  assert.equal(call.path, "/api/context/relevant");
  assert.deepEqual(JSON.parse(call.options.body), {
    query: "campaign manager",
    serverId: "319922397899915264",
    channelId: "319932292447338517",
    includeDiscord: true,
    limit: 6,
  });
  const embed = target.replies[0].embeds[0].toJSON();
  assert.match(embed.description, /Documentation/);
  assert.match(embed.description, /Tasks/);
  assert.match(embed.description, /GitHub/);
  assert.match(embed.description, /Live Discord/);
});

test("/eos search reports a useful empty state", async () => {
  const target = interaction({
    options: { getString: () => "missing topic" },
  });
  await handleSearch(target, async () => ({ data: {
    documents: [], knowledge: [], tasks: [], github: { issues: [], pullRequests: [], commits: [] }, engineers: [], discord: null, warnings: [],
  } }));
  assert.match(target.replies[0].content, /No connected engineering context matched/);
});

test("/eos profile renders Engineer and onboarding data", async () => {
  const target = interaction();
  await handleProfile(target, async (path) => {
    assert.equal(path, "/api/engineers/profile/400000000000000001");
    return { engineer: { name: "Alex", status: "ACTIVE", email: "alex@example.test", githubUsername: "alex-gh", discordUserId: target.user.id }, onboarding: { status: "COMPLETED" } };
  });
  const embed = target.replies[0].embeds[0].toJSON();
  assert.equal(embed.fields.find((field) => field.name === "Onboarding").value, "COMPLETED");
  assert.match(embed.fields.find((field) => field.name === "GitHub").value, /alex-gh/);
});

test("/eos connect sends GitHub and email updates to the profile API", async () => {
  const calls = [];
  const github = interaction({ options: { getString: (name) => name === "type" ? "github" : "@alex-gh" } });
  await handleConnect(github, async (path, options) => { calls.push({ path, options }); return { engineer: { name: "Alex" } }; });
  assert.equal(calls[0].path, "/api/engineers/profile/400000000000000001/github");
  assert.deepEqual(JSON.parse(calls[0].options.body), { githubUsername: "alex-gh" });

  const email = interaction({ options: { getString: (name) => name === "type" ? "email" : "Alex@Example.Test" } });
  await handleConnect(email, async (path, options) => { calls.push({ path, options }); return { engineer: { name: "Alex" } }; });
  assert.equal(calls[1].path, "/api/engineers/profile/400000000000000001/email");
  assert.deepEqual(JSON.parse(calls[1].options.body), { email: "alex@example.test" });
});

test("/eos onboarding links identity and returns the Tally continuation", async () => {
  const target = interaction({
    user: {
      id: "400000000000000001",
      username: "alex",
      globalName: "Alex Example",
    },
    member: { displayName: "Alex" },
    options: {
      getString: (name) => name === "github" ? "@alex-gh" : "Alex@Example.Test",
    },
  });
  let call;

  await handleOnboarding(
    target,
    async (path, options) => {
      call = { path, options };
      return { ok: true };
    },
    "https://tally.so/r/example"
  );

  assert.equal(call.path, "/api/engineers/onboarding");
  assert.deepEqual(JSON.parse(call.options.body), {
    discordUserId: "400000000000000001",
    name: "Alex",
    email: "alex@example.test",
    githubUsername: "alex-gh",
    completed: false,
  });

  const reply = target.replies[0];
  const embed = reply.embeds[0].toJSON();
  assert.equal(embed.title, "Venu engineering onboarding");
  assert.equal(reply.components[0].toJSON().components[0].url, "https://tally.so/r/example");
});

test("/eos onboarding fails safely before writing invalid or unconfigured data", async () => {
  let calls = 0;
  const request = async () => { calls += 1; };

  const invalidEmail = interaction({
    user: { id: "400000000000000001", username: "alex" },
    options: {
      getString: (name) => name === "github" ? "alex-gh" : "not-an-email",
    },
  });
  await handleOnboarding(invalidEmail, request, "https://tally.so/r/example");
  assert.match(invalidEmail.replies[0].content, /valid email/i);

  const missingForm = interaction({
    user: { id: "400000000000000001", username: "alex" },
    options: {
      getString: (name) => name === "github" ? "alex-gh" : "alex@example.test",
    },
  });
  await handleOnboarding(missingForm, request, "");
  assert.match(missingForm.replies[0].content, /not configured/i);
  assert.equal(calls, 0);
});

test("/eos onboarding is registered and the post-Tally setup guide matches Venu 1.x", () => {
  const command = eosCommand.toJSON();
  const onboarding = command.options.find((option) => option.name === "onboarding");
  assert.ok(onboarding);
  assert.deepEqual(onboarding.options.map((option) => option.name), ["github", "email"]);

  const embed = buildVenuSetupEmbed().toJSON();
  assert.match(embed.title, /Venu 1\.x/);
  assert.match(JSON.stringify(embed), /docker compose up -d --build/);
  assert.match(JSON.stringify(embed), /npm install -g @openai\/codex/);
  assert.match(JSON.stringify(embed), /localhost:3000/);
});

test("/eos sync sends non-bot Product members without changing onboarding behavior", async () => {
  const productRole = { id: "role-product", name: "Product" };
  const members = new Collection([
    ["400000000000000001", { id: "400000000000000001", displayName: "Alex", user: { bot: false, username: "alex" }, roles: { cache: new Collection([[productRole.id, productRole]]) } }],
    ["400000000000000002", { id: "400000000000000002", displayName: "Bot", user: { bot: true, username: "bot" }, roles: { cache: new Collection([[productRole.id, productRole]]) } }],
  ]);
  const target = interaction({
    memberPermissions: { has: (permission) => permission === "Administrator" },
    guild: { members: { fetch: async () => members } },
  });
  let payload;
  await handleSync(target, async (path, options) => {
    assert.equal(path, "/api/sync/discord");
    payload = JSON.parse(options.body);
    return { created: 1, updated: 0 };
  });
  assert.equal(payload.members.length, 1);
  assert.equal(payload.members[0].discordUserId, "400000000000000001");
  assert.equal(target.replies.length, 2);
  assert.equal(target.replies[1].embeds[0].toJSON().title, "Discord → EOS Sync Complete");
});

test("/eos command returns a bounded safe message when EOS is unavailable", async () => {
  const replies = [];
  const target = {
    user: { id: "400000000000000001" },
    options: { getSubcommand: () => "status" },
    deferred: false,
    replied: false,
    deferReply: async () => { target.deferred = true; },
    editReply: async (value) => { replies.push(value); return value; },
  };
  const originalError = console.error;
  console.error = () => undefined;
  try {
    await handleEosCommand(target, async () => {
      throw new EosApiError(`EOS API 502: ${"x".repeat(100_000)}`, 502);
    }, { maxWaitMs: 1 });
  } finally {
    console.error = originalError;
  }
  assert.equal(replies.length, 2);
  assert.match(replies[0].content, /EOS is waking up/);
  assert.equal(replies[1].content, "EOS is temporarily unavailable. Please wait a moment and run the command again.");
  assert.ok(replies[1].content.length < 200);
});

test("/eos command does not reject if Discord rejects the fallback error response", async () => {
  const target = {
    user: { id: "400000000000000001" },
    options: { getSubcommand: () => "status" },
    deferred: false,
    replied: false,
    deferReply: async () => { target.deferred = true; },
    editReply: async () => { throw new Error("Unknown interaction"); },
  };
  const originalError = console.error;
  console.error = () => undefined;
  try {
    await assert.doesNotReject(() => handleEosCommand(target, async () => {
      throw new EosApiError("EOS API 502: unavailable", 502);
    }, { maxWaitMs: 1 }));
  } finally {
    console.error = originalError;
  }
});

test("EOS wake-up retries Render failures and then runs without another command", async () => {
  let clock = 0;
  let attempts = 0;
  const replies = [];
  const target = { editReply: async (value) => { replies.push(value); } };
  await waitForEosReady(target, async (path) => {
    assert.equal(path, "/health");
    attempts += 1;
    if (attempts < 3) throw new EosApiError("EOS API 502: unavailable", 502);
    return { ok: true, service: "venu-engineering-os" };
  }, {
    now: () => clock,
    wait: async (milliseconds) => { clock += milliseconds; },
    maxWaitMs: 30_000,
    retryMs: 5_000,
  });
  assert.equal(attempts, 3);
  assert.equal(replies.length, 3);
  assert.match(replies[0].content, /up to 30s remaining/);
  assert.match(replies[2].content, /up to 20s remaining/);
});

test("EOS wake-up is bounded and preserves a safe retryable failure", async () => {
  let clock = 0;
  let attempts = 0;
  const target = { editReply: async () => undefined };
  await assert.rejects(
    waitForEosReady(target, async () => {
      attempts += 1;
      throw new EosApiError("EOS API 502: unavailable", 502);
    }, {
      now: () => clock,
      wait: async (milliseconds) => { clock += milliseconds; },
      maxWaitMs: 30_000,
      retryMs: 10_000,
    }),
    (error) => error instanceof EosApiError && error.status === 502,
  );
  assert.equal(attempts, 3);
  assert.equal(clock, 30_000);
});

test("EOS wake-up does not retry permanent configuration errors", async () => {
  let attempts = 0;
  const target = { editReply: async () => undefined };
  await assert.rejects(
    waitForEosReady(target, async () => {
      attempts += 1;
      throw new EosApiError("EOS_API_URL and EOS_API_KEY must be configured", 0);
    }),
    /must be configured/,
  );
  assert.equal(attempts, 1);
});
