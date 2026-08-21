const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { eosRequest } = require("./client");

const eosCommand = new SlashCommandBuilder()
  .setName("eos")
  .setDescription("Engineering OS commands")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Show the current Engineering OS status")
  );

async function handleEosCommand(interaction) {
  if (interaction.options.getSubcommand() !== "status") {
    return;
  }

  await interaction.deferReply();

  try {
    const result = await eosRequest("/api/eos/status");

    const data = result.data;

    const embed = new EmbedBuilder()
      .setTitle("Engineering OS Status")
      .addFields(
        {
          name: "Engineers",
          value: String(data.engineers),
          inline: true,
        },
        {
          name: "Onboarding",
          value: String(data.onboarding),
          inline: true,
        },
        {
          name: "Active Tasks",
          value: String(data.activeTasks),
          inline: true,
        },
        {
          name: "Blocked Tasks",
          value: String(data.blockedTasks),
          inline: true,
        },
        {
          name: "Unassigned Tasks",
          value: String(data.unassignedTasks),
          inline: true,
        },
        {
          name: "Events (24h)",
          value: String(data.recentEvents),
          inline: true,
        },
        {
          name: "Database",
          value: data.database === "connected" ? "Connected" : "Unknown",
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    console.error("EOS command error:", error);

    await interaction.editReply({
      content: `Unable to reach EOS: ${error.message}`,
    });
  }
}

module.exports = {
  eosCommand,
  handleEosCommand,
};
