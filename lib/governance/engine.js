"use strict";

const { evaluateConstitution } = require("../constitution/evaluator");
const { evaluateSafety } = require("../safety-kernel/evaluator");
const { validateGovernanceDecision } = require("./contracts");

class GovernanceEngine {
  constructor(options) {
    this.constitution = options.constitution;
  }

  evaluate(input, context = {}) {
    const intent = input.intent || {};
    const risk = input.riskDecision;
    const base = {
      decision: "reject",
      reasons: [],
      policyVersion: "governance.v1",
      constitutionVersion: this.constitution.version,
      evaluatedAt: new Date(context.now || Date.now()).toISOString(),
      operable: false,
      requiredConfirmation: context.autonomous !== true,
      riskDecision: risk?.decision || null,
    };
    const safety = evaluateSafety({
      ...intent,
      executionMode: intent.executionMode || "PAPER_ONLY",
      marketDependent: ["open_position", "close_position", "modify_position"].includes(intent.type),
      mutable: true,
    }, {
      killSwitch: context.killSwitch,
      feedTrusted: context.feedTrusted,
      requestedByModel: context.requestedByModel,
      validClaim: context.validClaim,
    });
    if (!safety.allowed) return this.finalize(base, "veto", safety.violations, false);
    const constitutional = evaluateConstitution(intent, this.constitution);
    if (!constitutional.allowed) return this.finalize(base, "veto", constitutional.reasons, false);
    if (intent.expiresAt && Date.parse(intent.expiresAt) <= Date.parse(base.evaluatedAt)) {
      return this.finalize(base, "reject", ["INTENT_EXPIRED"], false);
    }
    if (context.evidenceRequired && (!Array.isArray(intent.evidence) || !intent.evidence.length)) {
      return this.finalize(base, "reject", ["EVIDENCE_REQUIRED"], false);
    }
    if (context.marketDependent && (!context.feedTrusted || !context.symbolFresh)) {
      return this.finalize(base, "delay", ["UNTRUSTED_MARKET_DATA"], false);
    }
    if (context.autonomous && (!context.fund || context.fund.status !== "ACTIVE")) {
      return this.finalize(base, "veto", ["AUTONOMOUS_FUND_NOT_ACTIVE"], false);
    }
    if (!risk) return this.finalize(base, "reject", ["RISK_DECISION_REQUIRED"], false);
    if (risk.decision === "reject") return this.finalize(base, "reject", risk.reasons, false);
    if (risk.decision === "delay") return this.finalize(base, "delay", risk.reasons, false);
    if (risk.decision === "reduce") return this.finalize(base, "reduce", risk.reasons, true);
    return this.finalize(base, "approve", ["GOVERNANCE_CHECKS_PASSED"], true);
  }

  evaluateThinking(intent, context = {}) {
    const trusted = context.feedTrusted === true && context.symbolFresh === true;
    return {
      decision: trusted ? "approve" : "delay",
      reasons: trusted ? ["RESEARCH_EVIDENCE_AVAILABLE"] : ["UNTRUSTED_MARKET_DATA"],
      policyVersion: "governance.v1",
      constitutionVersion: this.constitution.version,
      evaluatedAt: new Date(context.now || Date.now()).toISOString(),
      operable: false,
      requiredConfirmation: false,
    };
  }

  finalize(base, decision, reasons, operable) {
    const result = { ...base, decision, reasons: reasons.slice(), operable };
    const validation = validateGovernanceDecision(result);
    if (!validation.ok) throw Object.assign(new Error(validation.code), { code: validation.code });
    return result;
  }
}

module.exports = { GovernanceEngine };
