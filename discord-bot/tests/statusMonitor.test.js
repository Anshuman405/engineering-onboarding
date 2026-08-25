const assert = require("node:assert/strict");
const test = require("node:test");
const { StatusMonitorManager } = require("../src/status/monitor");

function fakeClock(start = 0) {
  let now = start;
  let id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeoutFn: (callback, delay) => {
      const timer = { id: ++id, due: now + delay, callback, unref() {} };
      timers.set(timer.id, timer);
      return timer;
    },
    clearTimeoutFn: (timer) => timers.delete(timer.id),
    async advance(milliseconds) {
      const destination = now + milliseconds;
      while (true) {
        const next = [...timers.values()].filter((timer) => timer.due <= destination).sort((a, b) => a.due - b.due)[0];
        if (!next) break;
        timers.delete(next.id);
        now = next.due;
        await next.callback();
      }
      now = destination;
    },
    timerCount: () => timers.size,
  };
}

function fakeMessage(id) {
  const edits = [];
  return { id, edits, edit: async (payload) => { edits.push(payload); return payload; } };
}

function monitorFixture(clock, overrides = {}) {
  let checks = 0;
  const manager = new StatusMonitorManager({
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    intervalMs: 10 * 60 * 1000,
    durationMs: 30 * 60 * 1000,
    check: async (targets) => {
      checks += 1;
      return targets.map((target) => ({ id: target.id, state: "HEALTHY", httpStatus: 200, responseTimeMs: 10, error: null }));
    },
    format: (input) => input,
    ...overrides,
  });
  return { manager, checks: () => checks };
}

test("a monitor edits one existing message on each check and expires at 30 minutes", async () => {
  const clock = fakeClock();
  const { manager, checks } = monitorFixture(clock);
  const message = fakeMessage("message-one");
  await manager.start({ message, targets: [{ id: "service" }] });
  assert.equal(message.edits.length, 1);
  assert.equal(checks(), 1);
  assert.equal(manager.activeCount, 1);
  assert.equal(clock.timerCount(), 1);

  await clock.advance(10 * 60 * 1000);
  assert.equal(message.edits.length, 2);
  assert.equal(checks(), 2);

  await clock.advance(20 * 60 * 1000);
  assert.equal(checks(), 3);
  assert.equal(message.edits.length, 4);
  assert.equal(message.edits.at(-1).embeds[0].expired, true);
  assert.equal(manager.activeCount, 0);
  assert.equal(clock.timerCount(), 0);
});

test("multiple users receive independent monitor sessions and timers", async () => {
  const clock = fakeClock();
  const { manager } = monitorFixture(clock);
  const first = fakeMessage("first");
  const second = fakeMessage("second");
  await manager.start({ message: first, targets: [{ id: "service" }] });
  await manager.start({ message: second, targets: [{ id: "service" }] });
  assert.equal(manager.activeCount, 2);
  assert.equal(clock.timerCount(), 2);
  await manager.expireAll("Restarting");
  assert.equal(manager.activeCount, 0);
  assert.equal(clock.timerCount(), 0);
  assert.equal(first.edits.at(-1).embeds[0].expirationReason, "Restarting");
  assert.equal(second.edits.at(-1).embeds[0].expirationReason, "Restarting");
});

test("Discord edit failure stops that session and leaves no timer", async () => {
  const clock = fakeClock();
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const { manager } = monitorFixture(clock);
    const message = { id: "deleted", edit: async () => { throw new Error("Unknown Message"); } };
    await manager.start({ message, targets: [{ id: "service" }] });
    assert.equal(manager.activeCount, 0);
    assert.equal(clock.timerCount(), 0);
  } finally {
    console.error = originalError;
  }
});
