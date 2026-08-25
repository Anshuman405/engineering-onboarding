const assert = require("node:assert/strict");
const test = require("node:test");
const { checkService, checkServices } = require("../src/status/healthChecker");

function target(overrides = {}) {
  return {
    id: "testing-backend",
    url: "https://service.example.test/health/",
    method: "GET",
    expectedStatuses: [200],
    timeoutMs: 100,
    ...overrides,
  };
}

test("a successful expected response is healthy and records latency/status", async () => {
  let clock = 100;
  let requestOptions;
  const result = await checkService(target(), {
    now: () => (clock += 12),
    fetchImpl: async (_url, options) => { requestOptions = options; return { status: 200 }; },
  });
  assert.equal(result.state, "HEALTHY");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.responseTimeMs, 12);
  assert.equal(result.error, null);
  assert.equal(requestOptions.method, "GET");
});

test("an unexpected HTTP response is unhealthy without throwing", async () => {
  const result = await checkService(target(), {
    fetchImpl: async () => ({ status: 502 }),
  });
  assert.equal(result.state, "UNHEALTHY");
  assert.equal(result.httpStatus, 502);
  assert.match(result.error, /HTTP 502/);
});

test("request timeout aborts the request and reports a bounded failure", async () => {
  const result = await checkService(target({ timeoutMs: 5 }), {
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }),
  });
  assert.equal(result.state, "UNHEALTHY");
  assert.equal(result.httpStatus, null);
  assert.equal(result.error, "Request timed out");
});

test("one service failure does not stop the other services", async () => {
  const results = await checkServices([
    target({ id: "one", url: "https://one.example.test" }),
    target({ id: "two", url: "https://two.example.test" }),
    target({ id: "three", url: "https://three.example.test" }),
  ], {
    fetchImpl: async (url) => {
      if (url.includes("two")) {
        const error = new Error("connect ECONNREFUSED secret.internal");
        error.code = "ECONNREFUSED";
        throw error;
      }
      return { status: 200 };
    },
  });
  assert.deepEqual(results.map((result) => result.state), ["HEALTHY", "UNHEALTHY", "HEALTHY"]);
  assert.equal(results[1].error, "Connection refused");
});

test("invalid target configuration is unknown and makes no HTTP request", async () => {
  let requests = 0;
  const result = await checkService(target({ configurationError: "URL is invalid" }), {
    fetchImpl: async () => { requests += 1; },
  });
  assert.equal(result.state, "UNKNOWN");
  assert.equal(result.error, "URL is invalid");
  assert.equal(requests, 0);
});
