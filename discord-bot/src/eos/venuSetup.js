const { EmbedBuilder } = require("discord.js");

function buildVenuSetupEmbed() {
  return new EmbedBuilder()
    .setTitle("Venu 1.x local development setup")
    .setDescription(
      "Your Venu onboarding form has been processed. Follow this checklist to set up Venu 1.x locally."
    )
    .addFields(
      {
        name: "1. Install Docker Desktop",
        value:
          "Open Docker Desktop and wait for **Engine Running**. Verify with `docker --version` and `docker compose version`.",
      },
      {
        name: "2. Clone VenuAI",
        value:
          "Ask Jeremy for the latest repository URL, then run `git clone <repository-url>` and `cd VenuAI`.",
      },
      {
        name: "3. Install Codex",
        value:
          "Run `npm install -g @openai/codex`, verify with `codex --version`, then launch `codex` inside the VenuAI folder. Coordinate with Jeremy before requesting the email sign-in code.",
      },
      {
        name: "4. Start and verify services",
        value:
          "First build: `docker compose up -d --build`\nDaily start: `docker compose up -d`\nVerify: `docker compose ps`\nExpected: postgres, redis, backend, frontend, worker, and beat.",
      },
      {
        name: "5. Test Venu 1.x",
        value:
          "Open http://localhost:3000 and test registration/login, basic navigation, and email functionality. Use `docker compose logs -f frontend backend` when troubleshooting.",
      }
    )
    .setFooter({
      text: "Avoid committing or pushing changes until they are ready.",
    })
    .setTimestamp();
}

async function sendVenuSetupInstructions(member) {
  return member.send({
    embeds: [buildVenuSetupEmbed()],
  });
}

module.exports = {
  buildVenuSetupEmbed,
  sendVenuSetupInstructions,
};
