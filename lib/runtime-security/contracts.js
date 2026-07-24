"use strict";

const MUTABLE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const JSON_TYPES = new Set(["application/json", "application/merge-patch+json"]);

const ROUTE_CONTRACTS = Object.freeze([
  contract("POST", /^\/api\/assistant$/, "json", 128_000),
  contract("POST", /^\/api\/runtime\/snapshot$/, "json", 512_000),
  contract("POST", /^\/api\/runtime\/events$/, "json", 512_000),
  contract("POST", /^\/api\/runtime\/mode$/, "json", 16_000),
  contract("PATCH", /^\/api\/runtime\/config$/, "json", 32_000),
  contract("POST", /^\/api\/runtime\/cycle$/, "json", 16_000),
  contract("POST", /^\/api\/runtime\/emergency$/, "json", 16_000, { safeDuringKillSwitch: true }),
  contract("POST", /^\/api\/runtime\/actions\/[^/]+\/(?:claim|result|cancel)$/, "json", 32_000),
  contract("POST", /^\/api\/runtime\/plans$/, "json", 64_000),
  contract("PATCH", /^\/api\/runtime\/plans\/[^/]+$/, "json", 64_000),
  contract("POST", /^\/api\/runtime\/export$/, "json", 2_000, { safeDuringKillSwitch: true }),
  contract("POST", /^\/api\/paper\/commands$/, "json", 64_000),
  contract("POST", /^\/api\/portfolio\/import$/, "json", 512_000),
  contract("POST", /^\/api\/risk\/evaluate$/, "json", 64_000, { safeDuringKillSwitch: true }),
  contract("POST", /^\/api\/fund\/commands$/, "json", 64_000, { safeDuringKillSwitch: true }),
  contract("POST", /^\/api\/decision\/drafts$/, "json", 64_000),
  contract("POST", /^\/api\/decision\/drafts\/[^/]+\/confirm$/, "json", 16_000),
  contract("POST", /^\/api\/improvements$/, "json", 128_000),
  contract("POST", /^\/api\/improvements\/[^/]+\/evaluate$/, "json", 128_000),
  contract("POST", /^\/api\/improvements\/[^/]+\/status$/, "json", 32_000),
  contract("POST", /^\/api\/voice\/sessions$/, "json", 8_000),
  contract("POST", /^\/api\/voice\/sessions\/[^/]+\/call$/, "sdp", 256_000),
  contract("POST", /^\/api\/voice\/sessions\/[^/]+\/tools$/, "json", 64_000, { safeDuringKillSwitch: true }),
  contract("POST", /^\/api\/voice\/sessions\/[^/]+\/interrupt$/, "json", 2_000, { safeDuringKillSwitch: true }),
  contract("POST", /^\/api\/voice\/sessions\/[^/]+\/disconnect$/, "json", 2_000, { safeDuringKillSwitch: true }),
]);

function contract(method, pattern, bodyType, maxBytes, options = {}) {
  return Object.freeze({ method, pattern, bodyType, maxBytes, safeDuringKillSwitch: false, ...options });
}

function findRouteContract(method, pathname) {
  return ROUTE_CONTRACTS.find(item => item.method === method && item.pattern.test(pathname)) || null;
}

function isMutableMethod(method) {
  return MUTABLE_METHODS.has(String(method || "").toUpperCase());
}

