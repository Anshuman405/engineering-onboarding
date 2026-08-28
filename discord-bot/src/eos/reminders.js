const { EmbedBuilder } = require("discord.js");
const { randomUUID } = require("node:crypto");
const { eosRequest } = require("./client");

const DEFAULT_REMINDER_POLL_MS = 30_000;

function reminderPollMs(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 5_000 && parsed <= 300_000
    ? parsed
    : DEFAULT_REMINDER_POLL_MS;
}

function reminderEmbed(reminder) {
  const task = reminder.personalTask;
  const embed = new EmbedBuilder()
    .setTitle(`⏰ EOS reminder — Task #${task.number}`)
    .setDescription(`**${task.title}**${task.description ? `\n\n${String(task.description).slice(0, 1500)}` : ""}`)
    .setFooter({ text: `Run /eos todo done task:${task.number} when finished, or /eos todo snooze to move this reminder.` })
    .setTimestamp();
  if (task.dueAt) embed.addFields({ name: "Due", value: `<t:${Math.floor(new Date(task.dueAt).getTime() / 1000)}:F>` });
  return embed;
}

class EosReminderWorker {
  constructor(client, options = {}) {
    this.client = client;
    this.request = options.request || eosRequest;
    this.pollMs = reminderPollMs(options.pollMs ?? process.env.EOS_REMINDER_POLL_MS);
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    this.workerId = options.workerId || `discord-bot-${randomUUID()}`;
    this.timer = null;
    this.running = false;
    this.inFlight = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  schedule(delay) {
    if (!this.running) return;
    this.timer = this.setTimeoutFn(() => {
      this.inFlight = this.poll()
        .catch((error) => console.error("EOS reminder poll failed:", error?.message || "unknown error"))
        .finally(() => {
          this.inFlight = null;
          this.schedule(this.pollMs);
        });
    }, delay);
    this.timer.unref?.();
  }

  async poll() {
    const result = await this.request("/api/personal-tasks/reminders/claim", {
      method: "POST",
      body: JSON.stringify({ workerId: this.workerId, limit: 10, leaseSeconds: 90 }),
    });
    const reminders = result.data || [];
    await Promise.allSettled(reminders.map((reminder) => this.deliver(reminder)));
    return reminders.length;
  }

  async deliver(reminder) {
    let delivered = false;
    let errorMessage;
    try {
      const user = await this.client.users.fetch(reminder.personalTask.engineer.discordUserId);
      await user.send({ embeds: [reminderEmbed(reminder)], allowedMentions: { parse: [] } });
      delivered = true;
    } catch (error) {
      errorMessage = String(error?.message || "Discord delivery failed").slice(0, 500);
    }
    try {
      await this.request(`/api/personal-tasks/reminders/${reminder.id}/finish`, {
        method: "POST",
        body: JSON.stringify({ claimToken: reminder.claimToken, delivered, ...(errorMessage ? { error: errorMessage } : {}) }),
      });
    } catch (error) {
      console.error("EOS reminder acknowledgement failed:", error?.message || "unknown error");
    }
  }

  async stop() {
    this.running = false;
    if (this.timer) this.clearTimeoutFn(this.timer);
    this.timer = null;
    await this.inFlight?.catch(() => undefined);
  }
}

module.exports = { DEFAULT_REMINDER_POLL_MS, EosReminderWorker, reminderEmbed, reminderPollMs };
