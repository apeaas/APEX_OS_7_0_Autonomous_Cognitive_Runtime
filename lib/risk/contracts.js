"use strict";

const RISK_DECISIONS = Object.freeze(["approve", "reduce", "delay", "reject"]);

function validateRiskDecision(decision) {
  if (!decision || !RISK_DECISIONS.includes(decision.decision)) return failure("INVALID_RISK_DECISION");
  for (const field of ["reasons", "limitsApplied", "warnings"]) {
    if (!Array.isArray(decision[field])) return failure(`INVALID_${field.toUpperCase()}`);
  }
  for (const field of ["policyVersion", "constitutionVersion", "evaluatedAt"]) {
    if (typeof decision[field] !== "string" || !decision[field]) return failure(`MISSING_${field.toUpperCase()}`);
  }
  if (!decision.feedEvidence || typeof decision.feedEvidence !== "object") return failure("MISSING_FEED_EVIDENCE");
  return { ok: true };
}

function failure(code) {
  return { ok: false, code };
}

module.exports = { RISK_DECISIONS, validateRiskDecision };
