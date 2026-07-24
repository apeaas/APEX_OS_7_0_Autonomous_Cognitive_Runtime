"use strict";

const { validateLegacyPortfolio } = require("../portfolio/validators");

function prepareLegacyImport(input, events) {
  const validated = validateLegacyPortfolio(input);
  if (!validated.ok) return validated;
  const prior = events.find(event => event.type === "legacy_portfolio_imported");
  if (!prior) return validated;
  if (prior.payload.fingerprint === validated.fingerprint) {
    return { ...validated, duplicate: true, priorEvent: prior };
  }
  return {
    ok: false,
    code: "LEGACY_FINGERPRINT_CONFLICT",
    message: "Ya existe una importación heredada con otro fingerprint.",
  };
}

function migrationStatus(events) {
  const imported = events.find(event => event.type === "legacy_portfolio_imported");
  return imported
    ? {
        imported: true,
        eventId: imported.id,
        importedAt: imported.occurredAt,
        fingerprint: imported.payload.fingerprint,
      }
    : { imported: false };
}

module.exports = { migrationStatus, prepareLegacyImport };
