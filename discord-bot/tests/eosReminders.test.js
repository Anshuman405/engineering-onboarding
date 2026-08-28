const assert = require("node:assert/strict");
const test = require("node:test");
const { EosReminderWorker, reminderEmbed, reminderPollMs } = require("../src/eos/reminders");

function reminder(id, userId) {
  return {
    id, claimToken: `claim-${id}`,
    personalTask: { number: 7, title: "Review the release", description: "Check the production logs", dueAt: "2026-08-29T12:00:00Z", engineer: { discordUserId: userId } },
  };
}

test("reminder worker isolates Discord failures and acknowledges every claimed reminder", async () => {
  const acknowledgements = [];
  const sent = [];
  const client = { users: { fetch: async (id) => {
    if (id === "2") throw new Error("DMs disabled");
    return { send: async (payload) => sent.push(payload) };
  } } };
  const worker = new EosReminderWorker(client, { request: async (path, options) => {
    if (path.endsWith("/claim")) return { data: [reminder("one", "1"), reminder("two", "2")] };
    acknowledgements.push({ path, body: JSON.parse(options.body) });
    return { ok: true };
  } });
  assert.equal(await worker.poll(), 2);
  assert.equal(sent.length, 1);
  assert.equal(acknowledgements.length, 2);
  assert.deepEqual(acknowledgements.map((item) => item.body.delivered).sort(), [false, true]);
  assert.match(acknowledgements.find((item) => !item.body.delivered).body.error, /DMs disabled/);
});

test("reminder formatting contains no secrets and gives task completion guidance", () => {
  const embed = reminderEmbed(reminder("one", "1")).toJSON();
  assert.match(embed.title, /Task #7/);
  assert.match(embed.description, /Review the release/);
  assert.match(embed.footer.text, /eos todo done/);
});

test("reminder worker has one recursive timer and releases it on shutdown", async () => {
  const timers = new Map();
  let sequence = 0;
  const worker = new EosReminderWorker({ users: { fetch: async () => null } }, {
    request: async () => ({ data: [] }),
    setTimeoutFn: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimeoutFn: (id) => timers.delete(id),
    pollMs: 30_000,
  });
  worker.start();
  worker.start();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 0);
  await worker.stop();
  assert.equal(timers.size, 0);
});

test("reminder polling rejects busy-loop and unbounded environment values", () => {
  assert.equal(reminderPollMs("not-a-number"), 30_000);
  assert.equal(reminderPollMs(1), 30_000);
  assert.equal(reminderPollMs(600_000), 30_000);
  assert.equal(reminderPollMs(60_000), 60_000);
});
