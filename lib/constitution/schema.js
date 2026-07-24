"use strict";

const STAGES = Object.freeze([
  "CAPITAL_BUILDING",
  "EXPANSION",
  "PRESERVATION",
  "PATRIMONIAL_ALLOCATION",
]);

function validateConstitution(document) {
  const requiredStrings = [
    "constitutionId",
    "version",
    "status",
    "createdAt",
    "effectiveAt",
    "contentHash",
    "objective",
    "stage",
  ];
  for (const field of requiredStrings) {
    if (typeof document?.[field] !== "string" || !document[field].trim()) return failure(`Falta ${field}.`);
  }
  if (!STAGES.includes(document.stage)) return failure("Etapa constitucional inválida.");
  if (!["DRAFT", "ACTIVE", "RETIRED"].includes(document.status)) return failure("Estado constitucional inválido.");
  for (const field of [
    "nonNegotiableLimits",
    "autonomyPolicy",
    "riskProfiles",
    "drawdownPolicy",
    "profitConsolidationPolicy",
    "stageTransitionPolicy",
    "vetoPolicy",
    "changeControl",
  ]) {
    if (!document[field] || typeof document[field] !== "object") return failure(`Falta ${field}.`);
  }
  if (!Array.isArray(document.prohibitions)) return failure("prohibitions debe ser un array.");
  const limits = document.nonNegotiableLimits;
  if (limits.paperOnly !== true) return failure("La Constitución debe ser PAPER_ONLY.");
  for (const field of ["liveTrading", "externalAccounts", "brokerExecution", "walletSigning", "withdrawals", "transfers", "custody"]) {
    if (limits[field] !== false) return failure(`${field} debe permanecer deshabilitado.`);
  }
  if (Number(limits.maximumInitialAutonomousAllocationPct) > 0.05) return failure("La asignación autónoma supera 5%.");
  if (document.stageTransitionPolicy.automaticTransitions !== false || document.stageTransitionPolicy.humanConfirmationRequired !== true) {
    return failure("Las transiciones de etapa deben ser humanas y auditables.");
  }
  if (document.changeControl.silentFileActivation !== false || document.changeControl.humanApprovalRequired !== true) {
    return failure("El change control constitucional es insuficiente.");
  }
  return { ok: true };
}

function failure(message) {
  return { ok: false, code: "INVALID_CONSTITUTION", message };
}

module.exports = { STAGES, validateConstitution };
