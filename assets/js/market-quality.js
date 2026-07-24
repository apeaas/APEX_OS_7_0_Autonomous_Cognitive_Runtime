"use strict";

(function exposeMarketQuality(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.APEX_MARKET_QUALITY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const STATUSES = Object.freeze(["healthy", "degraded", "stale", "disconnected", "recovering"]);
  const ACTIONS_REQUIRING_TRUST = new Set([
    "think",
    "governance",
    "risk",
    "paper_open",
    "paper_close",
    "paper_modify",
    "autonomous_cycle",
  ]);

  function normalize(input = {}) {
    const status = STATUSES.includes(input.status) ? input.status : "disconnected";
    return {
      status,
      trusted: status === "healthy" && input.trusted === true,
      source: String(input.source || "unknown"),
      reason: String(input.reason || "quality_not_confirmed"),
      lastDataAt: input.lastDataAt || null,
      ageMs: Number.isFinite(Number(input.ageMs)) ? Number(input.ageMs) : null,
      latencyMs: Number.isFinite(Number(input.latencyMs)) ? Number(input.latencyMs) : null,
      sequence: Number.isFinite(Number(input.sequence)) ? Number(input.sequence) : 0,
      issues: Array.isArray(input.issues) ? input.issues.slice(0, 50) : [],
      symbols: input.symbols && typeof input.symbols === "object" ? input.symbols : {},
    };
  }

  function isTrusted(input) {
    const quality = normalize(input);
    return quality.status === "healthy" && quality.trusted === true;
  }

  function gate(action, input) {
    const quality = normalize(input);
    const requiresTrust = ACTIONS_REQUIRING_TRUST.has(String(action || ""));
    if (!requiresTrust || isTrusted(quality)) return { ok: true, quality };
    return {
      ok: false,
      quality,
      code: "MARKET_DATA_NOT_TRUSTED",
      message: `Datos de mercado ${quality.status}; la acción ${action} queda bloqueada hasta recuperar calidad saludable.`,
    };
  }

  function clientSource(input, consecutiveFailures = 0) {
    const quality = normalize(input);
    if (isTrusted(quality)) return "gateway";
    return Number(consecutiveFailures) >= 3 || quality.status === "disconnected" ? "direct_fallback" : "gateway_wait";
  }

  function label(input) {
    const quality = normalize(input);
    return {
      healthy: "LIVE · GATEWAY",
      degraded: "DEGRADADO · SIN OPERAR",
      stale: "OBSOLETO · SIN OPERAR",
      disconnected: "DESCONECTADO · SIN OPERAR",
      recovering: "RECUPERANDO · SIN OPERAR",
    }[quality.status];
  }

  return Object.freeze({ STATUSES, normalize, isTrusted, gate, clientSource, label });
});
