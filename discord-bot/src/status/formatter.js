const { EmbedBuilder } = require("discord.js");

const ENVIRONMENTS = ["STAGING", "TESTING", "PRODUCTION"];
const STATE_STYLE = {
  HEALTHY: { emoji: "🟢", label: "Healthy" },
  UNHEALTHY: { emoji: "🔴", label: "Unhealthy" },
  UNKNOWN: { emoji: "⚪", label: "Unknown" },
};

function remainingTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function resultLine(target, result) {
  const style = STATE_STYLE[result?.state] || STATE_STYLE.UNKNOWN;
  const details = [];
  if (result?.httpStatus !== null && result?.httpStatus !== undefined) details.push(`HTTP ${result.httpStatus}`);
  if (result?.responseTimeMs !== null && result?.responseTimeMs !== undefined) details.push(`${result.responseTimeMs}ms`);
  if (result?.error) details.push(String(result.error).slice(0, 120));
  if (details.length === 0) details.push("Checking…");
  return `${style.emoji} **${target.name}** — ${style.label} — ${details.join(" — ")}`;
}

function buildStatusEmbed({ targets, results = [], checkedAt, expiresAt, expired = false, expirationReason }) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  const now = checkedAt instanceof Date ? checkedAt : new Date(checkedAt || Date.now());
  const embed = new EmbedBuilder()
    .setTitle("VENU SERVER STATUS")
    .setTimestamp(now);

  for (const environment of ENVIRONMENTS) {
    const lines = targets
      .filter((target) => target.environment === environment)
      .map((target) => resultLine(target, resultById.get(target.id)));
    embed.addFields({ name: environment, value: lines.join("\n") || "No services configured" });
  }

  const states = results.map((result) => result.state);
  if (states.includes("UNHEALTHY")) embed.setColor(0xed4245);
  else if (states.length > 0 && states.every((state) => state === "HEALTHY")) embed.setColor(0x57f287);
  else embed.setColor(0xfee75c);

  if (expired) {
    embed
      .setDescription(`⏱️ **Status monitoring expired.**\n${expirationReason || "Run `/status` again to start a new 30-minute monitor."}`)
      .setFooter({ text: "Monitoring stopped" });
  } else {
    const remaining = Math.max(0, Number(expiresAt) - now.getTime());
    embed
      .setDescription(`Last checked: <t:${Math.floor(now.getTime() / 1000)}:T>`)
      .setFooter({ text: `Monitoring for ${remainingTime(remaining)} more` });
  }
  return embed;
}

module.exports = {
  ENVIRONMENTS,
  buildStatusEmbed,
  remainingTime,
  resultLine,
};
