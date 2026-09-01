const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { EosApiError, eosRequest } = require("./client");

const DOCUMENT_CATEGORIES = [
  "Architecture", "Development", "Setup", "Deployment", "Product", "Workflow",
  "Troubleshooting", "Onboarding", "AI / Codex", "Decision", "Other",
];
const DEFAULT_EOS_WAKE_MAX_WAIT_MS = 75_000;
const DEFAULT_EOS_WAKE_PROBE_TIMEOUT_MS = 8_000;
const DEFAULT_EOS_WAKE_RETRY_MS = 2_000;
const DEFAULT_EOS_WAKE_PROGRESS_MS = 5_000;
const DEFAULT_VENU_PRODUCT_URL = "https://ai.venu3d.com/";
const DEFAULT_VENU_REPOSITORY_URL = "https://github.com/RoboBearLLC/VenuAI";
const PRIVATE_EOS_SUBCOMMANDS = new Set(["profile", "connect", "onboarding", "progress", "document", "docs", "search", "ask"]);

class TodoInputError extends Error {}

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
      .setDescription("Set up EOS and see your exact Venu onboarding next steps")
      .addStringOption((option) =>
        option
          .setName("github")
          .setDescription("Your GitHub username (Jeremy grants repository access separately)")
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
      .setName("progress")
      .setDescription("Mark an engineering onboarding milestone complete or incomplete")
      .addStringOption((option) =>
        option
          .setName("step")
          .setDescription("Onboarding milestone")
          .setRequired(true)
          .addChoices(
            { name: "VenuAI repository access", value: "repository_access" },
            { name: "Venu 1.x local setup", value: "environment_setup" },
            { name: "First task claimed", value: "first_task" },
            { name: "First fix shipped", value: "first_fix" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("state")
          .setDescription("Defaults to complete")
          .addChoices(
            { name: "Complete", value: "complete" },
            { name: "Not complete", value: "not_complete" }
          )
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
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName("search")
      .setDescription("Search connected engineering context")
      .addStringOption((option) => option
        .setName("query")
        .setDescription("Question or engineering topic")
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(500))
  )

  .addSubcommand((subcommand) =>
    subcommand
      .setName("ask")
      .setDescription("Ask EOS about connected engineering context")
      .addStringOption((option) => option
        .setName("question")
        .setDescription("Question about Venu engineering work or decisions")
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(500))
  )

  .addSubcommandGroup((group) => group
    .setName("todo")
    .setDescription("Manage your private EOS todo list")
    .addSubcommand((subcommand) => subcommand
      .setName("add")
      .setDescription("Add a personal task and optional reminder")
      .addStringOption((option) => option.setName("title").setDescription("What needs to be done?").setRequired(true).setMaxLength(200))
      .addStringOption((option) => option.setName("notes").setDescription("Optional details").setMaxLength(2000))
      .addStringOption((option) => option.setName("due").setDescription("Optional: 30m, 2h, 3d, 1w, or an ISO timestamp"))
      .addStringOption((option) => option.setName("remind").setDescription("Optional reminder: 30m, 2h, 3d, 1w, or an ISO timestamp")))
    .addSubcommand((subcommand) => subcommand
      .setName("list")
      .setDescription("View your personal tasks")
      .addStringOption((option) => option.setName("show").setDescription("Which tasks to show").addChoices(
        { name: "Open", value: "OPEN" }, { name: "Completed", value: "COMPLETED" }, { name: "All", value: "ALL" }
      )))
    .addSubcommand((subcommand) => subcommand.setName("done").setDescription("Mark a task complete")
      .addIntegerOption((option) => option.setName("task").setDescription("Task number from /eos todo list").setRequired(true).setMinValue(1)))
    .addSubcommand((subcommand) => subcommand.setName("reopen").setDescription("Reopen a completed task")
      .addIntegerOption((option) => option.setName("task").setDescription("Task number from /eos todo list").setRequired(true).setMinValue(1)))
    .addSubcommand((subcommand) => subcommand.setName("snooze").setDescription("Set or move a task reminder")
      .addIntegerOption((option) => option.setName("task").setDescription("Task number from /eos todo list").setRequired(true).setMinValue(1))
      .addStringOption((option) => option.setName("for").setDescription("30m, 2h, 3d, 1w, or an ISO timestamp").setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("delete").setDescription("Delete a personal task")
      .addIntegerOption((option) => option.setName("task").setDescription("Task number from /eos todo list").setRequired(true).setMinValue(1)))
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

function publicEosErrorMessage(error) {
  if (error instanceof TodoInputError) return error.message;
  if (error instanceof EosApiError) {
    if (error.status === 0 || error.status >= 500) {
      return "EOS is temporarily unavailable. Please wait a moment and run the command again.";
    }
    if (error.status === 429) {
      return "EOS is temporarily rate limited. Please wait a moment and try again.";
    }
    return `EOS could not complete the request (HTTP ${error.status}).`;
  }
  return "EOS could not complete the command. Please try again.";
}

async function sendCommandError(interaction, error) {
  const response = {
    content: publicEosErrorMessage(error),
    embeds: [],
    components: [],
    allowedMentions: { parse: [] },
  };
  try {
    if (interaction.deferred || interaction.replied) return await interaction.editReply(response);
    return await interaction.reply({ ...response, ephemeral: true });
  } catch (replyError) {
    console.error("Could not deliver EOS command error response:", replyError?.message || "Discord API error");
    return undefined;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeGitHubUsername(value) {
  const username = String(value || "").trim().replace(/^@/, "").toLowerCase();
  if (!/^(?!-)(?!.*--)[a-z0-9-]{1,39}(?<!-)$/.test(username)) return null;
  return username;
}

function parseTodoTime(value, now = Date.now()) {
  const text = String(value || "").trim();
  if (!text) return null;
  const relative = text.match(/^(\d+)\s*([mhdw])$/i);
  if (relative) {
    const units = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
    const amount = Number(relative[1]);
    const milliseconds = amount * units[relative[2].toLowerCase()];
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 60_000 || milliseconds > 365 * 86_400_000) {
      throw new TodoInputError("Task times must be between 1 minute and 365 days.");
    }
    return new Date(now + milliseconds);
  }
  const discordTimestamp = text.match(/^<t:(\d{10})(?::[tTdDfFR])?>$/);
  const date = discordTimestamp ? new Date(Number(discordTimestamp[1]) * 1000) : new Date(text);
  if (!discordTimestamp && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    throw new TodoInputError("Use a relative time like `2h` or an ISO timestamp with a timezone, such as `2026-08-29T09:00:00-07:00`.");
  }
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now) throw new TodoInputError("Task times must be in the future.");
  return date;
}

function todoTimestamp(value) {
  if (!value) return null;
  return `<t:${Math.floor(new Date(value).getTime() / 1000)}:F>`;
}

function todoLine(task) {
  const icon = task.status === "COMPLETED" ? "✅" : "⬜";
  const parts = [`${icon} **#${task.number}** — ${truncate(task.title, 160)}`];
  if (task.dueAt) parts.push(`due ${todoTimestamp(task.dueAt)}`);
  const pending = (task.reminders || []).find((reminder) => reminder.status === "PENDING" || reminder.status === "CLAIMED");
  if (pending) parts.push(`reminder ${todoTimestamp(pending.remindAt)}`);
  return parts.join(" • ");
}

function todoApiError(error) {
  if (!(error instanceof EosApiError)) return error;
  if (error.status === 400) return new TodoInputError("EOS rejected that task input. Check the task number and use a time such as `30m`, `2h`, or an ISO timestamp with a timezone.");
  if (error.status === 404) return new TodoInputError("That task or EOS profile was not found. Run `/eos onboarding` if you have not connected your profile, then check `/eos todo list`.");
  if (error.status === 409) return new TodoInputError("That task cannot be changed in its current state. Reopen it first if you want to set another reminder.");
  return error;
}

async function handleTodo(interaction, action, request = eosRequest, now = Date.now()) {
  const discordUserId = interaction.user.id;
  const taskNumber = interaction.options.getInteger?.("task");
  if (action === "add") {
    const dueAt = parseTodoTime(interaction.options.getString("due"), now);
    const explicitReminder = parseTodoTime(interaction.options.getString("remind"), now);
    const remindAt = explicitReminder || dueAt;
    if (dueAt && remindAt && remindAt > dueAt) throw new TodoInputError("The reminder cannot be after the due time.");
    const result = await request("/api/personal-tasks", {
      method: "POST",
      body: JSON.stringify({
        discordUserId,
        title: interaction.options.getString("title", true),
        description: interaction.options.getString("notes") || undefined,
        dueAt: dueAt?.toISOString(),
        remindAt: remindAt?.toISOString(),
        clientRequestId: interaction.id,
      }),
    });
    const task = result.data;
    return interaction.editReply({ content: `✅ Added ${todoLine(task)}${remindAt ? "\nI’ll DM you when the reminder is due." : ""}`, allowedMentions: { parse: [] } });
  }
  if (action === "list") {
    const status = interaction.options.getString("show") || "OPEN";
    const result = await request(`/api/personal-tasks?discordUserId=${encodeURIComponent(discordUserId)}&status=${status}&limit=25`);
    const tasks = result.data || [];
    if (!tasks.length) return interaction.editReply({ content: status === "OPEN" ? "Your todo list is clear. Add one with `/eos todo add`." : "No matching personal tasks were found." });
    const embed = new EmbedBuilder().setTitle("Your EOS todo list").setDescription(tasks.map(todoLine).join("\n").slice(0, 4000)).setFooter({ text: "Use the # number with done, reopen, snooze, or delete." }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
  if (!Number.isInteger(taskNumber) || taskNumber < 1) throw new TodoInputError("Choose a valid task number from `/eos todo list`.");
  if (action === "snooze") {
    const remindAt = parseTodoTime(interaction.options.getString("for", true), now);
    const result = await request(`/api/personal-tasks/${taskNumber}/snooze`, { method: "POST", body: JSON.stringify({ discordUserId, remindAt: remindAt.toISOString() }) });
    return interaction.editReply({ content: `⏰ Reminder set for ${todoTimestamp(remindAt)} on **#${taskNumber} — ${truncate(result.data.title, 160)}**.` });
  }
  if (action === "delete") {
    await request(`/api/personal-tasks/${taskNumber}?discordUserId=${encodeURIComponent(discordUserId)}`, { method: "DELETE" });
    return interaction.editReply({ content: `🗑️ Deleted personal task **#${taskNumber}**.` });
  }
  const result = await request(`/api/personal-tasks/${taskNumber}`, { method: "PATCH", body: JSON.stringify({ discordUserId, action: action === "done" ? "complete" : "reopen" }) });
  return interaction.editReply({ content: `${action === "done" ? "✅ Completed" : "⬜ Reopened"} **#${taskNumber} — ${truncate(result.data.title, 160)}**.` });
}

function isRetryableWakeError(error) {
  if (!(error instanceof EosApiError)) return true;
  if (/must be configured/i.test(error.message)) return false;
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

async function waitForEosReady(interaction, request = eosRequest, options = {}) {
  const now = options.now || Date.now;
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const maxWaitMs = positiveInteger(options.maxWaitMs ?? process.env.EOS_WAKE_MAX_WAIT_MS, DEFAULT_EOS_WAKE_MAX_WAIT_MS);
  const probeTimeoutMs = positiveInteger(options.probeTimeoutMs ?? process.env.EOS_WAKE_PROBE_TIMEOUT_MS, DEFAULT_EOS_WAKE_PROBE_TIMEOUT_MS);
  const retryMs = positiveInteger(options.retryMs ?? process.env.EOS_WAKE_RETRY_MS, DEFAULT_EOS_WAKE_RETRY_MS);
  const progressMs = positiveInteger(options.progressMs ?? process.env.EOS_WAKE_PROGRESS_MS, DEFAULT_EOS_WAKE_PROGRESS_MS);
  const startedAt = now();
  let lastError = new EosApiError("EOS did not become ready", 0);
  let lastProgressAt = Number.NEGATIVE_INFINITY;
  let firstAttempt = true;

  while (firstAttempt || now() - startedAt < maxWaitMs) {
    firstAttempt = false;
    const elapsedMs = now() - startedAt;
    const remainingSeconds = Math.max(1, Math.ceil((maxWaitMs - elapsedMs) / 1000));
    if (elapsedMs - lastProgressAt >= progressMs) {
      await interaction.editReply({
        content: `EOS is waking up on free hosting. Your command will run automatically when it is ready (up to ${remainingSeconds}s remaining).`,
        embeds: [],
        components: [],
        allowedMentions: { parse: [] },
      });
      lastProgressAt = elapsedMs;
    }

    try {
      const health = await request("/health", {}, fetch, { timeoutMs: probeTimeoutMs });
      if (health?.ok === true && health?.service === "venu-engineering-os") return true;
      lastError = new EosApiError("EOS health check returned an unexpected response", 503);
    } catch (error) {
      lastError = error;
      if (!isRetryableWakeError(error)) throw error;
    }

    const remainingMs = maxWaitMs - (now() - startedAt);
    if (remainingMs > 0) await wait(Math.min(retryMs, remainingMs));
  }

  throw lastError;
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
        name: "GitHub",
        value: status.github?.connected ? "Ready" : "Waiting for token",
        inline: true,
      },
      {
        name: "Discord",
        value: status.discord?.connected ? "Live retrieval ready" : "Metadata available",
        inline: true,
      },
      {
        name: "Discord Metadata",
        value: `${status.discord?.servers ?? 0} servers • ${status.discord?.channels ?? 0} channels • ${status.discord?.activeMembers ?? 0} members`,
        inline: true,
      },
      {
        name: "Documentation",
        value: `${status.documents?.indexed ?? 0}/${status.documents?.active ?? 0} indexed${status.documents?.storageConfigured ? " • storage ready" : ""}`,
        inline: true,
      },
      {
        name: "Knowledge",
        value: `${status.knowledge?.active ?? 0} active entries`,
        inline: true,
      },
      {
        name: "AI",
        value: status.intelligence?.configured ? "Ready" : "Waiting for provider key",
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
  const githubActivity = result.githubActivity || result.data?.githubActivity;

  if (!engineer) {
    return interaction.editReply({
      content:
        "You don't have an EOS engineer profile yet. Ask an admin to run `/eos sync`.",
    });
  }

  const activityFields = githubProfileFields(githubActivity);
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
      },
      {
        name: "Engineering checklist",
        value: onboardingChecklist(onboarding).join("\n"),
      },
      {
        name: "Next step",
        value: onboardingNextStep(onboarding),
      },
      ...activityFields
    )
    .setFooter({ text: "GitHub-verifiable milestones update automatically; local setup remains self-reported." })
    .setTimestamp();

  await interaction.editReply({
    embeds: [embed],
  });
}

function safeProfileLink(title, url) {
  const label = truncate(title, 80).replace(/[\[\]]/g, "");
  return /^https:\/\//i.test(url || "") ? `[${label}](${url})` : label;
}

function githubProfileFields(activity) {
  if (activity?.temporarilyUnavailable) {
    return [{ name: "GitHub activity", value: "GitHub activity is temporarily unavailable. Your EOS profile and existing checklist remain available." }];
  }
  if (!activity?.configured) {
    return [{ name: "GitHub activity", value: "Waiting for the EOS GitHub token. Your connected GitHub identity is preserved." }];
  }
  if (!activity.identityConnected) {
    return [{ name: "GitHub activity", value: "Run `/eos connect type:GitHub` so EOS can associate repository activity with you." }];
  }
  if (!activity.dataAvailable) {
    return [{ name: "GitHub activity", value: "GitHub is connected. The initial repository sync is pending." }];
  }

  const currentPullRequests = (activity.pullRequests?.current || []).slice(0, 3);
  const requestedReviews = (activity.reviews?.requested || []).slice(0, 3);
  const currentTasks = (activity.tasks?.current || []).slice(0, 3);
  const work = [];
  if (currentTasks.length) {
    work.push("**Assigned work**", ...currentTasks.map((task) => `• ${safeProfileLink(task.title, task.githubUrl)} — ${task.status}`));
  }
  if (currentPullRequests.length) {
    work.push("**Open PRs**", ...currentPullRequests.map((pr) => `• ${safeProfileLink(`${pr.repository?.fullName || "Repository"} #${pr.number}: ${pr.title}`, pr.url)}${pr.isDraft ? " — Draft" : ""}`));
  }
  if (requestedReviews.length) {
    work.push("**Reviews requested**", ...requestedReviews.map((pr) => `• ${safeProfileLink(`${pr.repository?.fullName || "Repository"} #${pr.number}: ${pr.title}`, pr.url)}`));
  }

  return [
    {
      name: "Commits",
      value: `24h: **${activity.commits?.day ?? 0}** • 7d: **${activity.commits?.week ?? 0}** • 30d: **${activity.commits?.month ?? 0}** • Total: **${activity.commits?.all ?? 0}**`,
    },
    {
      name: "Pull requests",
      value: `Open: **${activity.pullRequests?.open ?? 0}** • Closed: **${activity.pullRequests?.closed ?? 0}** • Merged: **${activity.pullRequests?.merged ?? 0}**`,
      inline: true,
    },
    {
      name: "Reviews",
      value: `Requested: **${activity.reviews?.requested?.length ?? 0}** • Submitted 30d: **${activity.reviews?.month ?? 0}** • Total: **${activity.reviews?.all ?? 0}**`,
      inline: true,
    },
    {
      name: "Tasks",
      value: `Active: **${activity.tasks?.active ?? 0}** • Completed: **${activity.tasks?.completed ?? 0}**`,
      inline: true,
    },
    ...(work.length ? [{ name: "Current GitHub work", value: truncate(work.join("\n"), 1024) }] : []),
    {
      name: "GitHub data refreshed",
      value: activity.lastSyncedAt ? `<t:${Math.floor(new Date(activity.lastSyncedAt).getTime() / 1000)}:R>` : "Initial sync pending",
      inline: true,
    },
  ];
}

const ONBOARDING_STEP_LABELS = {
  repository_access: "VenuAI repository access",
  environment_setup: "Venu 1.x local setup",
  first_task: "First task claimed",
  first_fix: "First fix shipped",
};

function onboardingChecklist(onboarding) {
  if (!onboarding) return ["⬜ Run `/eos onboarding` to create your checklist"];
  return [
    `${onboarding.repositoryAccess ? "✅" : "⬜"} VenuAI repository access`,
    `${onboarding.environmentSetup ? "✅" : "⬜"} Venu 1.x local setup`,
    `${onboarding.firstTaskGiven ? "✅" : "⬜"} First task claimed`,
    `${onboarding.firstFixShipped ? "✅" : "⬜"} First fix shipped`,
  ];
}

function onboardingNextStep(onboarding) {
  if (!onboarding) return "Run `/eos onboarding` to create your guided checklist.";
  if (onboarding.status !== "COMPLETED") return "Run `/eos onboarding` and complete the linked Venu form.";
  if (!onboarding.repositoryAccess) return "Wait for Jeremy to grant VenuAI repository access. Once it opens, run `/eos progress step:VenuAI repository access`.";
  if (!onboarding.environmentSetup) return "Set up Venu 1.x, then run `/eos progress step:Venu 1.x local setup`.";
  if (!onboarding.firstTaskGiven) return "Use Venu, identify and claim a bug or pain point, then mark First task claimed with `/eos progress`.";
  if (!onboarding.firstFixShipped) return "Ship your first fix within one week, then mark First fix shipped with `/eos progress`.";
  return "Your engineering onboarding checklist is complete. Keep `/eos profile` current as your work progresses.";
}

async function handleProgress(interaction, request = eosRequest) {
  const step = interaction.options.getString("step", true);
  const completed = interaction.options.getString("state") !== "not_complete";
  const label = ONBOARDING_STEP_LABELS[step];
  if (!label) return interaction.editReply({ content: "Unknown onboarding milestone." });

  const result = await request(
    `/api/engineers/profile/${encodeURIComponent(interaction.user.id)}/onboarding-progress`,
    { method: "PATCH", body: JSON.stringify({ step, completed }) }
  );
  const onboarding = result.onboarding || result.data?.onboarding;
  return interaction.editReply({
    content: `${completed ? "✅ Marked complete" : "⬜ Marked not complete"}: **${label}**\n\n${onboardingChecklist(onboarding).join("\n")}\n\nRun \`/eos profile\` to see your next step.`,
    allowedMentions: { parse: [] },
  });
}

/*
|--------------------------------------------------------------------------
| /eos connect github
|--------------------------------------------------------------------------
*/

async function handleConnectGitHub(interaction, value, request = eosRequest) {
  const githubUsername = normalizeGitHubUsername(value);

  if (!githubUsername) {
    return interaction.editReply({
      content: "Please provide a valid GitHub username, not a profile URL or display name.",
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
        : "") +
      "\n\nThis connects your identity in EOS. **Jeremy still needs to grant you access to the private VenuAI repository.**",
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
  const githubUsername = normalizeGitHubUsername(
    interaction.options.getString("github", true)
  );
  const email = interaction.options
    .getString("email", true)
    .trim()
    .toLowerCase();

  if (!githubUsername) {
    return interaction.editReply({
      content: "Please provide a valid GitHub username, not a profile URL or display name.",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return interaction.editReply({
      content: "That doesn't look like a valid email address. Please try again.",
    });
  }

  const name =
    interaction.member?.displayName ||
    interaction.user.globalName ||
    interaction.user.username;

  const result = await request("/api/engineers/onboarding", {
    method: "POST",
    body: JSON.stringify({
      discordUserId: interaction.user.id,
      name,
      email,
      githubUsername,
      completed: false,
    }),
  });
  const onboarding = result.onboarding || result.data?.onboarding;
  const formCompleted = onboarding?.status === "COMPLETED";
  if (!formCompleted && !/^https?:\/\//i.test(tallyFormUrl || "")) {
    return interaction.editReply({
      content:
        "Your EOS profile was saved, but the Venu onboarding form is temporarily unavailable. Please contact an administrator and run `/eos onboarding` again later.",
    });
  }
  const productUrl = process.env.VENU_PRODUCT_URL || DEFAULT_VENU_PRODUCT_URL;
  const repositoryUrl = process.env.VENU_REPOSITORY_URL || DEFAULT_VENU_REPOSITORY_URL;

  const embed = new EmbedBuilder()
    .setTitle("Venu engineering onboarding — your next steps")
    .setDescription(
      formCompleted
        ? "Your EOS profile and Venu onboarding form are complete. Here is exactly what happens next."
        : "Your EOS profile is connected. Complete the steps below in order; you do not need to run `/eos connect` again unless your information changes."
    )
    .addFields(
      {
        name: "✅ 1. EOS profile",
        value: `Your email and GitHub identity [@${githubUsername}](https://github.com/${githubUsername}) are saved. Use \`/eos profile\` to check them anytime.`,
      },
      {
        name: `${formCompleted ? "✅" : "➡️"} 2. Venu onboarding form`,
        value: formCompleted
          ? "EOS has received and processed your completed form."
          : "Open the form below and submit it using this same Discord identity. Then run `/eos onboarding` again to see your updated checklist.",
      },
      {
        name: "⏳ 3. GitHub repository access",
        value:
          "**Jeremy must add your GitHub account to the private VenuAI repository.** EOS cannot grant this permission. If the repository link does not open, your action is to wait for or follow up with Jeremy—not troubleshoot Git locally.",
      },
      {
        name: "🛠️ 4. Set up Venu 1.x",
        value: formCompleted
          ? "Once the repository opens for you, follow the local-development checklist included below."
          : "After your form is processed and Jeremy grants repository access, EOS will show the local-development checklist.",
      },
      {
        name: "🚀 5. First-week onboarding task",
        value:
          "Use Venu, identify one real bug or pain point, assign/claim it yourself, and ship the fix within one week. Ask in the engineering channel if you need help choosing or scoping it.",
      }
    )
    .setFooter({ text: "Need this checklist again? Run /eos onboarding with the same information." })
    .setTimestamp();

  const buttons = [];
  if (!formCompleted) {
    buttons.push(new ButtonBuilder().setLabel("Complete onboarding form").setStyle(ButtonStyle.Link).setURL(tallyFormUrl));
  }
  buttons.push(
    new ButtonBuilder().setLabel("Open Venu").setStyle(ButtonStyle.Link).setURL(productUrl),
    new ButtonBuilder().setLabel("Open VenuAI repository").setStyle(ButtonStyle.Link).setURL(repositoryUrl)
  );
  const row = new ActionRowBuilder().addComponents(...buttons);

  const embeds = [embed];
  if (formCompleted) {
    const { buildVenuSetupEmbed } = require("./venuSetup");
    embeds.push(buildVenuSetupEmbed(repositoryUrl));
  }

  return interaction.editReply({
    embeds,
    components: [row],
    allowedMentions: { parse: [] },
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
  try {
    await request("/api/documents/sync", { method: "POST" });
  } catch (error) {
    console.warn("Drive document refresh unavailable; searching the existing EOS index:", error?.message || error);
  }
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

function contextResultLines(data) {
  const lines = [];
  const add = (label, entries, formatter) => {
    if (!entries?.length) return;
    lines.push(`**${label}**`);
    for (const entry of entries) lines.push(`• ${formatter(entry)}`);
  };
  const linked = (title, url) => url
    ? `[${truncate(title, 100).replace(/[\[\]]/g, "")}](${url})`
    : `**${truncate(title, 100)}**`;

  add("Documentation", data.documents, (item) => `${linked(item.title, item.url)}${item.category ? ` — ${item.category}` : ""}`);
  add("Knowledge", data.knowledge, (item) => `${linked(item.title, item.sources?.[0]?.sourceUrl)}${item.origin ? ` — ${item.origin}` : ""}`);
  add("Tasks", data.tasks, (item) => `${linked(item.title, item.github?.url)} — ${item.status}${item.owner?.name ? ` • ${item.owner.name}` : ""}`);
  const github = [
    ...(data.github?.issues || []).map((item) => ({ ...item, resultType: "Issue" })),
    ...(data.github?.pullRequests || []).map((item) => ({ ...item, resultType: "PR" })),
    ...(data.github?.commits || []).map((item) => ({ ...item, title: item.message || item.sha, resultType: "Commit" })),
  ];
  add("GitHub", github, (item) => `${linked(item.title || item.sha, item.url)} — ${item.resultType}`);
  add("People", data.engineers, (item) => `${item.name}${item.githubUsername ? ` — @${item.githubUsername}` : ""}`);
  add("Live Discord", data.discord?.messages, (item) => `${linked(truncate(item.content || "Discord message", 120), item.url)}${item.occurredAt ? ` — <t:${Math.floor(new Date(item.occurredAt).getTime() / 1000)}:R>` : ""}`);

  if (data.warnings?.length) lines.push(`_${truncate(data.warnings.join(" "), 500)}_`);
  return lines;
}

async function handleSearch(interaction, request = eosRequest) {
  const query = interaction.options.getString("query", true).trim();
  const result = await request("/api/context/relevant", {
    method: "POST",
    body: JSON.stringify({
      query,
      serverId: interaction.guildId || undefined,
      channelId: interaction.guildId ? interaction.channelId : undefined,
      includeDiscord: Boolean(interaction.guildId),
      limit: 6,
    }),
  });
  const data = result.data || result;
  const lines = contextResultLines(data);
  if (!lines.length) {
    return interaction.editReply({
      content: `No connected engineering context matched **${truncate(query, 200)}**.`,
      allowedMentions: { parse: [] },
    });
  }
  const embed = new EmbedBuilder()
    .setTitle("EOS engineering context")
    .setDescription(lines.join("\n").slice(0, 4000))
    .setFooter({ text: `Query: ${truncate(query, 200)}` })
    .setTimestamp();
  return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
}

function answerSourceLine(citation) {
  const label = truncate(citation.label || `${citation.sourceType}: ${citation.sourceId}`, 140).replace(/[\[\]]/g, "");
  try {
    const url = new URL(citation.url);
    if (["http:", "https:"].includes(url.protocol)) return `• [${label}](${url.toString()})`;
  } catch {
    // A source can be a durable EOS record without an external URL.
  }
  return `• ${label}`;
}

async function handleAsk(interaction, request = eosRequest) {
  const question = interaction.options.getString("question", true).trim();
  const result = await request("/api/context/answer", {
    method: "POST",
    body: JSON.stringify({
      question,
      serverId: interaction.guildId || undefined,
      days: 14,
      limit: 8,
    }),
  });
  const data = result.data || result;
  const embed = new EmbedBuilder()
    .setTitle("EOS answer")
    .setDescription(truncate(data.answer, 4000))
    .setColor(data.insufficientContext ? 0xfee75c : 0x5865f2)
    .setFooter({ text: data.insufficientContext
      ? `Insufficient context • ${data.confidence || "LOW"} confidence`
      : `${data.confidence || "UNKNOWN"} confidence • Sources verified by EOS` })
    .setTimestamp();
  if (data.citations?.length) {
    embed.addFields({
      name: "Sources",
      value: truncate(data.citations.slice(0, 10).map(answerSourceLine).join("\n"), 1024),
    });
  }
  return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
}

/*
|--------------------------------------------------------------------------
| Main command handler
|--------------------------------------------------------------------------
*/

async function handleEosCommand(interaction, request = eosRequest, wakeOptions = {}) {
  try {
    const subcommand =
      interaction.options.getSubcommand();
    const subcommandGroup = typeof interaction.options.getSubcommandGroup === "function"
      ? interaction.options.getSubcommandGroup(false)
      : null;

    /*
     * Defer immediately because database/API requests can take
     * longer than Discord's initial interaction window.
     */
    await interaction.deferReply({
      ephemeral: subcommandGroup === "todo" || PRIVATE_EOS_SUBCOMMANDS.has(subcommand),
    });

    await waitForEosReady(interaction, request, wakeOptions);

    if (subcommandGroup === "todo") {
      try { return await handleTodo(interaction, subcommand, request); }
      catch (error) { throw todoApiError(error); }
    }

    switch (subcommand) {
      case "status":
        return await handleStatus(interaction, request);

      case "profile":
        return await handleProfile(interaction, request);

      case "connect":
        return await handleConnect(interaction, request);

      case "onboarding":
        return await handleOnboarding(interaction, request);

      case "progress":
        return await handleProgress(interaction, request);

      case "sync":
        return await handleSync(interaction, request);

      case "document":
        return await handleDocument(interaction, request);

      case "docs":
        return await handleDocs(interaction, request);

      case "search":
        return await handleSearch(interaction, request);

      case "ask":
        return await handleAsk(interaction, request);

      default:
        return interaction.editReply({
          content: "Unknown EOS command.",
        });
    }
  } catch (error) {
    console.error("EOS command failed:", error?.message || "Unknown EOS error");
    return sendCommandError(interaction, error);
  }
}

module.exports = {
  eosCommand,
  handleEosCommand,
  handleStatus,
  handleProfile,
  handleConnect,
  handleOnboarding,
  handleProgress,
  handleSync,
  handleDocument,
  handleDocs,
  handleSearch,
  handleAsk,
  handleTodo,
  contextResultLines,
  publicEosErrorMessage,
  sendCommandError,
  waitForEosReady,
  parseDocumentTags,
  githubRelationFromUrl,
  downloadDiscordAttachment,
  normalizeGitHubUsername,
  onboardingChecklist,
  onboardingNextStep,
  githubProfileFields,
  parseTodoTime,
  todoLine,
  todoApiError,
  TodoInputError,
  PRIVATE_EOS_SUBCOMMANDS,
};
