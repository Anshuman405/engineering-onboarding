require("dotenv").config();

const EOS_API_URL = process.env.EOS_API_URL;
const EOS_API_KEY = process.env.EOS_API_KEY;
const DEFAULT_EOS_API_TIMEOUT_MS = 60_000;

class EosApiError extends Error {
  constructor(message, status, retryAfterMs) {
    super(message);
    this.name = "EosApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function timeoutMs(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_EOS_API_TIMEOUT_MS;
}

async function eosRequest(path, options = {}, request = fetch, config = {}) {
  const apiUrl = config.apiUrl || EOS_API_URL;
  const apiKey = config.apiKey || EOS_API_KEY;
  const requestTimeoutMs = timeoutMs(config.timeoutMs ?? process.env.EOS_API_TIMEOUT_MS);
  if (!apiUrl || !apiKey) {
    throw new EosApiError("EOS_API_URL and EOS_API_KEY must be configured", 0);
  }
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  let response;
  try {
    response = await request(`${apiUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        "x-eos-api-key": apiKey,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new EosApiError(`EOS API request timed out after ${requestTimeoutMs}ms`, 0);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const retryAfterMs = retryAfter ? Math.max(0, Number(retryAfter) * 1000) : undefined;
    throw new EosApiError(
      `EOS API ${response.status}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`,
      response.status,
      Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
    );
  }

  return data;
}

module.exports = {
  DEFAULT_EOS_API_TIMEOUT_MS,
  EosApiError,
  eosRequest,
  timeoutMs,
};
