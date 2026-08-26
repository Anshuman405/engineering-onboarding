function isRetryableDiscordError(error) {
  const status = Number(error?.status ?? error?.rawError?.status);
  if (status === 429 || status >= 500) return true;
  return !Number.isInteger(status) || status === 0;
}

async function registerGuildCommands(rest, route, commands, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 3));
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rest.put(route, { body: commands });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableDiscordError(error) || attempt === attempts) throw error;
      await wait(Math.min(5_000, attempt * 1_000));
    }
  }
  throw lastError;
}

module.exports = { isRetryableDiscordError, registerGuildCommands };
