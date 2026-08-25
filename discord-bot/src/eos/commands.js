const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { eosRequest } = require("./client");

const DOCUMENT_CATEGORIES = [
  "Architecture", "Development", "Setup", "Deployment", "Product", "Workflow",
  "Troubleshooting", "Onboarding", "AI / Codex", "Decision", "Other",
];

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
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName("document")
      .setDescription("Create, upload, or link engineering documentation")
      .addStringOption((option) => option.setName("action").setDescription("How to add the document").setRequired(true).addChoices(
        { name: "Create a Google Doc", value: "create" },
        { name: "Upload a file", value: "upload" },
        { name: "Link an existing document", value: "link" }
      ))
      .addStringOption((option) => option.setName("title").setDescription("Document title").setRequired(true).setMaxLength(300))
      .addStringOption((option) => option.setName("category").setDescription("Documentation category").setRequired(true).addChoices(
        ...DOCUMENT_CATEGORIES.map((category) => ({ name: category, value: category }))
      ))
      .addStringOption((option) => option.setName("content").setDescription("Short document content (create only)").setMaxLength(4000))
      .addAttachmentOption((option) => option.setName("file").setDescription("PDF, Markdown, TXT, or DOCX (upload only)"))
      .addStringOption((option) => option.setName("url").setDescription("Google Drive/Docs or external URL (link only)"))
      .addStringOption((option) => option.setName("description").setDescription("Short description").setMaxLength(1000))
      .addStringOption((option) => option.setName("tags").setDescription("Comma-separated tags").setMaxLength(500))
      .addStringOption((option) => option.setName("github").setDescription("Optional ingested GitHub repository, issue, PR, or commit URL"))
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName("docs")
      .setDescription("Search engineering documentation")
      .addStringOption((option) => option.setName("query").setDescription("What are you looking for?").setRequired(true).setMinLength(2).setMaxLength(500))
      .addStringOption((option) => option.setName("category").setDescription("Optional category filter").addChoices(
        ...DOCUMENT_CATEGORIES.map((category) => ({ name: category, value: category }))
      ))
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

function parseDocumentTags(value) {
  return [...new Set(String(value || "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 25);
}

function githubRelationFromUrl(value) {
  if (!value) return [];
  let url;
  try { url = new URL(value); } catch { throw new Error("The GitHub relationship must be a valid URL."); }
  if (url.hostname.toLowerCase() !== "github.com") throw new Error("The GitHub relationship must use github.com.");
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) throw new Error("The GitHub URL must identify a repository, issue, pull request, or commit.");
  const marker = segments[2]?.toLowerCase();
  const type = marker === "issues" ? "ISSUE" : marker === "pull" ? "PULL_REQUEST" : marker === "commit" ? "COMMIT" : "REPOSITORY";
  return [{ type, url: url.toString() }];
}

function documentPayload(interaction) {
  return {
    title: interaction.options.getString("title", true),
    category: interaction.options.getString("category", true),
    description: interaction.options.getString("description") || undefined,
    tags: parseDocumentTags(interaction.options.getString("tags")),
    creatorDiscordUserId: interaction.user.id,
    githubRelations: githubRelationFromUrl(interaction.options.getString("github")),
  };
}

function documentResultEmbed(document) {
  const embed = new EmbedBuilder()
    .setTitle("Documentation saved")
    .setDescription(`**${truncate(document.title, 250)}**`)
    .addFields(
      { name: "Category", value: truncate(document.category), inline: true },
      { name: "Source", value: truncate(document.sourceType), inline: true },
      { name: "Indexed", value: document.extractedContent || document.indexedCharacters ? "Yes" : "Metadata only", inline: true }
    )
    .setFooter({ text: "Drive/external storage remains the document source of truth" })
    .setTimestamp();
  if (document.externalUrl) embed.setURL(document.externalUrl).addFields({ name: "Open document", value: document.externalUrl });
  return embed;
}

async function downloadDiscordAttachment(attachment, request = fetch) {
  const url = new URL(attachment.url);
  if (!["cdn.discordapp.com", "media.discordapp.net", "cdn.discordapp.net"].includes(url.hostname.toLowerCase())) {
    throw new Error("The attachment must be hosted by Discord.");
  }
  const maxBytes = Number(process.env.EOS_DOCUMENT_MAX_UPLOAD_BYTES || 10_000_000);
  if (!Number.isFinite(attachment.size) || attachment.size <= 0 || attachment.size > maxBytes) {
    throw new Error(`The attachment must be no larger than ${Math.floor(maxBytes / 1_000_000)} MB.`);
  }
  const response = await request(attachment.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Discord attachment download failed (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error(`The attachment must be no larger than ${Math.floor(maxBytes / 1_000_000)} MB.`);
  return buffer;
}

async function handleDocument(interaction, request = eosRequest, download = fetch) {
  const action = interaction.options.getString("action", true);
  const payload = documentPayload(interaction);
  let result;
  if (action === "create") {
    const content = interaction.options.getString("content");
    if (!content?.trim()) return interaction.editReply({ content: "Add `content` when creating documentation." });
    result = await request("/api/documents", { method: "POST", body: JSON.stringify({ ...payload, content }) });
  } else if (action === "link") {
    const url = interaction.options.getString("url");
    if (!url?.trim()) return interaction.editReply({ content: "Add `url` when linking documentation." });
    result = await request("/api/documents/link", { method: "POST", body: JSON.stringify({ ...payload, url }) });
  } else if (action === "upload") {
    const attachment = interaction.options.getAttachment("file");
    if (!attachment) return interaction.editReply({ content: "Attach a PDF, Markdown, TXT, or DOCX file when uploading documentation." });
    const buffer = await downloadDiscordAttachment(attachment, download);
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      form.append(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    form.append("file", new Blob([buffer], { type: attachment.contentType || "application/octet-stream" }), attachment.name);
    result = await request("/api/documents/upload", { method: "POST", body: form });
  } else throw new Error("Unknown documentation action.");
  const document = result.data || result;
  return interaction.editReply({ embeds: [documentResultEmbed(document)], allowedMentions: { parse: [] } });
}

async function handleDocs(interaction, request = eosRequest) {
  const query = interaction.options.getString("query", true).trim();
  const category = interaction.options.getString("category");
  const params = new URLSearchParams({ q: query, limit: "10" });
  if (category) params.set("category", category);
  const result = await request(`/api/documents/search?${params.toString()}`);
  const documents = result.data || [];
  if (!documents.length) return interaction.editReply({ content: `No documentation matched **${truncate(query, 200)}**.` });
  const lines = documents.map((document, index) => {
    const title = truncate(document.title, 120).replace(/[\[\]]/g, "");
    const label = document.externalUrl ? `[${title}](${document.externalUrl})` : `**${title}**`;
    return `${index + 1}. ${label} — ${document.category}${document.description ? `\n   ${truncate(document.description, 180)}` : ""}`;
  });
  return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("EOS documentation search").setDescription(lines.join("\n").slice(0, 4000)).setFooter({ text: `Query: ${truncate(query, 200)}` }).setTimestamp()], allowedMentions: { parse: [] } });
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
      ephemeral: ["onboarding", "document", "docs"].includes(subcommand),
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

      case "document":
        return await handleDocument(interaction, request);

      case "docs":
        return await handleDocs(interaction, request);

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
  handleDocument,
  handleDocs,
  parseDocumentTags,
  githubRelationFromUrl,
  downloadDiscordAttachment,
};
