const assert = require("node:assert/strict");
const test = require("node:test");
const {
  authorizeOnboardingWebhook,
  onboardingLogSummary,
} = require("../src/onboardingWebhook");

function request(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    get: (name) => normalized[name.toLowerCase()],
  };
}

test("the onboarding webhook accepts either supported secret header", () => {
  assert.equal(
    authorizeOnboardingWebhook(
      request({ authorization: "Bearer correct-secret" }),
      "correct-secret"
    ).ok,
    true
  );

  assert.equal(
    authorizeOnboardingWebhook(
      request({ "x-onboarding-secret": "correct-secret" }),
      "correct-secret"
    ).ok,
    true
  );
});

test("the onboarding webhook fails closed for missing configuration or bad credentials", () => {
  assert.equal(authorizeOnboardingWebhook(request(), "").status, 503);
  assert.equal(
    authorizeOnboardingWebhook(
      request({ authorization: "Bearer wrong-secret" }),
      "correct-secret"
    ).status,
    401
  );
  assert.equal(
    authorizeOnboardingWebhook(request(), "correct-secret").status,
    401
  );
});

test("onboarding logs expose structure but no submitted identity values", () => {
  const summary = onboardingLogSummary({
    discord: "sensitive-discord-name",
    email: "sensitive@example.test",
    github: "sensitive-github",
    team: "Product",
  });

  const serialized = JSON.stringify(summary);
  assert.deepEqual(summary.fields, ["discord", "email", "github", "team"]);
  assert.equal(summary.hasDiscordIdentifier, true);
  assert.equal(summary.hasEmail, true);
  assert.equal(summary.hasGitHub, true);
  assert.doesNotMatch(serialized, /sensitive/);
});
