require("dotenv").config();

const EOS_API_URL = process.env.EOS_API_URL;
const EOS_API_KEY = process.env.EOS_API_KEY;

class EosApiError extends Error {
  constructor(message, status, retryAfterMs) {
    super(message);
    this.name = "EosApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

async function eosRequest(path, options = {}, request = fetch) {
  if (!EOS_API_URL || !EOS_API_KEY) {
    throw new EosApiError("EOS_API_URL and EOS_API_KEY must be configured", 0);
  }
  const response = await request(`${EOS_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-eos-api-key": EOS_API_KEY,
      ...(options.headers || {}),
    },
  });

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
  EosApiError,
  eosRequest,
};
