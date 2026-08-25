const assert = require("node:assert/strict");
const test = require("node:test");
const { loadStatusConfig } = require("../src/status/config");
const { buildStatusEmbed, remainingTime } = require("../src/status/formatter");

test("status formatting groups all services and includes useful result details", () => {
  const { targets } = loadStatusConfig({});
  const results = targets.map((target, index) => ({
    id: target.id,
    state: index === 3 ? "UNHEALTHY" : "HEALTHY",
    responseTimeMs: 80 + index,
    httpStatus: index === 3 ? 502 : 200,
    error: index === 3 ? "Unexpected HTTP 502" : null,
  }));
  const embed = buildStatusEmbed({
    targets,
    results,
    checkedAt: new Date(1_000_000),
    expiresAt: 1_060_000,
  }).toJSON();
  assert.equal(embed.title, "VENU SERVER STATUS");
  assert.deepEqual(embed.fields.map((field) => field.name), ["STAGING", "TESTING", "PRODUCTION"]);
  assert.match(embed.fields[1].value, /🔴.*Backend.*HTTP 502/s);
  assert.match(embed.fields[0].value, /🟢.*Frontend.*80ms/s);
  assert.match(embed.footer.text, /01:00 more/);
});

test("expired formatting clearly stops the monitor and instructs the user", () => {
  const { targets } = loadStatusConfig({});
  const embed = buildStatusEmbed({
    targets,
    checkedAt: new Date(),
    expiresAt: Date.now(),
    expired: true,
  }).toJSON();
  assert.match(embed.description, /monitoring expired/i);
  assert.match(embed.description, /Run `\/status` again/);
  assert.equal(embed.footer.text, "Monitoring stopped");
  assert.equal(remainingTime(27 * 60 * 1000 + 41 * 1000), "27:41");
});
