const assert = require("node:assert/strict");
const test = require("node:test");
const { isRetryableDiscordError, registerGuildCommands } = require("../src/discordStartup");

test("Discord command registration retries transient failures and preserves one command body", async () => {
  const calls = [];
  const waits = [];
  const commands = [{ name: "eos" }, { name: "status" }];
  const rest = { put: async (route, options) => {
    calls.push({ route, options });
    if (calls.length < 3) throw Object.assign(new Error("temporary"), { status: 503 });
  } };
  await registerGuildCommands(rest, "/applications/app/guilds/guild/commands", commands, {
    attempts: 3,
    wait: async (milliseconds) => { waits.push(milliseconds); },
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.options.body), [commands, commands, commands]);
  assert.deepEqual(waits, [1000, 2000]);
});

test("Discord command registration fails immediately for permanent API errors", async () => {
  let calls = 0;
  const rest = { put: async () => {
    calls += 1;
    throw Object.assign(new Error("forbidden"), { status: 403 });
  } };
  await assert.rejects(registerGuildCommands(rest, "/commands", [], { attempts: 5, wait: async () => undefined }), /forbidden/);
  assert.equal(calls, 1);
  assert.equal(isRetryableDiscordError({ status: 403 }), false);
});

test("Discord command registration stops after its bounded retry budget", async () => {
  let calls = 0;
  const rest = { put: async () => {
    calls += 1;
    throw Object.assign(new Error("rate limited"), { status: 429 });
  } };
  await assert.rejects(registerGuildCommands(rest, "/commands", [], { attempts: 3, wait: async () => undefined }), /rate limited/);
  assert.equal(calls, 3);
});
