const assert = require("node:assert/strict");
const test = require("node:test");
const { syncTallyToEOS } = require("../src/eos/onboarding");

test("a successful Tally callback marks the EOS onboarding payload complete", async () => {
  let request;
  await syncTallyToEOS(
    {
      name: "Alex",
      email: "alex@example.test",
      github: "alex-gh",
    },
    { id: "400000000000000001" },
    async (path, options) => {
      request = { path, options };
      return { ok: true };
    }
  );

  assert.equal(request.path, "/api/engineers/onboarding");
  assert.equal(JSON.parse(request.options.body).completed, true);
});
