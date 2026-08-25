const { checkServices } = require("./healthChecker");
const { buildStatusEmbed } = require("./formatter");
const { STATUS_MONITOR_DURATION_MS, DEFAULT_STATUS_CHECK_INTERVAL_MS } = require("./config");

class StatusMonitorManager {
  constructor(options = {}) {
    this.check = options.check || checkServices;
    this.format = options.format || buildStatusEmbed;
    this.now = options.now || Date.now;
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    this.durationMs = options.durationMs || STATUS_MONITOR_DURATION_MS;
    this.defaultIntervalMs = options.intervalMs || DEFAULT_STATUS_CHECK_INTERVAL_MS;
    this.sessions = new Map();
    this.sequence = 0;
  }

  get activeCount() {
    return this.sessions.size;
  }

  async start({ message, targets, intervalMs }) {
    const id = message.id || `status-session-${++this.sequence}`;
    const startedAt = this.now();
    const session = {
      id,
      message,
      targets,
      intervalMs: intervalMs || this.defaultIntervalMs,
      startedAt,
      expiresAt: startedAt + this.durationMs,
      results: [],
      timer: null,
      active: true,
    };
    this.sessions.set(id, session);
    await this.update(session);
    if (session.active) this.schedule(session);
    return id;
  }

  async update(session) {
    if (!session.active) return;
    if (this.now() >= session.expiresAt) {
      await this.expire(session.id);
      return;
    }
    session.results = await this.check(session.targets);
    if (!session.active) return;
    try {
      await session.message.edit({
        embeds: [this.format({
          targets: session.targets,
          results: session.results,
          checkedAt: new Date(this.now()),
          expiresAt: session.expiresAt,
        })],
      });
    } catch (error) {
      this.remove(session);
      console.error("Status monitor message update failed:", error?.message || error);
    }
  }

  schedule(session) {
    if (!session.active || session.timer) return;
    const remaining = session.expiresAt - this.now();
    const delay = Math.max(0, Math.min(session.intervalMs, remaining));
    session.timer = this.setTimeoutFn(async () => {
      session.timer = null;
      if (!session.active) return;
      if (this.now() >= session.expiresAt) await this.expire(session.id);
      else {
        await this.update(session);
        if (session.active) this.schedule(session);
      }
    }, delay);
    session.timer?.unref?.();
  }

  remove(session) {
    session.active = false;
    if (session.timer) this.clearTimeoutFn(session.timer);
    session.timer = null;
    this.sessions.delete(session.id);
  }

  async expire(id, expirationReason) {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.remove(session);
    try {
      await session.message.edit({
        embeds: [this.format({
          targets: session.targets,
          results: session.results,
          checkedAt: new Date(this.now()),
          expiresAt: session.expiresAt,
          expired: true,
          expirationReason,
        })],
      });
    } catch (error) {
      console.error("Status monitor expiration update failed:", error?.message || error);
    }
    return true;
  }

  async expireAll(expirationReason = "The bot restarted. Run `/status` again to start a new 30-minute monitor.") {
    await Promise.all([...this.sessions.keys()].map((id) => this.expire(id, expirationReason)));
  }
}

module.exports = {
  StatusMonitorManager,
};
