function elapsedMilliseconds(startedAt, now) {
  return Math.max(0, Math.round(now() - startedAt));
}

function safeErrorMessage(error) {
  if (error?.name === "AbortError") return "Request timed out";
  const code = error?.cause?.code || error?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS lookup failed";
  if (code === "ECONNREFUSED") return "Connection refused";
  if (code === "ECONNRESET") return "Connection reset";
  const message = String(error?.message || "Request failed")
    .replace(/https?:\/\/\S+/gi, "service endpoint")
    .slice(0, 160);
  return message || "Request failed";
}

async function checkService(target, options = {}) {
  const request = options.fetchImpl || fetch;
  const now = options.now || (() => performance.now());
  const setTimeoutFn = options.setTimeoutFn || setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;

  const validationError = target.configurationError;
  if (validationError) {
    return {
      id: target.id,
      state: "UNKNOWN",
      responseTimeMs: null,
      httpStatus: null,
      error: validationError,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeoutFn(() => controller.abort(), target.timeoutMs);
  timeout?.unref?.();
  const startedAt = now();

  try {
    const response = await request(target.url, {
      method: target.method || "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Venu-Engineering-Status-Monitor/1.0" },
    });
    const healthy = target.expectedStatuses.includes(response.status);
    return {
      id: target.id,
      state: healthy ? "HEALTHY" : "UNHEALTHY",
      responseTimeMs: elapsedMilliseconds(startedAt, now),
      httpStatus: response.status,
      error: healthy ? null : `Unexpected HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      id: target.id,
      state: "UNHEALTHY",
      responseTimeMs: elapsedMilliseconds(startedAt, now),
      httpStatus: null,
      error: safeErrorMessage(error),
    };
  } finally {
    clearTimeoutFn(timeout);
  }
}

async function checkServices(targets, options = {}) {
  return Promise.all(targets.map(async (target) => {
    try {
      return await checkService(target, options);
    } catch (error) {
      return {
        id: target.id,
        state: "UNKNOWN",
        responseTimeMs: null,
        httpStatus: null,
        error: safeErrorMessage(error),
      };
    }
  }));
}

module.exports = {
  checkService,
  checkServices,
  safeErrorMessage,
};
