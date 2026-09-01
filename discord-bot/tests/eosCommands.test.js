const assert = require("node:assert/strict");
const test = require("node:test");
const { Collection } = require("discord.js");
const {
  eosCommand,
  handleEosCommand,
  handleConnect,
  handleOnboarding,
  handleProgress,
  handleProfile,
  handleSearch,
  handleAsk,
  handleStatus,
  handleSync,
  normalizeGitHubUsername,
  onboardingNextStep,
  githubProfileFields,
  PRIVATE_EOS_SUBCOMMANDS,
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

test("/eos ask is registered as a private bounded question command", () => {
  const ask = eosCommand.toJSON().options.find((option) => option.name === "ask");
  assert.ok(ask);
  assert.equal(ask.options.length, 1);
  assert.equal(ask.options[0].name, "question");
  assert.equal(ask.options[0].required, true);
  assert.equal(ask.options[0].min_length, 2);
  assert.equal(ask.options[0].max_length, 500);
  assert.equal(PRIVATE_EOS_SUBCOMMANDS.has("ask"), true);
});

test("/eos ask requests a bounded channel-scoped answer and renders verified citations", async () => {
  const target = interaction({
    guildId: "319922397899915264",
    channelId: "319932292447338517",
    options: { getString: (name) => name === "question" ? "What did the team decide about campaigns?" : null },
  });
  let call;
  await handleAsk(target, async (path, options) => {
    call = { path, options };
    return { data: {
      answer: "The team chose the event-driven campaign pipeline.",
      confidence: "HIGH",
      insufficientContext: false,
      provider: "gemini",
      model: "gemini-test",
      citations: [
        { sourceType: "DISCORD_MESSAGE", sourceId: "500000000000000001", label: "Discord message in #dev", url: "https://discord.com/channels/319922397899915264/319932292447338517/500000000000000001" },
        { sourceType: "DOCUMENT", sourceId: "doc-1", label: "Campaign architecture", url: "https://docs.google.com/document/d/doc-1" },
      ],
    } };
  });

  assert.equal(call.path, "/api/context/answer");
  assert.deepEqual(JSON.parse(call.options.body), {
    question: "What did the team decide about campaigns?",
    serverId: "319922397899915264",
    channelId: "319932292447338517",
    days: 14,
    limit: 8,
  });
  const reply = target.replies[0];
  const embed = reply.embeds[0].toJSON();
  assert.match(embed.description, /event-driven campaign pipeline/);
  assert.match(embed.fields.find((field) => field.name === "Sources").value, /Discord message in #dev/);
  assert.match(embed.fields.find((field) => field.name === "Sources").value, /Campaign architecture/);
  assert.match(embed.footer.text, /HIGH confidence/);
  assert.deepEqual(reply.allowedMentions, { parse: [] });
});

test("/eos ask clearly reports insufficient retrieved context without fake sources", async () => {
  const target = interaction({ options: { getString: () => "Unknown project decision" } });
  await handleAsk(target, async () => ({ data: {
    answer: "EOS does not have enough retrieved context to answer that yet.",
    confidence: "LOW",
    insufficientContext: true,
    provider: "gemini",
    model: "gemini-test",
    citations: [],
  } }));
  const embed = target.replies[0].embeds[0].toJSON();
  assert.match(embed.description, /does not have enough retrieved context/i);
  assert.equal(Boolean(embed.fields?.some((field) => field.name === "Sources")), false);
  assert.match(embed.footer.text, /Insufficient context/);
});

test("/eos profile renders Engineer and onboarding data", async () => {
  const target = interaction();
  await handleProfile(target, async (path) => {
    assert.equal(path, "/api/engineers/profile/400000000000000001");
    return {
      engineer: { name: "Alex", status: "ACTIVE", email: "alex@example.test", githubUsername: "alex-gh", discordUserId: target.user.id },
      onboarding: { status: "COMPLETED", repositoryAccess: true, environmentSetup: false, firstTaskGiven: true, firstFixShipped: true },
      githubActivity: {
        configured: true,
        identityConnected: true,
        dataAvailable: true,
        lastSyncedAt: "2026-08-27T12:00:00.000Z",
        commits: { day: 2, week: 8, month: 20, all: 50 },
        pullRequests: { open: 2, closed: 3, merged: 4, current: [] },
        reviews: { month: 5, all: 12, requested: [] },
        tasks: { active: 1, completed: 7, current: [] },
      },
    };
  });
  const embed = target.replies[0].embeds[0].toJSON();
  assert.equal(embed.fields.find((field) => field.name === "Onboarding").value, "COMPLETED");
  assert.match(embed.fields.find((field) => field.name === "GitHub").value, /alex-gh/);
  assert.match(embed.fields.find((field) => field.name === "Next step").value, /Set up Venu 1\.x/);
  assert.match(embed.fields.find((field) => field.name === "Engineering checklist").value, /✅ VenuAI repository access/);
  assert.match(embed.fields.find((field) => field.name === "Commits").value, /24h: \*\*2\*\*/);
  assert.match(embed.fields.find((field) => field.name === "Pull requests").value, /Merged: \*\*4\*\*/);
});

test("GitHub profile fields explain disabled, pending, and active states", () => {
  assert.match(githubProfileFields({ temporarilyUnavailable: true })[0].value, /temporarily unavailable/);
  assert.match(githubProfileFields({ configured: false })[0].value, /Waiting for the EOS GitHub token/);
  assert.match(githubProfileFields({ configured: true, identityConnected: false })[0].value, /eos connect/);
  assert.match(githubProfileFields({ configured: true, identityConnected: true, dataAvailable: false })[0].value, /initial repository sync is pending/);

  const fields = githubProfileFields({
    configured: true,
    identityConnected: true,
    dataAvailable: true,
    lastSyncedAt: "2026-08-27T12:00:00.000Z",
    commits: { day: 1, week: 2, month: 3, all: 4 },
    pullRequests: { open: 1, closed: 2, merged: 3, current: [{ number: 9, title: "Ship feature", url: "https://github.com/acme/app/pull/9", repository: { fullName: "acme/app" } }] },
    reviews: { month: 4, all: 5, requested: [{ number: 10, title: "Review me", url: "https://github.com/acme/app/pull/10", repository: { fullName: "acme/app" } }] },
    tasks: { active: 2, completed: 6, current: [{ title: "Fix issue", status: "IN_PROGRESS", githubUrl: "https://github.com/acme/app/issues/1" }] },
  });
  assert.match(fields.find((field) => field.name === "Current GitHub work").value, /Reviews requested/);
  assert.ok(fields.every((field) => field.value.length <= 1024));
});

test("/eos progress is registered with bounded milestone and state choices", () => {
  const progress = eosCommand.toJSON().options.find((option) => option.name === "progress");
  assert.ok(progress);
  assert.deepEqual(progress.options.map((option) => option.name), ["step", "state"]);
  assert.equal(progress.options[0].choices.length, 4);
  assert.equal(progress.options[1].required, false);
});

test("/eos progress marks and unmarks milestones through the profile API", async () => {
  const calls = [];
  for (const state of [null, "not_complete"]) {
    const target = interaction({
      options: { getString: (name) => name === "step" ? "repository_access" : state },
    });
    await handleProgress(target, async (path, options) => {
      calls.push({ path, body: JSON.parse(options.body) });
      return { onboarding: { repositoryAccess: state !== "not_complete" } };
    });
    assert.match(target.replies[0].content, state ? /Marked not complete/ : /Marked complete/);
  }
  assert.equal(calls[0].path, "/api/engineers/profile/400000000000000001/onboarding-progress");
  assert.deepEqual(calls.map((call) => call.body), [
    { step: "repository_access", completed: true },
    { step: "repository_access", completed: false },
  ]);
});

test("profile next steps advance through the engineering checklist", () => {
  const completedForm = { status: "COMPLETED", repositoryAccess: false, environmentSetup: false, firstTaskGiven: false, firstFixShipped: false };
  assert.match(onboardingNextStep(completedForm), /Jeremy/);
  assert.match(onboardingNextStep({ ...completedForm, repositoryAccess: true }), /Set up Venu 1\.x/);
  assert.match(onboardingNextStep({ ...completedForm, repositoryAccess: true, environmentSetup: true }), /identify and claim/);
  assert.match(onboardingNextStep({ ...completedForm, repositoryAccess: true, environmentSetup: true, firstTaskGiven: true }), /Ship your first fix/);
  assert.match(onboardingNextStep({ ...completedForm, repositoryAccess: true, environmentSetup: true, firstTaskGiven: true, firstFixShipped: true }), /checklist is complete/);
});

test("/eos connect sends GitHub and email updates to the profile API", async () => {
  const calls = [];
  const github = interaction({ options: { getString: (name) => name === "type" ? "github" : "@alex-gh" } });
  await handleConnect(github, async (path, options) => { calls.push({ path, options }); return { engineer: { name: "Alex" } }; });
  assert.equal(calls[0].path, "/api/engineers/profile/400000000000000001/github");
  assert.deepEqual(JSON.parse(calls[0].options.body), { githubUsername: "alex-gh" });
  assert.match(github.replies[0].content, /Jeremy still needs to grant/);

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
      return { ok: true, onboarding: { status: "IN_PROGRESS" } };
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
  assert.equal(embed.title, "Venu engineering onboarding — your next steps");
  assert.match(JSON.stringify(embed), /Jeremy must add/);
  assert.match(JSON.stringify(embed), /within one week/);
  assert.equal(reply.components[0].toJSON().components[0].url, "https://tally.so/r/example");
  assert.equal(reply.embeds.length, 1);
});

test("/eos onboarding recognizes a completed form and provides setup without repeating the form", async () => {
  const target = interaction({
    user: { id: "400000000000000001", username: "alex", globalName: "Alex Example" },
    options: { getString: (name) => name === "github" ? "Alex-GH" : "alex@example.test" },
  });
  await handleOnboarding(target, async () => ({ onboarding: { status: "COMPLETED" } }), "https://tally.so/r/example");
  const reply = target.replies[0];
  assert.equal(reply.embeds.length, 2);
  assert.match(reply.embeds[0].toJSON().description, /form are complete/);
  assert.match(reply.embeds[1].toJSON().title, /Venu 1\.x/);
  const buttons = reply.components[0].toJSON().components;
  assert.equal(buttons.some((button) => button.url === "https://tally.so/r/example"), false);
  assert.equal(buttons.some((button) => /RoboBearLLC\/VenuAI/.test(button.url)), true);
});

test("/eos onboarding fails safely before writing invalid or unconfigured data", async () => {
  let calls = 0;
  const request = async () => { calls += 1; return { onboarding: { status: "IN_PROGRESS" } }; };

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
  assert.match(missingForm.replies[0].content, /temporarily unavailable/i);
  assert.equal(calls, 1);
});

test("completed onboarding remains usable if the form integration is temporarily unavailable", async () => {
  const target = interaction({
    user: { id: "400000000000000001", username: "alex" },
    options: { getString: (name) => name === "github" ? "alex-gh" : "alex@example.test" },
  });
  await handleOnboarding(target, async () => ({ onboarding: { status: "COMPLETED" } }), "");
  assert.equal(target.replies[0].embeds.length, 2);
  assert.match(target.replies[0].embeds[0].toJSON().description, /form are complete/);
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
  assert.match(JSON.stringify(embed), /within one week/);
});

test("GitHub onboarding identity validation accepts usernames but rejects URLs and malformed names", () => {
  assert.equal(normalizeGitHubUsername("@Alex-GH"), "alex-gh");
  assert.equal(normalizeGitHubUsername("https://github.com/alex"), null);
  assert.equal(normalizeGitHubUsername("-alex"), null);
  assert.equal(normalizeGitHubUsername("alex--gh"), null);
});

test("identity and onboarding commands are always private", () => {
  for (const command of ["profile", "connect", "onboarding", "progress"]) {
    assert.equal(PRIVATE_EOS_SUBCOMMANDS.has(command), true);
  }
  assert.equal(PRIVATE_EOS_SUBCOMMANDS.has("status"), false);
  assert.equal(PRIVATE_EOS_SUBCOMMANDS.has("sync"), false);
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
