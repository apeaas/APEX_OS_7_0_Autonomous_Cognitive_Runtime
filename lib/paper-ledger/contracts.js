"use strict";

const crypto = require("node:crypto");

const EVENT_TYPES = Object.freeze([
  "portfolio_initialized",
  "legacy_portfolio_imported",
  "paper_order_submitted",
  "paper_order_filled",
  "paper_position_modified",
  "paper_position_closed",
  "paper_cash_adjusted",
  "autonomous_fund_authorized",
  "autonomous_fund_activated",
  "profit_consolidated",
  "fund_restricted",
  "fund_frozen",
]);

const EVENT_TYPE_SET = new Set(EVENT_TYPES);
const EVENT_SCHEMA_VERSION = "1.0.0";

function validateEvent(event) {
  const requiredStrings = [
    "id",
    "type",
    "occurredAt",
    "recordedAt",
    "aggregateId",
    "idempotencyKey",
    "causationId",
    "correlationId",
    "sessionId",
    "policyVersion",
    "schemaVersion",
  ];
  for (const field of requiredStrings) {
    if (typeof event?.[field] !== "string" || !event[field].trim()) {
      return failure("INVALID_EVENT", `${field} es obligatorio.`);
    }
  }
  if (!EVENT_TYPE_SET.has(event.type)) return failure("INVALID_EVENT_TYPE", `Evento no permitido: ${event.type}.`);
  if (!validIsoDate(event.occurredAt) || !validIsoDate(event.recordedAt)) return failure("INVALID_EVENT_TIME", "Los tiempos del evento no son válidos.");
  if (!event.actor || typeof event.actor !== "object" || !event.actor.type || !event.actor.id) {
    return failure("INVALID_EVENT_ACTOR", "El actor del evento es obligatorio.");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return failure("INVALID_EVENT_PAYLOAD", "El payload del evento debe ser un objeto.");
  }
  if (!event.integrity || event.integrity.algorithm !== "sha256" || !event.integrity.checksum) {
    return failure("INVALID_EVENT_INTEGRITY", "La integridad del evento es obligatoria.");
  }
  return { ok: true };
}

function checksumFor(event, previousChecksum = null) {
  const unsigned = { ...event };
  delete unsigned.integrity;
  return sha256(stableStringify({ event: unsigned, previousChecksum }));
}

function stableStringify(value) {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortRecursively(value[key])]));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function validIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function failure(code, message) {
  return { ok: false, code, message };
}

module.exports = {
  EVENT_SCHEMA_VERSION,
  EVENT_TYPES,
  checksumFor,
  sha256,
  stableStringify,
  validateEvent,
};
