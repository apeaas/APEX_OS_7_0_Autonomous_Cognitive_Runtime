"use strict";

function explainRiskDecision(decision) {
  const headline = {
    approve: "Risk aprobó el intent dentro de todos los límites.",
    reduce: "Risk redujo el tamaño para respetar el límite más restrictivo.",
    delay: "Risk demoró el intent hasta recuperar evidencia operable.",
    reject: "Risk rechazó el intent.",
  }[decision.decision] || "Risk no produjo una decisión válida.";
  return {
    headline,
    reasons: decision.reasons.slice(),
    warnings: decision.warnings.slice(),
    approvedSize: decision.approvedSize,
    approvedRisk: decision.approvedRisk,
    policyVersion: decision.policyVersion,
    constitutionVersion: decision.constitutionVersion,
  };
}

module.exports = { explainRiskDecision };
