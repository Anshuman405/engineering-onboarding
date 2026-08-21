const { eosRequest } = require("./client");

async function syncMemberToEOS(member) {
  return eosRequest("/api/engineers/onboarding", {
    method: "POST",
    body: JSON.stringify({
      discordUserId: member.id,
      name:
        member.displayName ||
        member.user.username,
      email: null,
      githubUsername: null,
    }),
  });
}

async function syncTallyToEOS(data, member) {
  return eosRequest("/api/engineers/onboarding", {
    method: "POST",
    body: JSON.stringify({
      discordUserId: member.id,
      name: data.name,
      email: data.email || null,
      githubUsername: data.github || data.githubUsername || null,
    }),
  });
}

module.exports = {
  syncMemberToEOS,
  syncTallyToEOS,
};
