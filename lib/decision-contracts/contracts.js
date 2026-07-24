"use strict";

const crypto = require("node:crypto");
const { sha256, stableStringify } = require("../paper-ledger/contracts");

const SCORE_FIELDS = Object.freeze([
  "eventConfidence",
  "sourceConfidence",
  "interpretationConfidence",
  "directionalConfidence",
  "persistenceConfidence",
  "entryQuality",
  "executionConfidence",
]);

function validateOpportunityIntent(intent, now = Date.now()) {
  const requiredStrings = [
    "id",
    "createdAt",
    "expiresAt",
    "thesis",
    "asset",
    "symbol",
    "assetClass",
    "direction",
    "expectedHorizon",
    "urgencyClass",
    "methodologyVersion",
  ];
  for (const field of requiredStrings) {
    if (typeof intent?.[field] !== "string" || !intent[field].trim()) return failure("INVALID_OPPORTUNITY_INTENT", `${field} es obligatorio.`);
  }
  if (Date.parse(intent.createdAt) >= Date.parse(intent.expiresAt)) return failure("INVALID_INTENT_WINDOW", "createdAt debe ser anterior a expiresAt.");
  if (!Array.isArray(intent.sourceEvents) || !Array.isArray(intent.evidence)) return failure("MISSING_PROVENANCE", "sourceEvents y evidence son obligatorios.");
  if (!intent.feedQuality || typeof intent.feedQuality !== "object" || !intent.symbolFreshness || typeof intent.symbolFreshness !== "object") {
    return failure("MISSING_MARKET_QUALITY", "feedQuality y symbolFreshness son obligatorios.");
  }
  for (const field of SCORE_FIELDS) {
    const value = intent[field];
    if (value == null || value === "unknown") continue;
    if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1) {
      return failure("INVALID_CONFIDENCE_SCORE", `${field} debe ser null, unknown o un score 0..1.`);
    }
  }
  const expired = Date.parse(intent.expiresAt) <= Number(now);
  const trusted = intent.feedQuality.trusted === true && intent.symbolFreshness.trusted === true;
  if ((expired || !trusted) && intent.operable === true) return failure("INVALID_OPERABILITY", "Un intent expirado o con feed no trusted no puede ser operable.");
  return { ok: true, expired, operable: Boolean(intent.operable) && !expired && trusted };
}

function createOpportunityIntent(input, options = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  const intent = {
    id: input.id || crypto.randomUUID(),
    createdAt,
    expiresAt: input.expiresAt,
    sourceEvents: input.sourceEvents || [],
    thesis: input.thesis,
    asset: input.asset,
    symbol: input.symbol,
    assetClass: input.assetClass || "spot",
    direction: input.direction || "long",
    expectedHorizon: input.expectedHorizon || "unknown",
    urgencyClass: input.urgencyClass || "normal",
    eventConfidence: input.eventConfidence ?? null,
    sourceConfidence: input.sourceConfidence ?? null,
    interpretationConfidence: input.interpretationConfidence ?? null,
    directionalConfidence: input.directionalConfidence ?? null,
    persistenceConfidence: input.persistenceConfidence ?? null,
    entryQuality: input.entryQuality ?? null,
    executionConfidence: input.executionConfidence ?? null,
    maximumRisk: input.maximumRisk ?? null,
    invalidation: input.invalidation || null,
    marketContext: input.marketContext || {},
    feedQuality: input.feedQuality,
    symbolFreshness: input.symbolFreshness,
    methodologyVersion: input.methodologyVersion || "opportunity-intent.v1",
    evidence: input.evidence || [],
    operable: input.operable === true,
  };
  const validation = validateOpportunityIntent(intent, options.now);
  if (!validation.ok) throw Object.assign(new Error(validation.message), { code: validation.code });
  return { ...intent, operable: validation.operable };
}

function commandFingerprint(command) {
  return sha256(stableStringify(sanitizeCommand(command)));
}

function sanitizeCommand(command) {
  const allowed = [
    "type",
    "symbol",
    "positionId",
    "tradeId",
    "capital",
    "entry",
    "stop",
    "target",
    "fraction",
    "exit",
    "reason",
    "source",
    "expectedVersion",
  ];
  return Object.fromEntries(allowed.filter(key => command[key] !== undefined).map(key => [key, command[key]]));
}

function validateCommandDraft(draft) {
  if (!draft?.id || !draft?.sessionId || !draft?.commandFingerprint) return failure("INVALID_COMMAND_DRAFT", "Draft incompleto.");
  if (Date.parse(draft.createdAt) >= Date.parse(draft.expiresAt)) return failure("INVALID_DRAFT_WINDOW", "Ventana de draft inválida.");
  if (!draft.interpretation || !draft.consequences || !draft.feedEvidence) return failure("INCOMPLETE_DRAFT_DISCLOSURE", "El draft no muestra interpretación, consecuencias y feed.");
  return { ok: true };
}

function validateHumanConfirmation(confirmation) {
  if (!confirmation?.id || !confirmation?.draftId || !confirmation?.sessionId) return failure("INVALID_HUMAN_CONFIRMATION", "Confirmación incompleta.");
  if (!confirmation.confirmedAt || !confirmation.expiresAt) return failure("INVALID_HUMAN_CONFIRMATION", "Tiempos de confirmación incompletos.");
  return { ok: true };
}

function failure(code, message) {
  return { ok: false, code, message };
}

module.exports = {
  SCORE_FIELDS,
  commandFingerprint,
  createOpportunityIntent,
  sanitizeCommand,
  validateCommandDraft,
  validateHumanConfirmation,
  validateOpportunityIntent,
};
