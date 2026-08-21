const { eosRequest } = require("./client");

async function syncMemberToEOS(member) {
  return eosRequest("/api/onboarding/member", {
    method: "POST",
    body: JSON.stringify({
      discordUserId: member.id,
      name: member.user.globalName || member.user.username,
      username: member.user.username,
    }),
  });
}

module.exports = {
  syncMemberToEOS,
};