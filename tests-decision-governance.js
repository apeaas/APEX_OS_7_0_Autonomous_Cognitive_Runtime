"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createOpportunityIntent,
  validateOpportunityIntent,
} = require("./lib/decision-contracts/contracts");
const { ConfirmationRegistry } = require("./lib/governance/confirmations");
const { GovernanceEngine } = require("./lib/governance/engine");

const constitution = JSON.parse(fs.readFileSync(path.join(__dirname, "config/patrimonial-constitution.v1.json"), "utf8"));
const nowIso = "2026-07-24T12:00:00.000Z";
const expiresIso = "2026-07-24T12:05:00.000Z";

const intent = createOpportunityIntent({
  expiresAt: expiresIso,
  sourceEvents: ["EVENT-1"],
  thesis: "Hipótesis de prueba con evidencia limitada.",
  asset: "Bitcoin",
  symbol: "BTCUSDT",
  assetClass: "spot",
  direction: "long",
  expectedHorizon: "intraday",
  urgencyClass: "normal",
  eventConfidence: 1,
  sourceConfidence: null,
  interpretationConfidence: "unknown",
  directionalConfidence: null,
  persistenceConfidence: null,
  entryQuality: null,
  executionConfidence: null,
  feedQuality: { status: "healthy", trusted: true },
  symbolFreshness: { trusted: true, ageMs: 1 },
  evidence: [{ id: "E-1", provenance: "test" }],
  operable: true,
}, { createdAt: nowIso, now: Date.parse(nowIso) });
assert.equal(intent.operable, true);
const expiredValidation = validateOpportunityIntent(intent, Date.parse(expiresIso) + 1);
assert.equal(expiredValidation.ok, false);
assert.equal(expiredValidation.code, "INVALID_OPERABILITY");
assert.throws(
  () => createOpportunityIntent({
    ...intent,
    id: "UNTRUSTED",
    feedQuality: { status: "degraded", trusted: false },
    operable: true,
  }, { createdAt: nowIso, now: Date.parse(nowIso) }),
  error => error.code === "INVALID_OPERABILITY",
);
const researchedOnly = createOpportunityIntent({
  ...intent,
  id: "RESEARCH",
  eventConfidence: 1,
  entryQuality: null,
  feedQuality: { status: "degraded", trusted: false },
  symbolFreshness: { trusted: false, ageMs: 10_000 },
  operable: false,
}, { createdAt: nowIso, now: Date.parse(nowIso) });
assert.equal(researchedOnly.operable, false);
assert.equal(researchedOnly.entryQuality, null);
assert.equal(validateOpportunityIntent(researchedOnly, Date.parse(expiresIso) + 1).expired, true);

let clock = Date.parse(nowIso);
const confirmations = new ConfirmationRegistry({ clock: () => clock, draftTtlMs: 5_000, confirmationTtlMs: 2_000 });
const command = {
  type: "open_position",
  symbol: "BTCUSDT",
  capital: 100,
  entry: 100,
  stop: 95,
  target: 110,
  source: "AI_COMMAND",
  expectedVersion: 1,
};
const draft = confirmations.createDraft(command, {
  sessionId: "SESSION-A",
  feedEvidence: { status: "healthy", trusted: true, symbolFresh: true },
});
assert.equal(draft.status, "AWAITING_HUMAN_CONFIRMATION");
assert.equal(draft.interpretation.symbol, "BTCUSDT");
assert.equal(draft.consequences.liveEffect, false);
assert.throws(
  () => confirmations.confirm(draft.id, { accepted: true }, { sessionId: "SESSION-B" }),
  error => error.code === "FOREIGN_DRAFT",
);
assert.throws(
  () => confirmations.confirm(draft.id, { accepted: false }, { sessionId: "SESSION-A" }),
  error => error.code === "HUMAN_CONFIRMATION_REQUIRED",
);
const confirmation = confirmations.confirm(draft.id, { accepted: true }, { sessionId: "SESSION-A" });
assert.equal(confirmation.status, "CONFIRMED");
assert.throws(
  () => confirmations.consume(draft.id, confirmation.id, command, { sessionId: "SESSION-B", idempotencyKey: "execute-1" }),
  error => error.code === "FOREIGN_CONFIRMATION",
);
assert.throws(
  () => confirmations.consume(draft.id, confirmation.id, { ...command, capital: 101 }, { sessionId: "SESSION-A", idempotencyKey: "execute-1" }),
  error => error.code === "CONFIRMATION_COMMAND_MISMATCH",
);
const consumed = confirmations.consume(draft.id, confirmation.id, command, { sessionId: "SESSION-A", idempotencyKey: "execute-1" });
assert.equal(consumed.confirmation.status, "CONSUMED");
assert.equal(confirmations.consume(draft.id, confirmation.id, command, { sessionId: "SESSION-A", idempotencyKey: "execute-1" }).duplicate, true);
assert.throws(
  () => confirmations.consume(draft.id, confirmation.id, command, { sessionId: "SESSION-A", idempotencyKey: "execute-2" }),
  error => error.code === "CONFIRMATION_REUSED",
);

