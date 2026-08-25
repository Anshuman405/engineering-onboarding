const STATUS_MONITOR_DURATION_MS = 30 * 60 * 1000;
const DEFAULT_STATUS_CHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_STATUS_HTTP_TIMEOUT_MS = 10 * 1000;

const DEFAULT_STATUS_TARGETS = Object.freeze([
  {
    id: "staging-frontend",
    name: "Frontend",
    environment: "STAGING",
    type: "frontend",
    envKey: "STATUS_STAGING_FRONTEND_URL",
    url: "https://staging.venu3d.com/",
    method: "HEAD",
    expectedStatuses: [200],
  },
  {
    id: "staging-backend",
    name: "Backend",
    environment: "STAGING",
    type: "backend",
    envKey: "STATUS_STAGING_BACKEND_URL",
    url: "https://venu-backend-staging-g7cbd6dmhyf0a4hf.centralus-01.azurewebsites.net/health/",
    method: "HEAD",
    expectedStatuses: [200],
  },
  {
    id: "testing-frontend",
    name: "Frontend",
    environment: "TESTING",
    type: "frontend",
    envKey: "STATUS_TESTING_FRONTEND_URL",
    url: "https://testing.venu3d.com/",
    method: "HEAD",
    expectedStatuses: [200],
  },
  {
    id: "testing-backend",
    name: "Backend",
    environment: "TESTING",
    type: "backend",
    envKey: "STATUS_TESTING_BACKEND_URL",
    url: "https://venu-backend-daenhabecsdnaddy.westus2-01.azurewebsites.net/health/",
    method: "HEAD",
    expectedStatuses: [200],
  },
  {
    id: "production-frontend",
    name: "Frontend",
    environment: "PRODUCTION",
    type: "frontend",
    envKey: "STATUS_PRODUCTION_FRONTEND_URL",
    url: "https://ai.venu3d.com/",
    method: "HEAD",
    expectedStatuses: [200],
  },
  {
    id: "production-backend",
    name: "Backend",
    environment: "PRODUCTION",
    type: "backend",
    envKey: "STATUS_PRODUCTION_BACKEND_URL",
    // The production branch does not yet expose /health/. This public,
    // read-only Django page is the lightest verified 200 endpoint available.
    url: "https://venu-backend-prod-gycmf8edhcb4b0c0.centralus-01.azurewebsites.net/admin/login/",
    method: "HEAD",
    expectedStatuses: [200],
  },
]);

function positiveInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validateStatusTarget(target) {
  const errors = [];
  if (!target.id) errors.push("id is required");
  if (!target.name) errors.push("name is required");
  if (!["STAGING", "TESTING", "PRODUCTION"].includes(target.environment)) {
    errors.push("environment must be STAGING, TESTING, or PRODUCTION");
  }
  if (!["frontend", "backend"].includes(target.type)) {
    errors.push("type must be frontend or backend");
  }
  try {
    const parsed = new URL(target.url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      errors.push("URL must use HTTP or HTTPS");
    }
  } catch {
    errors.push("URL is invalid");
  }
  if (!Array.isArray(target.expectedStatuses) || target.expectedStatuses.length === 0 ||
      target.expectedStatuses.some((status) => !Number.isInteger(status) || status < 100 || status > 599)) {
    errors.push("expectedStatuses must contain valid HTTP status codes");
  }
  if (!Number.isInteger(target.timeoutMs) || target.timeoutMs <= 0) {
    errors.push("timeoutMs must be a positive integer");
  }
  return errors;
}

function validateStatusTargets(targets) {
  const errors = [];
  const ids = new Set();
  for (const target of targets) {
    if (ids.has(target.id)) errors.push(`${target.id}: duplicate id`);
    ids.add(target.id);
    for (const error of validateStatusTarget(target)) {
      errors.push(`${target.id || "unknown"}: ${error}`);
    }
  }

  for (const environment of ["STAGING", "TESTING", "PRODUCTION"]) {
    for (const type of ["frontend", "backend"]) {
      const count = targets.filter((target) => target.environment === environment && target.type === type).length;
      if (count !== 1) errors.push(`${environment.toLowerCase()}-${type}: expected exactly one target`);
    }
  }
  return errors;
}

function loadStatusConfig(env = process.env) {
  const timeoutMs = positiveInteger(env.STATUS_HTTP_TIMEOUT_MS, DEFAULT_STATUS_HTTP_TIMEOUT_MS);
  const targets = DEFAULT_STATUS_TARGETS.map((target) => ({
    ...target,
    expectedStatuses: [...target.expectedStatuses],
    url: (env[target.envKey] || target.url).trim(),
    timeoutMs,
  }));

  return {
    targets,
    validationErrors: validateStatusTargets(targets),
    checkIntervalMs: positiveInteger(env.STATUS_CHECK_INTERVAL_MS, DEFAULT_STATUS_CHECK_INTERVAL_MS),
    durationMs: STATUS_MONITOR_DURATION_MS,
  };
}

module.exports = {
  DEFAULT_STATUS_CHECK_INTERVAL_MS,
  DEFAULT_STATUS_HTTP_TIMEOUT_MS,
  DEFAULT_STATUS_TARGETS,
  STATUS_MONITOR_DURATION_MS,
  loadStatusConfig,
  validateStatusTarget,
  validateStatusTargets,
};
