const { SlashCommandBuilder } = require("discord.js");
const { loadStatusConfig } = require("./config");
const { STATUS_REFRESH_CUSTOM_ID, buildStatusComponents, buildStatusEmbed } = require("./formatter");

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
    components: buildStatusComponents(),
  });
  const message = await interaction.fetchReply();
  return monitor.start({
    message,
    targets: config.targets,
    intervalMs: config.checkIntervalMs,
  });
}

async function handleStatusRefresh(interaction, monitor) {
  if (interaction.customId !== STATUS_REFRESH_CUSTOM_ID) return false;
  await interaction.deferUpdate();
  const refreshed = await monitor.refresh(interaction.message.id);
  if (!refreshed) {
    await interaction.followUp({ content: "This status monitor has expired. Run `/status` to start another one.", ephemeral: true }).catch(() => undefined);
  }
  return true;
}

module.exports = {
  handleStatusCommand,
  handleStatusRefresh,
  statusCommand,
};
