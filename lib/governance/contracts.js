"use strict";

const GOVERNANCE_DECISIONS = Object.freeze(["approve", "reduce", "delay", "reject", "veto"]);

function validateGovernanceDecision(decision) {
  if (!decision || !GOVERNANCE_DECISIONS.includes(decision.decision)) return { ok: false, code: "INVALID_GOVERNANCE_DECISION" };
  if (!Array.isArray(decision.reasons) || !decision.policyVersion || !decision.constitutionVersion || !decision.evaluatedAt) {
    return { ok: false, code: "INCOMPLETE_GOVERNANCE_DECISION" };
  }
  if (typeof decision.operable !== "boolean" || typeof decision.requiredConfirmation !== "boolean") {
    return { ok: false, code: "INVALID_GOVERNANCE_OPERABILITY" };
  }
  return { ok: true };
}

module.exports = { GOVERNANCE_DECISIONS, validateGovernanceDecision };
