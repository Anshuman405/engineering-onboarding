const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { eosRequest } = require("./client");

/*
|--------------------------------------------------------------------------
| /eos command definition
|--------------------------------------------------------------------------
*/

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
      .setName("profile")
      .setDescription("Show your Engineering OS profile")
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName("connect")
      .setDescription("Connect your information to Engineering OS")
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("Information to connect")
          .setRequired(true)
          .addChoices(
            {
              name: "GitHub",
              value: "github",
            },
            {
              name: "Email",
              value: "email",
            }
          )
      )
      .addStringOption((option) =>
        option
          .setName("value")
          .setDescription("Your GitHub username or email address")
          .setRequired(true)
      )
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName("onboarding")
      .setDescription("Start your guided Venu engineering onboarding")
      .addStringOption((option) =>
        option
          .setName("github")
          .setDescription("Your GitHub username")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("email")
          .setDescription("Your email address")
          .setRequired(true)
      )
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName("sync")
      .setDescription("Sync the Discord server with Engineering OS")
  );

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function truncate(value, max = 1024) {
  if (value === null || value === undefined) {
    return "—";
  }

  const stringValue = String(value);

  if (stringValue.length <= max) {
    return stringValue;
  }

  return `${stringValue.slice(0, max - 3)}...`;
}

/*
|--------------------------------------------------------------------------
| /eos status
|--------------------------------------------------------------------------
*/

async function handleStatus(interaction, request = eosRequest) {
  const result = await request("/api/eos/status");

  const status = result.data || result;

  const embed = new EmbedBuilder()
    .setTitle("Engineering OS Status")
    .addFields(
      {
        name: "Engineers",
        value: String(status.engineers ?? 0),
        inline: true,
      },
      {
        name: "Onboarding",
        value: String(status.onboarding ?? 0),
        inline: true,
      },
      {
        name: "Active Tasks",
        value: String(status.activeTasks ?? 0),
        inline: true,
      },
      {
        name: "Blocked Tasks",
        value: String(status.blockedTasks ?? 0),
        inline: true,
      },
      {
        name: "Unassigned Tasks",
        value: String(status.unassignedTasks ?? 0),
        inline: true,
      },
      {
        name: "Events (24h)",
        value: String(status.recentEvents ?? 0),
        inline: true,
      },
      {
        name: "Database",
        value: status.database === "connected"
          ? "Connected"
          : String(status.database ?? "Unknown"),
        inline: true,
      },
      {
        name: "Discord Messages",
        value: String(status.discord?.messages ?? 0),
        inline: true,
      },
      {
        name: "Discord Ingestion",
        value: truncate(status.discord?.latestIngestion?.status ?? "No batches"),
        inline: true,
      }
    )
    .setTimestamp();

  await interaction.editReply({
    embeds: [embed],
  });
}

/*
|--------------------------------------------------------------------------
| /eos profile
|--------------------------------------------------------------------------
*/

