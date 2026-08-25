# Engineering onboarding and EOS integration

The existing bot continues to manage onboarding, member identity synchronization, and `/eos` commands. It does not mirror Discord messages or run historical backfills.

Engineers can run `/eos onboarding` with their GitHub username and email. The command privately links those values to EOS and provides the configured Tally form. When the existing Tally callback successfully processes the form, the bot marks EOS onboarding complete and DMs the engineer the Venu 1.x local-development checklist.

Copy `discord-bot/.env.example` to `discord-bot/.env`, preserve the existing onboarding settings, and configure:

```env
EOS_API_URL=http://localhost:3000
EOS_API_KEY=<same key configured in EOS>
TALLY_FORM_URL=<public Venu onboarding form URL>
ONBOARDING_WEBHOOK_SECRET=<dedicated random secret shared with the Tally Apps Script>
```

EOS performs bounded message retrieval directly from Discord when context is requested. Configure `DISCORD_BOT_TOKEN` in EOS with the same bot token if live retrieval is needed. The onboarding bot requires only its existing Guild and GuildMembers intents; Message Content intent is not required for EOS mirroring because mirroring is disabled.

The Apps Script that sends completed Tally submissions to `POST /onboarding` must include either `Authorization: Bearer <ONBOARDING_WEBHOOK_SECRET>` or `x-onboarding-secret: <ONBOARDING_WEBHOOK_SECRET>`. The endpoint fails closed when the secret is missing or incorrect and logs only field-presence metadata, never the submitted email, GitHub username, or raw form payload.

## Venu service status monitoring

`/status` creates one public Discord message, checks the staging, testing, and production frontend/backend services immediately, and edits that same message every 60 seconds for 30 minutes. The final edit marks the monitor expired. Each invocation has an independent in-memory session; no status-session state or HTTP response body is persisted in EOS or Neon.

The six verified defaults are declared once in `discord-bot/src/status/config.js` and can be overridden through:

```env
STATUS_STAGING_FRONTEND_URL=https://staging.venu3d.com/
STATUS_STAGING_BACKEND_URL=https://venu-backend-staging-g7cbd6dmhyf0a4hf.centralus-01.azurewebsites.net/health/
STATUS_TESTING_FRONTEND_URL=https://testing.venu3d.com/
STATUS_TESTING_BACKEND_URL=https://venu-backend-daenhabecsdnaddy.westus2-01.azurewebsites.net/health/
STATUS_PRODUCTION_FRONTEND_URL=https://ai.venu3d.com/
STATUS_PRODUCTION_BACKEND_URL=https://venu-backend-prod-gycmf8edhcb4b0c0.centralus-01.azurewebsites.net/admin/login/
STATUS_CHECK_INTERVAL_MS=60000
STATUS_HTTP_TIMEOUT_MS=10000
```

Checks use lightweight `HEAD` requests, bounded timeouts, and expected HTTP 200 responses. The production branch does not currently expose `/health/`; its public Django admin login page is the verified temporary health target. Backport the repository's `/health/` route to production and update `STATUS_PRODUCTION_BACKEND_URL` when deployed.

Sessions are intentionally not persisted for a 30-minute display feature. Graceful shutdown attempts to mark every active message as restarting and clears all timers. An abrupt platform termination cannot recover an old session; users must run `/status` again. Render must use an always-on instance for guaranteed 24/7 Discord availability—the current Free web-service plan is not a 24/7 availability guarantee.

Run integration/publisher contract tests and syntax checks with:

```bash
cd discord-bot
npm test
npm run check
```
