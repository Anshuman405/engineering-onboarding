const assert = require("node:assert/strict");
const test = require("node:test");
const { Collection } = require("discord.js");
const {
  handleConnect,
  handleProfile,
  handleStatus,
  handleSync,
} = require("../src/eos/commands");

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
