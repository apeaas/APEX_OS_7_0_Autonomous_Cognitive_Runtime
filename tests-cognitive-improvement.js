"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { evaluateProposalPolicy } = require("./lib/cognitive-improvement/audit-policy");
const { createImprovementProposal, PROPOSAL_STATES } = require("./lib/cognitive-improvement/contracts");
const { evaluateProposal } = require("./lib/cognitive-improvement/evaluator");
const { ProposalRegistry } = require("./lib/cognitive-improvement/proposal-registry");
const { DecisionJournal } = require("./lib/decision-journal/store");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "apex-cognition-"));
const human = { actor: { type: "human_operator", id: "HUMAN-1" } };
const model = { actor: { type: "model", id: "APEX" } };

function proposalInput(overrides = {}) {
  return {
    source: "APEX_COGNITIVE_RUNTIME",
    observation: "Una explicacion tardo mas que la linea base.",
    problemStatement: "La latencia explicativa excede el objetivo.",
    hypothesis: "Un resumen previo reduciria latencia sin perder trazabilidad.",
    proposedChange: "Probar un resumen deterministico antes del render.",
    affectedModules: ["lib/explanations/summary.js"],
    expectedBenefit: { latencyReductionMs: 15 },
    riskAssessment: "Puede omitir contexto; comparar completitud.",
    evidence: [{ id: "TRACE-1", provenance: "decision-journal", checksum: "abc123" }],
    evaluationPlan: "Comparar 100 casos y auditar completitud.",
    baselineMetrics: { p95LatencyMs: 120 },
    candidateMetrics: {},
    ...overrides,
  };
}

function journalInput(overrides = {}) {
  return {
    context: { runtimeMode: "observe", executionMode: "PAPER_ONLY" },
    evidence: [{ id: "FEED-1", trusted: true }],
    intent: { type: "open_position", symbol: "BTCUSDT" },
    risk: { decision: "approve", policyVersion: "unified-risk.v1" },
    governance: { decision: "approve", policyVersion: "governance.v1" },
    decision: "approve",
    latencyMs: 12,
    outcome: { status: "COMPLETED", ledgerVersion: 3 },
    interpretationError: null,
    timingError: null,
    executionError: null,
    ...overrides,
  };
}

