const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { eosRequest } = require("./client");

const eosCommand = new SlashCommandBuilder()
  .setName("eos")
  .setDescription("Engineering OS commands")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Show the current Engineering OS status")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("sync")
      .setDescription("Sync Discord engineers into EOS")
  );

async function handleEosCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "status") {
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
            value: data.database === "connected"
              ? "Connected"
              : "Unknown",
            inline: false,
          }
        )
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error("EOS status error:", error);

      await interaction.editReply({
        content: `Unable to reach EOS: ${error.message}`,
      });
    }

    return;
  }

  if (subcommand === "sync") {
    await interaction.deferReply();

    try {
      const guild = interaction.guild;

      if (!guild) {
        await interaction.editReply(
          "This command can only be used inside the Venu server."
        );
        return;
      }

      await guild.members.fetch();

      const productRole = guild.roles.cache.find(
        (role) => role.name.toLowerCase() === "product"
      );

      if (!productRole) {
        await interaction.editReply(
          "I couldn't find the Product role."
        );
        return;
      }

      const engineers = guild.members.cache
        .filter((member) => !member.user.bot)
        .filter((member) => member.roles.cache.has(productRole.id))
        .map((member) => ({
          discordUserId: member.id,
          name: member.displayName || member.user.username,
          email: null,
          githubUsername: null,
        }));

      const result = await eosRequest("/api/sync/discord", {
        method: "POST",
        body: JSON.stringify({
          members: engineers,
        }),
      });

      const embed = new EmbedBuilder()
        .setTitle("Discord → EOS Sync Complete")
        .addFields(
          {
            name: "Product Members Found",
            value: String(engineers.length),
            inline: true,
          },
          {
            name: "Created",
            value: String(result.created),
            inline: true,
          },
          {
            name: "Updated",
            value: String(result.updated),
            inline: true,
          }
        )
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error("EOS sync error:", error);

      await interaction.editReply({
        content: `Discord sync failed: ${error.message}`,
      });
    }
  }
}

module.exports = {
  eosCommand,
  handleEosCommand,
};
