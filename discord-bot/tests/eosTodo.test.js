const assert = require("node:assert/strict");
const test = require("node:test");
const { eosCommand, handleEosCommand, handleTodo, parseTodoTime, publicEosErrorMessage, todoApiError, todoLine } = require("../src/eos/commands");
const { EosApiError } = require("../src/eos/client");

function interaction(values = {}) {
  const replies = [];
  return {
    id: "interaction-123",
    user: { id: "400000000000000001" },
    options: {
      getString: (name, required) => values[name] ?? (required ? (() => { throw new Error(`missing ${name}`); })() : null),
      getInteger: (name) => values[name] ?? null,
    },
    editReply: async (value) => { replies.push(value); return value; },
    replies,
  };
}

test("/eos todo registers add, list, completion, snooze, reopen, and delete workflows", () => {
  const group = eosCommand.toJSON().options.find((option) => option.name === "todo");
  assert.ok(group);
  assert.deepEqual(group.options.map((option) => option.name), ["add", "list", "done", "reopen", "snooze", "delete"]);
  assert.equal(group.options.find((option) => option.name === "add").options[0].required, true);
});

test("todo times support bounded relative, Discord, and timezone-explicit ISO values", () => {
  const now = Date.parse("2026-08-28T12:00:00Z");
  assert.equal(parseTodoTime("30m", now).toISOString(), "2026-08-28T12:30:00.000Z");
  assert.equal(parseTodoTime("<t:1788000000:F>", now).getTime(), 1_788_000_000_000);
  assert.equal(parseTodoTime("2026-08-29T09:00:00-07:00", now).toISOString(), "2026-08-29T16:00:00.000Z");
  assert.throws(() => parseTodoTime("tomorrow morning", now), /relative time|ISO timestamp/);
  assert.throws(() => parseTodoTime("0m", now), /between 1 minute/);
});

test("todo add is idempotency-ready and defaults its reminder to the due time", async () => {
  const target = interaction({ title: "Review deployment", notes: "Check logs", due: "2h" });
  let call;
  await handleTodo(target, "add", async (path, options) => {
    call = { path, body: JSON.parse(options.body) };
    return { data: { number: 1, title: "Review deployment", status: "OPEN", dueAt: options && JSON.parse(options.body).dueAt, reminders: [] } };
  }, Date.parse("2026-08-28T12:00:00Z"));
  assert.equal(call.path, "/api/personal-tasks");
  assert.equal(call.body.clientRequestId, "interaction-123");
  assert.equal(call.body.dueAt, "2026-08-28T14:00:00.000Z");
  assert.equal(call.body.remindAt, call.body.dueAt);
  assert.match(target.replies[0].content, /Added/);
});

test("todo list is private-ready, bounded, and formats task state", async () => {
  const target = interaction({ show: "ALL" });
  await handleTodo(target, "list", async (path) => {
    assert.match(path, /status=ALL&limit=25/);
    return { data: [{ number: 2, title: "Ship fix", status: "OPEN", dueAt: "2026-08-29T12:00:00Z", reminders: [] }] };
  });
  assert.match(target.replies[0].embeds[0].toJSON().description, /#2.*Ship fix/);
  assert.match(todoLine({ number: 3, title: "Done", status: "COMPLETED", reminders: [] }), /✅/);
});

test("todo state changes and snoozes call only the current engineer's API contract", async () => {
  const calls = [];
  for (const [action, values] of [["done", { task: 4 }], ["reopen", { task: 4 }], ["snooze", { task: 4, for: "30m" }], ["delete", { task: 4 }]]) {
    const target = interaction(values);
    await handleTodo(target, action, async (path, options = {}) => {
      calls.push({ action, path, body: options.body ? JSON.parse(options.body) : null });
      return { data: { number: 4, title: "Task four", status: "OPEN" } };
    }, Date.parse("2026-08-28T12:00:00Z"));
  }
  assert.deepEqual(calls.map((call) => call.path), [
    "/api/personal-tasks/4", "/api/personal-tasks/4", "/api/personal-tasks/4/snooze",
    "/api/personal-tasks/4?discordUserId=400000000000000001",
  ]);
  assert.equal(calls[0].body.action, "complete");
  assert.equal(calls[1].body.action, "reopen");
  assert.equal(calls[2].body.remindAt, "2026-08-28T12:30:00.000Z");
});

test("todo commands are always ephemeral and invalid times return actionable guidance", async () => {
  let deferred;
  const target = interaction({ task: 1 });
  Object.assign(target, {
    deferred: false,
    replied: false,
    options: {
      getSubcommand: () => "done",
      getSubcommandGroup: () => "todo",
      getInteger: () => 1,
    },
    deferReply: async (options) => { deferred = options; target.deferred = true; },
  });
  await handleEosCommand(target, async (path) => path === "/health"
    ? { ok: true, service: "venu-engineering-os" }
    : { data: { number: 1, title: "Private task" } });
  assert.equal(deferred.ephemeral, true);

  let inputError;
  try { parseTodoTime("tomorrow"); } catch (error) { inputError = error; }
  assert.match(publicEosErrorMessage(inputError), /relative time/);
  assert.match(publicEosErrorMessage(todoApiError(new EosApiError("safe server response", 404))), /eos onboarding/);
});