try {
  assert.deepEqual(PROPOSAL_STATES, [
    "DRAFT",
    "READY_FOR_EVALUATION",
    "EVALUATED",
    "REJECTED",
    "APPROVED_FOR_DEVELOPMENT",
    "IMPLEMENTED_EXTERNALLY",
    "AUDITED",
  ]);
  assert.equal(PROPOSAL_STATES.includes("AUTO_DEPLOYED"), false);
  assert.throws(
    () => createImprovementProposal(proposalInput({ evidence: [] })),
    error => error.code === "EVIDENCE_REQUIRED",
  );
  assert.equal(
    createImprovementProposal(proposalInput({ requiresHumanApproval: false })).requiresHumanApproval,
    true,
  );

  const registryPath = path.join(root, "improvements.ndjson");
  const registry = new ProposalRegistry({ filePath: registryPath });
  const mutableProposalInput = proposalInput();
  const created = registry.create(mutableProposalInput, model);
  mutableProposalInput.evidence[0].id = "MUTATED-AFTER-APPEND";
  assert.equal(created.status, "DRAFT");
  assert.equal(created.requiresHumanApproval, true);
  assert.equal(registry.auditTrail(created.id).length, 1);
  assert.equal(registry.auditTrail(created.id)[0].payload.proposal.evidence[0].id, "TRACE-1");
  assert.throws(
    () => registry.create(proposalInput(), model),
    error => error.code === "DUPLICATE_PROPOSAL",
  );

  const missingTrace = evaluateProposal(created, { results: { p95LatencyMs: 98 }, evidence: [] }, model);
  assert.equal(missingTrace.status, "REJECTED");
  assert.deepEqual(missingTrace.reasons, ["EVALUATION_TRACEABILITY_REQUIRED"]);

  const evaluation = evaluateProposal(created, {
    results: { p95LatencyMs: 95, completenessPct: 100 },
    evidence: [{ id: "EVAL-1", provenance: "test-run", checksum: "def456" }],
  }, model);
  assert.equal(evaluation.status, "EVALUATED");
  assert.equal(evaluation.automaticallyApproved, false);
  assert.equal(evaluation.automaticallyApplied, false);
  const evaluated = registry.recordEvaluation(created.id, {
    results: evaluation.candidateMetrics,
    evidence: evaluation.evidence,
  }, evaluation, model);
  assert.equal(evaluated.status, "EVALUATED");
  assert.equal(evaluated.evaluation.result.decision, "evaluated");
  assert.throws(
    () => registry.transition(created.id, "APPROVED_FOR_DEVELOPMENT", {}, model),
    error => error.code === "SELF_APPROVAL_FORBIDDEN",
  );
  const approved = registry.transition(created.id, "APPROVED_FOR_DEVELOPMENT", { approvedBy: "HUMAN-1" }, human);
  assert.equal(approved.status, "APPROVED_FOR_DEVELOPMENT");
  assert.throws(
    () => registry.transition(created.id, "IMPLEMENTED_EXTERNALLY", {}, model),
    error => error.code === "SELF_APPLICATION_FORBIDDEN",
  );
  assert.throws(
    () => registry.transition(created.id, "AUTO_DEPLOYED", {}, human),
    error => error.code === "INVALID_PROPOSAL_TRANSITION",
  );
  assert.throws(
    () => registry.transition(created.id, "IMPLEMENTED_EXTERNALLY", { deletesEvidence: true }, human),
    error => error.code === "EVIDENCE_DELETION_FORBIDDEN",
  );
  const implemented = registry.transition(created.id, "IMPLEMENTED_EXTERNALLY", { externalCommit: "deadbeef" }, human);
  assert.equal(implemented.status, "IMPLEMENTED_EXTERNALLY");
  const audited = registry.transition(created.id, "AUDITED", { auditReport: "QA-1" }, human);
  assert.equal(audited.status, "AUDITED");

  assert.throws(
    () => registry.create(proposalInput({
      problemStatement: "Cambiar una invariante activa.",
      proposedChange: "Editar Safety Kernel.",
      affectedModules: ["lib/safety-kernel/invariants.js"],
    }), model),
    error => error.code === "PROTECTED_ACTIVE_RULES_CHANGE_FORBIDDEN",
  );
  assert.throws(
    () => registry.create(proposalInput({
      problemStatement: "Cambiar Constitucion activa.",
      proposedChange: "Editar Constitucion.",
      affectedModules: ["config/patrimonial-constitution.v1.json"],
    }), model),
    error => error.code === "PROTECTED_ACTIVE_RULES_CHANGE_FORBIDDEN",
  );
  assert.equal(
    evaluateProposalPolicy(created, { actor: model.actor, requestedStatus: "APPROVED_FOR_DEVELOPMENT" }).allowed,
    false,
  );
  assert.equal(
    evaluateProposalPolicy(created, { actor: model.actor, requestedStatus: "IMPLEMENTED_EXTERNALLY" }).allowed,
    false,
  );

  const restoredRegistry = new ProposalRegistry({ filePath: registryPath });
  assert.equal(restoredRegistry.get(created.id).status, "AUDITED");
  assert.equal(restoredRegistry.auditTrail(created.id).length, 7);
  const tamperedRegistryPath = path.join(root, "improvements-tampered.ndjson");
  fs.copyFileSync(registryPath, tamperedRegistryPath);
  const tamperedRegistry = fs.readFileSync(tamperedRegistryPath, "utf8").replace("QA-1", "QA-X");
  fs.writeFileSync(tamperedRegistryPath, tamperedRegistry, "utf8");
  assert.throws(
    () => new ProposalRegistry({ filePath: tamperedRegistryPath }),
    error => error.code === "IMPROVEMENT_AUDIT_INTEGRITY_FAILURE",
  );

  const journalPath = path.join(root, "decision-journal.ndjson");
  const journal = new DecisionJournal({ filePath: journalPath });
  const mutableJournalInput = journalInput();
  const entry = journal.append(mutableJournalInput);
  mutableJournalInput.intent.symbol = "MUTATED";
  assert.equal(entry.previousChecksum, null);
  assert.equal(entry.executionError, null);
  assert.equal(journal.list()[0].intent.symbol, "BTCUSDT");
  const failedEntry = journal.append(journalInput({
    decision: "reject",
    outcome: { status: "FAILED" },
    executionError: { code: "PORTFOLIO_VERSION_CONFLICT" },
  }));
  assert.equal(failedEntry.previousChecksum, entry.checksum);
  assert.equal(failedEntry.executionError.code, "PORTFOLIO_VERSION_CONFLICT");
  assert.equal(journal.list()[0].id, failedEntry.id);
  assert.equal(new DecisionJournal({ filePath: journalPath }).list().length, 2);
  assert.throws(
    () => journal.append(journalInput({ evidence: null })),
    error => error.code === "INVALID_DECISION_JOURNAL_ENTRY",
  );
  assert.throws(
    () => journal.append(journalInput({ latencyMs: -1 })),
    error => error.code === "INVALID_DECISION_JOURNAL_ENTRY",
  );
  const tamperedJournalPath = path.join(root, "decision-journal-tampered.ndjson");
  fs.copyFileSync(journalPath, tamperedJournalPath);
  const tamperedJournal = fs.readFileSync(tamperedJournalPath, "utf8").replace("COMPLETED", "ALTERED");
  fs.writeFileSync(tamperedJournalPath, tamperedJournal, "utf8");
  assert.throws(
    () => new DecisionJournal({ filePath: tamperedJournalPath }),
    error => error.code === "DECISION_JOURNAL_INTEGRITY_FAILURE",
  );

  console.log("APEX 7.1 cognitive improvement and Decision Journal tests: OK - 40 assertions");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
