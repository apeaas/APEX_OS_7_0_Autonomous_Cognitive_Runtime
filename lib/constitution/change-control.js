"use strict";

const crypto = require("node:crypto");

function proposeConstitutionChange(input, activeConstitution, actor) {
  if (!actor || actor.type !== "human_operator") {
    return { ok: false, code: "HUMAN_AUTHORITY_REQUIRED", message: "Sólo una autoridad humana puede iniciar change control." };
  }
  if (!input?.version || input.version === activeConstitution.version) {
    return { ok: false, code: "NEW_VERSION_REQUIRED", message: "La propuesta requiere una versión nueva." };
  }
  return {
    ok: true,
    proposal: {
      id: crypto.randomUUID(),
      status: "PENDING_HUMAN_REVIEW",
      proposedVersion: input.version,
      previousVersion: activeConstitution.version,
      proposedBy: actor.id,
      createdAt: new Date().toISOString(),
      automaticallyActivated: false,
    },
  };
}

function proposeStageTransition(targetStage, activeConstitution, actor) {
  if (!actor || actor.type !== "human_operator") return { ok: false, code: "HUMAN_AUTHORITY_REQUIRED" };
  if (!activeConstitution.stageTransitionPolicy.stages.includes(targetStage)) return { ok: false, code: "INVALID_STAGE" };
  if (targetStage === activeConstitution.stage) return { ok: false, code: "STAGE_ALREADY_ACTIVE" };
  return {
    ok: true,
    status: "PENDING_HUMAN_CONFIRMATION",
    from: activeConstitution.stage,
    to: targetStage,
    automaticallyApplied: false,
  };
}

module.exports = { proposeConstitutionChange, proposeStageTransition };
