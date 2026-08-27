# Engineering onboarding and EOS integration

The existing bot continues to manage onboarding, member identity synchronization, and `/eos` commands. It does not mirror Discord messages or run historical backfills.

Engineers run `/eos onboarding github:<username> email:<email>`. One private response links the EOS identity, detects whether the Tally form is already complete, explains that Jeremy grants private VenuAI repository access separately, provides the Venu 1.x setup checklist when ready, and states the first-week task: use Venu, identify and claim a bug or pain point, and fix it within one week. `/eos profile` checks progress; `/eos connect` is only needed later if an email or GitHub username changes. All identity commands are private.

## Shareable new-member instructions

Send new engineers this short workflow:

> Welcome to Venu! Run `/eos onboarding` and enter your GitHub username and email. EOS will show your current step and remember your progress. If you already submitted the onboarding form, run the command anyway—it will detect that and skip the form. Jeremy must grant your GitHub account access to the private VenuAI repository; EOS cannot grant that permission. Once access works, follow the setup checklist and complete your first-week task: use Venu, identify and claim one bug or pain point, and ship the fix within one week. Use `/eos profile` anytime to check your information, and use `/eos connect` only if it needs to change.

`/eos search query:...` privately searches one bounded engineering-context package: documentation, durable knowledge, tasks, ownership, GitHub records, and relevant live messages from the current Discord channel. It returns source links and continues to return durable EOS results when Discord is temporarily unavailable. Live Discord message content is not written to Neon.

Copy `discord-bot/.env.example` to `discord-bot/.env`, preserve the existing onboarding settings, and configure:

```env
EOS_API_URL=http://localhost:3000
EOS_API_KEY=<same key configured in EOS>
TALLY_FORM_URL=<public Venu onboarding form URL>
ONBOARDING_WEBHOOK_SECRET=<dedicated random secret shared with the Tally Apps Script>
```

EOS performs bounded message retrieval directly from Discord when context is requested. Configure `DISCORD_BOT_TOKEN` in EOS with the same bot token if live retrieval is needed. The onboarding bot requires only its existing Guild and GuildMembers intents; Message Content intent is not required for EOS mirroring because mirroring is disabled.

The Apps Script that sends completed Tally submissions to `POST /onboarding` must include either `Authorization: Bearer <ONBOARDING_WEBHOOK_SECRET>` or `x-onboarding-secret: <ONBOARDING_WEBHOOK_SECRET>`. The endpoint fails closed when the secret is missing or incorrect and logs only field-presence metadata, never the submitted email, GitHub username, or raw form payload.

## EOS documentation

`/eos document` lets an engineer create a short Drive-backed document, upload one PDF/Markdown/TXT/DOCX file, or index an existing Drive/external link. `/eos docs` first requests a bounded Drive-folder refresh and then searches the EOS documentation index; if Drive is temporarily unavailable it safely searches the existing durable index. Both workflows call the authenticated EOS API; the bot never accesses Neon directly and does not retain the attachment after the request completes.

Configure `EOS_DOCUMENT_MAX_UPLOAD_BYTES` to the same or a lower value than EOS `DOCUMENT_MAX_UPLOAD_BYTES` (10 MB by default). Create/upload require the EOS Google Drive provider; link-only records continue to work when Drive is unavailable. See the EOS repository's `docs/DOCUMENTATION.md` for Drive folder and service-account setup.

## Venu service status monitoring

`/status` creates one public Discord message, checks the staging, testing, and production frontend/backend services immediately, and edits that same message every 60 seconds for 30 minutes. Engineers can press **Refresh now** to run the same six checks immediately without creating another message or changing the automatic timer. The final edit marks the monitor expired and removes the button. Each invocation has an independent in-memory session; no status-session state or HTTP response body is persisted in EOS or Neon.

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

Sessions are intentionally not persisted for a 30-minute display feature. Graceful shutdown attempts to mark every active message as restarting and clears all timers. An abrupt platform termination cannot recover an old session; users must run `/status` again. On Render Free, `/eos` commands immediately acknowledge an interaction, show bounded wake-up progress, retry the sleeping EOS service, and automatically continue when it is ready. The Discord gateway bot itself still needs a running process; Free hosting cannot guarantee uninterrupted 24/7 uptime.

The bot exposes `GET /health` for operational diagnostics. It reports Discord gateway readiness and slash-command registration separately while keeping the HTTP process alive in a degraded state. Transient Discord registration failures receive a bounded retry; a permanent startup error is logged without becoming an unhandled rejection that crashes Node.

Run integration/publisher contract tests and syntax checks with:

```bash
cd discord-bot
npm test
npm run check
```
