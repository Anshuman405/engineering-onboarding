require("dotenv").config();

const EOS_API_URL = process.env.EOS_API_URL;
const EOS_API_KEY = process.env.EOS_API_KEY;

if (!EOS_API_URL) {
  throw new Error("EOS_API_URL is not configured");
}

if (!EOS_API_KEY) {
  throw new Error("EOS_API_KEY is not configured");
}

async function eosRequest(path, options = {}) {
  const response = await fetch(`${EOS_API_URL}${path}`, {
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
    throw new Error(
      `EOS API ${response.status}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }

  return data;
}

module.exports = {
  eosRequest,
};