async function handleProfile(interaction, request = eosRequest) {
  const discordUserId = interaction.user.id;

  const result = await request(
    `/api/engineers/profile/${encodeURIComponent(discordUserId)}`
  );

  const engineer = result.engineer || result.data?.engineer;
  const onboarding =
    result.onboarding || result.data?.onboarding;

  if (!engineer) {
    return interaction.editReply({
      content:
        "You don't have an EOS engineer profile yet. Ask an admin to run `/eos sync`.",
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("Your Engineering OS Profile")
    .setDescription(
      `Discord: <@${interaction.user.id}>`
    )
    .addFields(
      {
        name: "Name",
        value: truncate(engineer.name),
        inline: true,
      },
      {
        name: "Status",
        value: truncate(engineer.status),
        inline: true,
      },
      {
        name: "Email",
        value: truncate(engineer.email),
        inline: true,
      },
      {
        name: "GitHub",
        value: engineer.githubUsername
          ? `[@${engineer.githubUsername}](https://github.com/${engineer.githubUsername})`
          : "Not connected",
        inline: true,
      },
      {
        name: "Discord",
        value: `<@${engineer.discordUserId}>`,
        inline: true,
      },
      {
        name: "Onboarding",
        value: onboarding
          ? truncate(onboarding.status)
          : "Not found",
        inline: true,
      }
    )
    .setTimestamp();

  await interaction.editReply({
    embeds: [embed],
  });
}

/*
|--------------------------------------------------------------------------
| /eos connect github
|--------------------------------------------------------------------------
*/

async function handleConnectGitHub(interaction, value, request = eosRequest) {
  const githubUsername = value.trim().replace(/^@/, "");

  if (!githubUsername) {
    return interaction.editReply({
      content: "Please provide your GitHub username.",
    });
  }

  const discordUserId = interaction.user.id;

  const result = await request(
    `/api/engineers/profile/${encodeURIComponent(
      discordUserId
    )}/github`,
    {
      method: "PATCH",
      body: JSON.stringify({
        githubUsername,
      }),
    }
  );

  const engineer = result.engineer || result.data?.engineer;

  return interaction.editReply({
    content:
      `GitHub connected successfully.\n\n` +
      `**GitHub:** https://github.com/${githubUsername}` +
      (engineer?.name
        ? `\n**EOS Engineer:** ${engineer.name}`
        : ""),
  });
}

/*
|--------------------------------------------------------------------------
| /eos connect email
|--------------------------------------------------------------------------
*/

async function handleConnectEmail(interaction, value, request = eosRequest) {
  const email = value.trim().toLowerCase();

  if (!email) {
    return interaction.editReply({
      content: "Please provide your email address.",
    });
  }

  /*
   * Basic validation.
   *
   * This intentionally isn't overly restrictive because corporate
   * email systems can use unusual but valid formats.
   */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return interaction.editReply({
      content:
        "That doesn't look like a valid email address. Please try again.",
    });
  }

  const discordUserId = interaction.user.id;

  const result = await request(
    `/api/engineers/profile/${encodeURIComponent(
      discordUserId
    )}/email`,
    {
      method: "PATCH",
      body: JSON.stringify({
        email,
      }),
    }
  );

  const engineer = result.engineer || result.data?.engineer;

  return interaction.editReply({
    content:
      `Email connected successfully.\n\n` +
      `**Email:** ${email}` +
      (engineer?.name
        ? `\n**EOS Engineer:** ${engineer.name}`
        : ""),
  });
}

/*
|--------------------------------------------------------------------------
| /eos connect
|--------------------------------------------------------------------------
*/

async function handleConnect(interaction, request = eosRequest) {
  const type = interaction.options.getString("type", true);
  const value = interaction.options.getString("value", true);

  if (type === "github") {
    return handleConnectGitHub(interaction, value, request);
  }

  if (type === "email") {
    return handleConnectEmail(interaction, value, request);
  }

  return interaction.editReply({
    content: "Unknown connection type.",
  });
}

/*
|--------------------------------------------------------------------------
| /eos onboarding
|--------------------------------------------------------------------------
*/

async function handleOnboarding(
  interaction,
  request = eosRequest,
  tallyFormUrl = process.env.TALLY_FORM_URL
) {
  const githubUsername = interaction.options
    .getString("github", true)
    .trim()
    .replace(/^@/, "");
  const email = interaction.options
    .getString("email", true)
    .trim()
    .toLowerCase();

  if (!githubUsername) {
    return interaction.editReply({
      content: "Please provide your GitHub username.",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return interaction.editReply({
      content: "That doesn't look like a valid email address. Please try again.",
    });
  }

  if (!/^https?:\/\//i.test(tallyFormUrl || "")) {
    return interaction.editReply({
      content:
        "The Venu onboarding form is not configured yet. Please contact an administrator.",
    });
  }

  const name =
    interaction.member?.displayName ||
    interaction.user.globalName ||
    interaction.user.username;

  await request("/api/engineers/onboarding", {
    method: "POST",
    body: JSON.stringify({
      discordUserId: interaction.user.id,
      name,
      email,
      githubUsername,
      completed: false,
    }),
  });

  const embed = new EmbedBuilder()
    .setTitle("Venu engineering onboarding")
    .setDescription("Your EOS profile is connected. Continue with the Venu onboarding form.")
    .addFields(
      {
        name: "Step 1 — EOS profile",
        value: `Email and GitHub [@${githubUsername}](https://github.com/${githubUsername}) are connected.`,
      },
      {
        name: "Step 2 — Venu onboarding form",
        value:
          "Complete the Tally form using the same Discord identity. The existing onboarding automation will configure your server access.",
      },
      {
        name: "Step 3 — Venu 1.x local setup",
        value:
          "After the form is processed, this bot will DM you the local-development checklist.",
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Open Venu onboarding form")
      .setStyle(ButtonStyle.Link)
      .setURL(tallyFormUrl)
  );

  return interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}

/*
|--------------------------------------------------------------------------
| /eos sync
|--------------------------------------------------------------------------
|
| Pulls every member from the Discord guild and sends them to EOS.
|
| The Product role is used to determine which Discord members are
| engineering members.
|
|--------------------------------------------------------------------------
*/

async function handleSync(interaction, request = eosRequest) {
  /*
   * Only allow administrators to run the full sync.
   */
  if (!interaction.memberPermissions?.has("Administrator")) {
    return interaction.editReply({
      content:
        "You need Administrator permissions to run `/eos sync`.",
    });
  }

  const guild = interaction.guild;

  if (!guild) {
    return interaction.editReply({
      content:
        "This command can only be used inside the Venu Discord server.",
    });
  }

  await interaction.editReply({
    content: "Syncing Discord members with Engineering OS...",
  });

  try {
    const members = await guild.members.fetch();

    const productMembers = members.filter((member) => {
      if (member.user.bot) {
        return false;
      }

      return member.roles.cache.some(
        (role) =>
          role.name.toLowerCase() === "product"
      );
    });

    const payload = Array.from(productMembers.values()).map(
      (member) => ({
        discordUserId: member.id,
        name:
          member.displayName ||
          member.user.globalName ||
          member.user.username,
        email: null,
        githubUsername: null,
      })
    );

    const result = await request("/api/sync/discord", {
      method: "POST",
      body: JSON.stringify({
        members: payload,
      }),
    });

    const embed = new EmbedBuilder()
      .setTitle("Discord → EOS Sync Complete")
      .addFields(
        {
          name: "Product Members Found",
          value: String(productMembers.size),
          inline: true,
        },
        {
          name: "Created",
          value: String(result.created ?? 0),
          inline: true,
        },
        {
          name: "Updated",
          value: String(result.updated ?? 0),
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.editReply({
      content: null,
      embeds: [embed],
    });
  } catch (error) {
    console.error("EOS sync error:", error);

    await interaction.editReply({
      content:
        `Discord sync failed: ${error.message}`,
    });
  }
}

/*
|--------------------------------------------------------------------------
| Main command handler
|--------------------------------------------------------------------------
*/

async function handleEosCommand(interaction, request = eosRequest) {
  try {
    const subcommand =
      interaction.options.getSubcommand();

    /*
     * Defer immediately because database/API requests can take
     * longer than Discord's initial interaction window.
     */
    await interaction.deferReply({
      ephemeral: subcommand === "onboarding",
    });

    switch (subcommand) {
      case "status":
        return await handleStatus(interaction, request);

      case "profile":
        return await handleProfile(interaction, request);

      case "connect":
        return await handleConnect(interaction, request);

      case "onboarding":
        return await handleOnboarding(interaction, request);

      case "sync":
        return await handleSync(interaction, request);

      default:
        return interaction.editReply({
          content: "Unknown EOS command.",
        });
    }
  } catch (error) {
    console.error("EOS command error:", error);

    const message =
      error?.message ||
      "An unexpected EOS error occurred.";

    /*
     * If the interaction has already been deferred/replied,
     * edit the existing response.
     */
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({
        content: `EOS error: ${message}`,
      });
    }

    return interaction.reply({
      content: `EOS error: ${message}`,
      ephemeral: true,
    });
  }
}

module.exports = {
  eosCommand,
  handleEosCommand,
  handleStatus,
  handleProfile,
  handleConnect,
  handleOnboarding,
  handleSync,
};
