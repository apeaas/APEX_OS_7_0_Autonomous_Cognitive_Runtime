"use strict";

function evaluateConstitution(intent, constitution) {
  const reasons = [];
  const limits = constitution.nonNegotiableLimits;
  if (intent.executionMode && intent.executionMode !== "PAPER_ONLY") reasons.push("CONSTITUTION_PAPER_ONLY");
  if (intent.stage && intent.stage !== constitution.stage) reasons.push("STAGE_NOT_ACTIVE");
  if (Number(intent.autonomousAllocationPct || 0) > Number(limits.maximumInitialAutonomousAllocationPct)) reasons.push("CONSTITUTION_AUTONOMY_LIMIT");
  if (intent.capability && constitution.prohibitions.includes(String(intent.capability).toUpperCase())) reasons.push("CONSTITUTION_PROHIBITION");
  return {
    allowed: reasons.length === 0,
    reasons,
    constitutionId: constitution.constitutionId,
    constitutionVersion: constitution.version,
    stage: constitution.stage,
  };
}

module.exports = { evaluateConstitution };