const expiringDraft = confirmations.createDraft({ ...command, symbol: "ETHUSDT" }, {
  sessionId: "SESSION-A",
  feedEvidence: { status: "healthy", trusted: true },
});
const expiringConfirmation = confirmations.confirm(expiringDraft.id, { accepted: true }, { sessionId: "SESSION-A" });
clock += 2_001;
assert.throws(
  () => confirmations.consume(expiringDraft.id, expiringConfirmation.id, { ...command, symbol: "ETHUSDT" }, { sessionId: "SESSION-A", idempotencyKey: "expired-1" }),
  error => ["CONFIRMATION_NOT_FOUND", "CONFIRMATION_EXPIRED"].includes(error.code),
);

const governance = new GovernanceEngine({ constitution });
const riskApprove = {
  decision: "approve",
  reasons: ["ALL_RISK_CHECKS_PASSED"],
};
const baseIntent = {
  type: "open_position",
  symbol: "BTCUSDT",
  executionMode: "PAPER_ONLY",
  stage: "CAPITAL_BUILDING",
  expiresAt: expiresIso,
};
const approved = governance.evaluate({ intent: baseIntent, riskDecision: riskApprove }, {
  now: Date.parse(nowIso),
  feedTrusted: true,
  symbolFresh: true,
  marketDependent: true,
});
assert.equal(approved.decision, "approve");
assert.equal(approved.operable, true);
assert.equal(approved.requiredConfirmation, true);
const reduced = governance.evaluate({ intent: baseIntent, riskDecision: { decision: "reduce", reasons: ["SIZE_REDUCED"] } }, {
  now: Date.parse(nowIso),
  feedTrusted: true,
  symbolFresh: true,
  marketDependent: true,
});
assert.equal(reduced.decision, "reduce");
const liveVeto = governance.evaluate({ intent: { ...baseIntent, executionMode: "LIVE" }, riskDecision: riskApprove }, {
  now: Date.parse(nowIso),
  feedTrusted: true,
  symbolFresh: true,
  marketDependent: true,
});
assert.equal(liveVeto.decision, "veto");
const expired = governance.evaluate({ intent: { ...baseIntent, expiresAt: "2020-01-01T00:00:00.000Z" }, riskDecision: riskApprove }, {
  now: Date.parse(nowIso),
  feedTrusted: true,
  symbolFresh: true,
  marketDependent: true,
});
assert.equal(expired.decision, "reject");
const thinking = governance.evaluateThinking(researchedOnly, { feedTrusted: false, symbolFresh: false, now: Date.parse(nowIso) });
assert.equal(thinking.decision, "delay");
assert.equal(thinking.operable, false);
assert.equal(thinking.reasons[0], "UNTRUSTED_MARKET_DATA");
const autonomousWithoutFund = governance.evaluate({ intent: baseIntent, riskDecision: riskApprove }, {
  now: Date.parse(nowIso),
  feedTrusted: true,
  symbolFresh: true,
  marketDependent: true,
  autonomous: true,
  validClaim: true,
  fund: null,
});
assert.equal(autonomousWithoutFund.decision, "veto");

console.log("APEX 7.1 decision contracts and Governance tests: OK · 32 assertions");
