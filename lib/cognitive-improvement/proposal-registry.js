"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sha256, stableStringify } = require("../paper-ledger/contracts");
const { evaluateProposalPolicy } = require("./audit-policy");
const { createImprovementProposal, proposalError } = require("./contracts");

const TRANSITIONS = Object.freeze({
  DRAFT: ["READY_FOR_EVALUATION", "REJECTED"],
  READY_FOR_EVALUATION: ["EVALUATED", "REJECTED"],
  EVALUATED: ["APPROVED_FOR_DEVELOPMENT", "REJECTED"],
  APPROVED_FOR_DEVELOPMENT: ["IMPLEMENTED_EXTERNALLY", "REJECTED"],
  IMPLEMENTED_EXTERNALLY: ["AUDITED"],
  REJECTED: [],
  AUDITED: [],
});

class ProposalRegistry {
  constructor(options) {
    this.filePath = options.filePath;
    this.fs = options.fs || fs;
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.records = [];
    this.proposals = new Map();
    this.fingerprints = new Map();
    this.load();
  }

  create(input, context = {}) {
    const proposal = createImprovementProposal(input);
    const policy = evaluateProposalPolicy(proposal, { actor: context.actor });
    if (!policy.allowed) throw proposalError(policy.reasons[0], `Propuesta rechazada: ${policy.reasons.join(", ")}.`);
    const fingerprint = proposalFingerprint(proposal);
    if (this.fingerprints.has(fingerprint)) throw proposalError("DUPLICATE_PROPOSAL", "Ya existe una propuesta equivalente.", 409);
    this.append("PROPOSAL_CREATED", proposal.id, { proposal, fingerprint }, context);
    return this.get(proposal.id);
  }

  transition(id, status, details = {}, context = {}) {
    const proposal = this.get(id);
    if (!proposal) throw proposalError("PROPOSAL_NOT_FOUND", "Propuesta no encontrada.", 404);
    if (!TRANSITIONS[proposal.status]?.includes(status)) throw proposalError("INVALID_PROPOSAL_TRANSITION", `No se permite ${proposal.status} → ${status}.`, 409);
    const policy = evaluateProposalPolicy(proposal, {
      actor: context.actor,
      requestedStatus: status,
      deletesEvidence: details.deletesEvidence,
    });
    if (!policy.allowed) throw proposalError(policy.reasons[0], `Transición rechazada: ${policy.reasons.join(", ")}.`, 403);
    this.append("PROPOSAL_STATUS_CHANGED", id, {
      from: proposal.status,
      to: status,
      details,
      policyVersion: policy.policyVersion,
    }, context);
    return this.get(id);
  }

  recordEvaluation(id, evaluation, result, context = {}) {
    const proposal = this.get(id);
    if (!proposal) throw proposalError("PROPOSAL_NOT_FOUND", "Propuesta no encontrada.", 404);
    if (!["READY_FOR_EVALUATION", "DRAFT"].includes(proposal.status)) throw proposalError("INVALID_PROPOSAL_TRANSITION", "La propuesta no está lista para evaluación.", 409);
    if (proposal.status === "DRAFT") this.transition(id, "READY_FOR_EVALUATION", {}, context);
    this.append("PROPOSAL_EVALUATED", id, { evaluation, result }, context);
    return this.transition(id, result.status, { evaluationRecordId: this.records.at(-1).id }, context);
  }

  get(id) {
    const proposal = this.proposals.get(String(id || ""));
    return proposal ? clone(proposal) : null;
  }

  list() {
    return [...this.proposals.values()].map(clone).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  auditTrail(id) {
    return this.records.filter(record => !id || record.proposalId === id).map(clone);
  }

  append(type, proposalId, payload, context) {
    const previousChecksum = this.records.at(-1)?.checksum || null;
    const unsigned = {
      id: context.id || `${Date.now()}-${this.records.length + 1}`,
      type,
      proposalId,
      occurredAt: new Date().toISOString(),
      actor: clone(context.actor || { type: "system", id: "APEX" }),
      payload: clone(payload),
      previousChecksum,
    };
    const record = { ...unsigned, checksum: sha256(stableStringify(unsigned)) };
    const handle = this.fs.openSync(this.filePath, "a");
    try {
      this.fs.writeFileSync(handle, `${JSON.stringify(record)}\n`, "utf8");
      this.fs.fsyncSync(handle);
    } finally {
      this.fs.closeSync(handle);
    }
    this.apply(record);
  }

  load() {
    if (!this.fs.existsSync(this.filePath)) return;
    const lines = this.fs.readFileSync(this.filePath, "utf8").split(/\r?\n/).filter(Boolean);
    let previousChecksum = null;
    for (const [index, line] of lines.entries()) {
      const record = JSON.parse(line);
      const unsigned = { ...record };
      delete unsigned.checksum;
      if (record.previousChecksum !== previousChecksum || record.checksum !== sha256(stableStringify(unsigned))) {
        throw proposalError("IMPROVEMENT_AUDIT_INTEGRITY_FAILURE", `Falló integridad en línea ${index + 1}.`, 500);
      }
      this.apply(record);
      previousChecksum = record.checksum;
    }
  }

  apply(record) {
    const immutableRecord = deepFreeze(clone(record));
    this.records.push(immutableRecord);
    if (immutableRecord.type === "PROPOSAL_CREATED") {
      this.proposals.set(immutableRecord.proposalId, clone(immutableRecord.payload.proposal));
      this.fingerprints.set(immutableRecord.payload.fingerprint, immutableRecord.proposalId);
      return;
    }
    const proposal = this.proposals.get(immutableRecord.proposalId);
    if (!proposal) throw proposalError("IMPROVEMENT_AUDIT_ORPHAN_RECORD", "Registro de propuesta huérfano.", 500);
    if (immutableRecord.type === "PROPOSAL_STATUS_CHANGED") {
      proposal.status = immutableRecord.payload.to;
      proposal.updatedAt = immutableRecord.occurredAt;
      proposal.lastTransition = clone(immutableRecord.payload);
    }
    if (immutableRecord.type === "PROPOSAL_EVALUATED") {
      proposal.evaluation = clone(immutableRecord.payload);
    }
  }
}

function proposalFingerprint(proposal) {
  return sha256(stableStringify({
    problemStatement: proposal.problemStatement,
    hypothesis: proposal.hypothesis,
    proposedChange: proposal.proposedChange,
    affectedModules: proposal.affectedModules.slice().sort(),
  }));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = { ProposalRegistry, TRANSITIONS, proposalFingerprint };
