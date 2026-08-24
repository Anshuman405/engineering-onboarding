const { timingSafeEqual } = require("node:crypto");

function readWebhookCredential(req) {
  const authorization = req.get("authorization") || "";

  if (/^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, "").trim();
  }

  return (req.get("x-onboarding-secret") || "").trim();
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function authorizeOnboardingWebhook(
  req,
  expectedSecret = process.env.ONBOARDING_WEBHOOK_SECRET
) {
  if (!expectedSecret) {
    return {
      ok: false,
      status: 503,
      error: "Onboarding webhook authentication is not configured",
    };
  }

  const credential = readWebhookCredential(req);

  if (!credential || !secureEqual(credential, expectedSecret)) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  return { ok: true };
}

function onboardingLogSummary(data) {
  const payload = data && typeof data === "object" ? data : {};

  return {
    fields: Object.keys(payload).sort(),
    hasDiscordIdentifier: Boolean(payload.discord),
    hasEmail: Boolean(payload.email),
    hasGitHub: Boolean(payload.github || payload.githubUsername),
  };
}

module.exports = {
  authorizeOnboardingWebhook,
  onboardingLogSummary,
};