function mediaType(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function contentTypeAllowed(routeContract, value) {
  const type = mediaType(value);
  if (routeContract.bodyType === "json") return JSON_TYPES.has(type);
  if (routeContract.bodyType === "sdp") return type === "application/sdp";
  return false;
}

function validatePayload(method, pathname, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return failure("INVALID_SCHEMA", "El cuerpo debe ser un objeto JSON.");
  }

  if (method === "POST" && pathname === "/api/runtime/mode") {
    return oneOf(payload.mode, ["observe", "copilot", "paper_autonomous", "suspended"], "mode");
  }
  if (method === "POST" && pathname === "/api/runtime/emergency" && payload.enabled != null && typeof payload.enabled !== "boolean") {
    return failure("INVALID_SCHEMA", "enabled debe ser boolean.");
  }
  if (method === "POST" && pathname === "/api/runtime/plans") {
    if (!nonEmptyString(payload.title) || !nonEmptyString(payload.objective)) {
      return failure("INVALID_SCHEMA", "title y objective son obligatorios.");
    }
  }
  if (method === "POST" && pathname === "/api/paper/commands" && !nonEmptyString(payload.type)) {
    return failure("INVALID_SCHEMA", "type es obligatorio para un comando PAPER.");
  }
  if (method === "POST" && pathname === "/api/portfolio/import" && (!payload.portfolio || typeof payload.portfolio !== "object")) {
    return failure("INVALID_SCHEMA", "portfolio es obligatorio para la importación.");
  }
  if (method === "POST" && pathname === "/api/risk/evaluate" && !nonEmptyString(payload.type)) {
    return failure("INVALID_SCHEMA", "type es obligatorio para evaluar Risk.");
  }
  if (method === "POST" && pathname === "/api/fund/commands" && !nonEmptyString(payload.type)) {
    return failure("INVALID_SCHEMA", "type es obligatorio para un comando de fondo.");
  }
  if (method === "POST" && pathname === "/api/decision/drafts" && (!payload.command || typeof payload.command !== "object")) {
    return failure("INVALID_SCHEMA", "command es obligatorio para crear un draft.");
  }
  if (/^\/api\/decision\/drafts\/[^/]+\/confirm$/.test(pathname) && payload.accepted !== true) {
    return failure("INVALID_SCHEMA", "accepted=true es obligatorio para confirmar.");
  }
  if (method === "POST" && pathname === "/api/improvements" && !nonEmptyString(payload.problemStatement)) {
    return failure("INVALID_SCHEMA", "problemStatement es obligatorio.");
  }
  if (/^\/api\/improvements\/[^/]+\/evaluate$/.test(pathname) && (!payload.results || typeof payload.results !== "object")) {
    return failure("INVALID_SCHEMA", "results es obligatorio para evaluar.");
  }
  if (/^\/api\/improvements\/[^/]+\/status$/.test(pathname) && !nonEmptyString(payload.status)) {
    return failure("INVALID_SCHEMA", "status es obligatorio.");
  }
  if (method === "POST" && pathname === "/api/voice/sessions" && payload.preferredProvider != null) {
    return oneOf(payload.preferredProvider, ["openai-realtime", "mock"], "preferredProvider");
  }
  if (/^\/api\/voice\/sessions\/[^/]+\/tools$/.test(pathname)) {
    if (!nonEmptyString(payload.callId) || !nonEmptyString(payload.name) || !payload.arguments || typeof payload.arguments !== "object") {
      return failure("INVALID_SCHEMA", "callId, name y arguments son obligatorios.");
    }
  }
  if (/^\/api\/runtime\/actions\/[^/]+\/result$/.test(pathname)) {
    if (!nonEmptyString(payload.claimId) || !nonEmptyString(payload.nonce)) {
      return failure("INVALID_SCHEMA", "claimId y nonce son obligatorios para completar una acción.");
    }
  }
  if (/^\/api\/runtime\/actions\/[^/]+\/claim$/.test(pathname) && payload.claimant != null && !nonEmptyString(payload.claimant)) {
    return failure("INVALID_SCHEMA", "claimant debe ser un string no vacío.");
  }
  return { ok: true };
}

function parseJsonBody(text) {
  try {
    return JSON.parse(String(text || "{}"));
  } catch {
    const error = new Error("JSON inválido.");
    error.code = "INVALID_JSON";
    error.statusCode = 400;
    throw error;
  }
}

function oneOf(value, values, field) {
  return values.includes(value) ? { ok: true } : failure("INVALID_SCHEMA", `${field} no es válido.`);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(code, message) {
  return { ok: false, code, message };
}

module.exports = {
  MUTABLE_METHODS,
  ROUTE_CONTRACTS,
  contentTypeAllowed,
  findRouteContract,
  isMutableMethod,
  mediaType,
  parseJsonBody,
  validatePayload,
};
