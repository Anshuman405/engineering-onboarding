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

Run integration/publisher contract tests and syntax checks with:

```bash
cd discord-bot
npm test
npm run check
```
