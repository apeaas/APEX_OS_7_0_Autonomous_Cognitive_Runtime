"use strict";

const PROTECTED_PATHS = [
  "lib/safety-kernel",
  "config/patrimonial-constitution",
  "lib/constitution",
  ".github/workflows",
  "deployment",
  "permissions",
];

function evaluateProposalPolicy(proposal, context = {}) {
  const reasons = [];
  if (!Array.isArray(proposal.evidence) || !proposal.evidence.length) reasons.push("EVIDENCE_REQUIRED");
  if (proposal.requiresHumanApproval !== true) reasons.push("HUMAN_APPROVAL_REQUIRED");
  if (context.requestedStatus === "APPROVED_FOR_DEVELOPMENT" && context.actor?.type !== "human_operator") reasons.push("SELF_APPROVAL_FORBIDDEN");
  if (["IMPLEMENTED_EXTERNALLY", "AUDITED"].includes(context.requestedStatus) && context.actor?.type !== "human_operator") reasons.push("SELF_APPLICATION_FORBIDDEN");
  if (context.requestedStatus === "AUTO_DEPLOYED") reasons.push("AUTO_DEPLOY_FORBIDDEN");
  if (proposal.affectedModules.some(module => {
    const normalizedModule = String(module).replace(/\\/g, "/").toLowerCase();
    return PROTECTED_PATHS.some(protectedPath => normalizedModule.includes(protectedPath.toLowerCase()));
  })) {
    reasons.push("PROTECTED_ACTIVE_RULES_CHANGE_FORBIDDEN");
  }
  if (context.deletesEvidence === true) reasons.push("EVIDENCE_DELETION_FORBIDDEN");
  return {
    allowed: reasons.length === 0,
    reasons,
    policyVersion: "cognitive-audit-policy.v1",
  };
}

module.exports = { PROTECTED_PATHS, evaluateProposalPolicy };
