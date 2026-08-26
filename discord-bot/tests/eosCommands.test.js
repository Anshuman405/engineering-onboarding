const assert = require("node:assert/strict");
const test = require("node:test");
const { Collection } = require("discord.js");
const {
  eosCommand,
  handleEosCommand,
  handleConnect,
  handleOnboarding,
  handleProfile,
  handleStatus,
  handleSync,
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
    return { data: { engineers: 3, onboarding: 1, activeTasks: 2, blockedTasks: 1, unassignedTasks: 4, recentEvents: 9, database: "connected", discord: { messages: 12, latestIngestion: { status: "COMPLETED" } } } };
  });
  const embed = target.replies[0].embeds[0].toJSON();
  assert.equal(embed.title, "Engineering OS Status");
  assert.equal(embed.fields.find((field) => field.name === "Engineers").value, "3");
  assert.equal(embed.fields.find((field) => field.name === "Database").value, "Connected");
  assert.equal(embed.fields.find((field) => field.name === "Discord Messages").value, "12");
  assert.equal(embed.fields.find((field) => field.name === "Discord Ingestion").value, "COMPLETED");
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
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(replies.length, 1);
  assert.equal(replies[0].content, "EOS is temporarily unavailable. Please wait a moment and run the command again.");
  assert.ok(replies[0].content.length < 200);
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
    }));
  } finally {
    console.error = originalError;
  }
});
