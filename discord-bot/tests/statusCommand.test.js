const assert = require("node:assert/strict");
const test = require("node:test");
const { loadStatusConfig } = require("../src/status/config");
const { handleStatusCommand, handleStatusRefresh, statusCommand } = require("../src/status/command");

test("/status is registered and creates exactly one message before monitoring it", async () => {
  assert.equal(statusCommand.toJSON().name, "status");
  const replies = [];
  const message = { id: "status-message" };
  const interaction = {
    reply: async (payload) => { replies.push(payload); },
    fetchReply: async () => message,
  };
  const starts = [];
  const monitor = { start: async (options) => { starts.push(options); return message.id; } };
  const config = loadStatusConfig({ STATUS_CHECK_INTERVAL_MS: "12345" });
  await handleStatusCommand(interaction, monitor, config);
  assert.equal(replies.length, 1);
  assert.equal(starts.length, 1);
  assert.equal(starts[0].message, message);
  assert.equal(starts[0].targets.length, 6);
  assert.equal(starts[0].intervalMs, 12345);
  assert.equal(replies[0].components[0].toJSON().components[0].custom_id, "status:refresh");
});

test("the refresh button acknowledges the interaction and refreshes the existing monitor", async () => {
  const actions = [];
  const interaction = {
    customId: "status:refresh",
    message: { id: "status-message" },
    deferUpdate: async () => actions.push("deferred"),
    followUp: async () => actions.push("followup"),
  };
  const refreshed = await handleStatusRefresh(interaction, {
    refresh: async (id) => { actions.push(id); return true; },
  });
  assert.equal(refreshed, true);
  assert.deepEqual(actions, ["deferred", "status-message"]);
});

test("an expired refresh button fails privately", async () => {
  const followUps = [];
  await handleStatusRefresh({
    customId: "status:refresh", message: { id: "expired" }, deferUpdate: async () => undefined,
    followUp: async (payload) => followUps.push(payload),
  }, { refresh: async () => false });
  assert.equal(followUps[0].ephemeral, true);
  assert.match(followUps[0].content, /expired/i);
});

test("invalid configuration fails privately without starting a monitor", async () => {
  const replies = [];
  let starts = 0;
  const config = loadStatusConfig({ STATUS_STAGING_FRONTEND_URL: "not-a-url" });
  await handleStatusCommand(
    { reply: async (payload) => replies.push(payload) },
    { start: async () => { starts += 1; } },
    config
  );
  assert.equal(replies.length, 1);
  assert.equal(replies[0].ephemeral, true);
  assert.match(replies[0].content, /not configured correctly/i);
  assert.equal(starts, 0);
});
