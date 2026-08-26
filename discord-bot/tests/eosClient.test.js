const assert = require("node:assert/strict");
const test = require("node:test");
const { EosApiError, MAX_EOS_ERROR_DETAIL_LENGTH, eosRequest, timeoutMs } = require("../src/eos/client");

test("EOS client sends authenticated requests and clears its timeout", async () => {
  let received;
  const response = await eosRequest("/health", {}, async (url, options) => {
    received = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }, { apiUrl: "https://eos.example", apiKey: "test-key", timeoutMs: 100 });
  assert.deepEqual(response, { ok: true });
  assert.equal(received.url, "https://eos.example/health");
  assert.equal(received.options.headers["x-eos-api-key"], "test-key");
  assert.equal(received.options.signal.aborted, false);
});

test("EOS client aborts a stalled upstream request", async () => {
  const started = Date.now();
  await assert.rejects(
    eosRequest("/slow", {}, (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }), { apiUrl: "https://eos.example", apiKey: "test-key", timeoutMs: 10 }),
    (error) => error instanceof EosApiError && error.status === 0 && /timed out after 10ms/.test(error.message),
  );
  assert.ok(Date.now() - started < 1_000);
});

test("EOS timeout configuration rejects invalid values", () => {
  assert.equal(timeoutMs("2500"), 2500);
  assert.equal(timeoutMs("invalid"), 60_000);
  assert.equal(timeoutMs(0), 60_000);
});

test("EOS client never includes an upstream HTML error page in its error", async () => {
  const html = `<!DOCTYPE html><html><body>${"sensitive upstream detail ".repeat(1000)}</body></html>`;
  await assert.rejects(
    eosRequest("/unavailable", {}, async () => new Response(html, { status: 502 }), {
      apiUrl: "https://eos.example",
      apiKey: "test-key",
      timeoutMs: 100,
    }),
    (error) => error instanceof EosApiError
      && error.status === 502
      && error.message === "EOS API 502: upstream service returned an HTML error page"
      && error.message.length <= MAX_EOS_ERROR_DETAIL_LENGTH + 20,
  );
});

test("EOS client bounds structured upstream error details", async () => {
  await assert.rejects(
    eosRequest("/bad", {}, async () => new Response(JSON.stringify({ error: "x".repeat(5_000) }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }), { apiUrl: "https://eos.example", apiKey: "test-key", timeoutMs: 100 }),
    (error) => error instanceof EosApiError && error.message.length <= MAX_EOS_ERROR_DETAIL_LENGTH + 20,
  );
});
