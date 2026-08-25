const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_STATUS_TARGETS,
  STATUS_MONITOR_DURATION_MS,
  loadStatusConfig,
  validateStatusTargets,
} = require("../src/status/config");

test("all six Venu services have one validated configuration", () => {
  const config = loadStatusConfig({});
  assert.equal(config.targets.length, 6);
  assert.equal(config.durationMs, 30 * 60 * 1000);
  assert.equal(config.validationErrors.length, 0);
  assert.ok(config.targets.every((target) => target.method === "HEAD"));
  assert.deepEqual(
    config.targets.map(({ id, url }) => ({ id, url })),
    [
      { id: "staging-frontend", url: "https://staging.venu3d.com/" },
      { id: "staging-backend", url: "https://venu-backend-staging-g7cbd6dmhyf0a4hf.centralus-01.azurewebsites.net/health/" },
      { id: "testing-frontend", url: "https://testing.venu3d.com/" },
      { id: "testing-backend", url: "https://venu-backend-daenhabecsdnaddy.westus2-01.azurewebsites.net/health/" },
      { id: "production-frontend", url: "https://ai.venu3d.com/" },
      { id: "production-backend", url: "https://venu-backend-prod-gycmf8edhcb4b0c0.centralus-01.azurewebsites.net/admin/login/" },
    ]
  );
  assert.equal(STATUS_MONITOR_DURATION_MS, 1_800_000);
});

test("service URLs and timing are environment configurable", () => {
  const config = loadStatusConfig({
    STATUS_TESTING_FRONTEND_URL: "https://replacement.example.test/ready",
    STATUS_CHECK_INTERVAL_MS: "15000",
    STATUS_HTTP_TIMEOUT_MS: "2500",
  });
  assert.equal(config.targets.find((target) => target.id === "testing-frontend").url, "https://replacement.example.test/ready");
  assert.ok(config.targets.every((target) => target.timeoutMs === 2500));
  assert.equal(config.checkIntervalMs, 15000);
  assert.equal(config.validationErrors.length, 0);
});

test("configuration validation rejects invalid URLs, duplicates, and missing service pairs", () => {
  const targets = DEFAULT_STATUS_TARGETS.slice(0, 5).map((target) => ({ ...target, timeoutMs: 1000 }));
  targets[0].url = "not a URL";
  targets[1].id = targets[0].id;
  const errors = validateStatusTargets(targets);
  assert.ok(errors.some((error) => /URL is invalid/.test(error)));
  assert.ok(errors.some((error) => /duplicate id/.test(error)));
  assert.ok(errors.some((error) => /production-backend/.test(error)));
});
