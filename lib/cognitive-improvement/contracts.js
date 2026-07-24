"use strict";

const crypto = require("node:crypto");

const PROPOSAL_STATES = Object.freeze([
  "DRAFT",
  "READY_FOR_EVALUATION",
  "EVALUATED",
  "REJECTED",
  "APPROVED_FOR_DEVELOPMENT",
  "IMPLEMENTED_EXTERNALLY",
  "AUDITED",
]);

function validateImprovementProposal(proposal) {
  const requiredStrings = [
    "id",
    "createdAt",
    "source",
    "observation",
    "problemStatement",
    "hypothesis",
    "proposedChange",
    "riskAssessment",
    "evaluationPlan",
    "status",
    "schemaVersion",
  ];
  for (const field of requiredStrings) {
    if (typeof proposal?.[field] !== "string" || !proposal[field].trim()) return failure("INVALID_IMPROVEMENT_PROPOSAL", `${field} es obligatorio.`);
  }
  if (!PROPOSAL_STATES.includes(proposal.status)) return failure("INVALID_PROPOSAL_STATUS", "Estado de propuesta inválido.");
  if (!Array.isArray(proposal.affectedModules) || !proposal.affectedModules.length) return failure("AFFECTED_MODULES_REQUIRED", "affectedModules es obligatorio.");
  if (!Array.isArray(proposal.evidence) || !proposal.evidence.length) return failure("EVIDENCE_REQUIRED", "Toda propuesta requiere evidencia.");
  if (!proposal.baselineMetrics || typeof proposal.baselineMetrics !== "object") return failure("BASELINE_METRICS_REQUIRED", "baselineMetrics es obligatorio.");
  if (!proposal.candidateMetrics || typeof proposal.candidateMetrics !== "object") return failure("CANDIDATE_METRICS_REQUIRED", "candidateMetrics es obligatorio.");
  if (proposal.requiresHumanApproval !== true) return failure("HUMAN_APPROVAL_REQUIRED", "Toda propuesta requiere aprobación humana.");
  return { ok: true };
}

function createImprovementProposal(input) {
  const proposal = {
    id: input.id || crypto.randomUUID(),
    createdAt: input.createdAt || new Date().toISOString(),
    source: String(input.source || "APEX_COGNITIVE_RUNTIME"),
    observation: String(input.observation || ""),
    problemStatement: String(input.problemStatement || ""),
    hypothesis: String(input.hypothesis || ""),
    proposedChange: String(input.proposedChange || ""),
    affectedModules: Array.isArray(input.affectedModules) ? input.affectedModules.map(String) : [],
    expectedBenefit: input.expectedBenefit || null,
    riskAssessment: String(input.riskAssessment || ""),
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    evaluationPlan: String(input.evaluationPlan || ""),
    baselineMetrics: input.baselineMetrics || {},
    candidateMetrics: input.candidateMetrics || {},
    status: "DRAFT",
    requiresHumanApproval: true,
    schemaVersion: "improvement-proposal.v1",
  };
  const validation = validateImprovementProposal(proposal);
  if (!validation.ok) throw proposalError(validation.code, validation.message);
  return proposal;
}

function proposalError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function failure(code, message) {
  return { ok: false, code, message };
}

module.exports = {
  PROPOSAL_STATES,
  createImprovementProposal,
  proposalError,
  validateImprovementProposal,
};
