const { EmbedBuilder } = require("discord.js");

function buildVenuSetupEmbed(repositoryUrl = process.env.VENU_REPOSITORY_URL || "https://github.com/RoboBearLLC/VenuAI") {
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
          `Jeremy must grant your GitHub account access first. Confirm that ${repositoryUrl} opens, then run \`git clone ${repositoryUrl}.git\` and \`cd VenuAI\`.`,
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
      },
      {
        name: "6. Ship your first-week task",
        value:
          "Use Venu, identify one bug or pain point, assign/claim it yourself, and fix it within one week. Keep the GitHub issue and PR linked so EOS can follow the work once GitHub ingestion is enabled.",
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
