"use strict";

const { evaluateProposalPolicy } = require("./audit-policy");

function evaluateProposal(proposal, evaluation = {}, context = {}) {
  const policy = evaluateProposalPolicy(proposal, context);
  if (!policy.allowed) {
    return {
      decision: "reject",
      reasons: policy.reasons,
      status: "REJECTED",
      policyVersion: policy.policyVersion,
      evaluatedAt: new Date().toISOString(),
    };
  }
  if (!evaluation || typeof evaluation !== "object" || !evaluation.results || typeof evaluation.results !== "object") {
    return {
      decision: "reject",
      reasons: ["EVALUATION_RESULTS_REQUIRED"],
      status: "REJECTED",
      policyVersion: policy.policyVersion,
      evaluatedAt: new Date().toISOString(),
    };
  }
  const traceable = Array.isArray(evaluation.evidence) && evaluation.evidence.length > 0;
  if (!traceable) {
    return {
      decision: "reject",
      reasons: ["EVALUATION_TRACEABILITY_REQUIRED"],
      status: "REJECTED",
      policyVersion: policy.policyVersion,
      evaluatedAt: new Date().toISOString(),
    };
  }
  return {
    decision: "evaluated",
    reasons: ["EVALUATION_RECORDED_FOR_HUMAN_REVIEW"],
    status: "EVALUATED",
    baselineMetrics: proposal.baselineMetrics,
    candidateMetrics: evaluation.results,
    evidence: evaluation.evidence,
    policyVersion: policy.policyVersion,
    evaluatedAt: new Date().toISOString(),
    automaticallyApproved: false,
    automaticallyApplied: false,
  };
}

module.exports = { evaluateProposal };
