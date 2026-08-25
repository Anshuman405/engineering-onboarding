const { SlashCommandBuilder } = require("discord.js");
const { loadStatusConfig } = require("./config");
const { buildStatusEmbed } = require("./formatter");

const statusCommand = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Monitor Venu staging, testing, and production health for 30 minutes");

async function handleStatusCommand(interaction, monitor, config = loadStatusConfig()) {
  if (config.validationErrors.length > 0) {
    const invalidIds = [...new Set(config.validationErrors.map((error) => error.split(":")[0]))];
    return interaction.reply({
      content: `Status monitoring is not configured correctly for: ${invalidIds.join(", ")}. Please contact an administrator.`,
      ephemeral: true,
    });
  }

  const now = Date.now();
  await interaction.reply({
    embeds: [buildStatusEmbed({
      targets: config.targets,
      checkedAt: new Date(now),
      expiresAt: now + config.durationMs,
    })],
  });
  const message = await interaction.fetchReply();
  return monitor.start({
    message,
    targets: config.targets,
    intervalMs: config.checkIntervalMs,
  });
}

module.exports = {
  handleStatusCommand,
  statusCommand,
};
