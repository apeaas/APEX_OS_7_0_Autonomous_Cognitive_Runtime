"use strict";

const { FORBIDDEN_CAPABILITIES, HARD_INVARIANTS } = require("./invariants");

function evaluateSafety(intent = {}, context = {}) {
  const violations = [];
  const capability = String(intent.capability || intent.type || "").toLowerCase();
  if (FORBIDDEN_CAPABILITIES.has(capability)) violations.push("FORBIDDEN_CAPABILITY");
  if (intent.executionMode && intent.executionMode !== "PAPER_ONLY") violations.push("PAPER_ONLY_VIOLATION");
  if (intent.liveTrading === true || intent.live === true) violations.push("LIVE_TRADING_FORBIDDEN");
  if (intent.externalAccount === true) violations.push("EXTERNAL_ACCOUNTS_FORBIDDEN");
  if (intent.walletSigning === true) violations.push("WALLET_SIGNING_FORBIDDEN");
  if (intent.withdrawal === true) violations.push("WITHDRAWALS_FORBIDDEN");
  if (intent.transfer === true) violations.push("TRANSFERS_FORBIDDEN");
  if (intent.custody === true) violations.push("CUSTODY_FORBIDDEN");
  if (Number(intent.autonomousAllocationPct || 0) > HARD_INVARIANTS.maximumInitialAutonomousAllocationPct) {
    violations.push("AUTONOMY_ALLOCATION_EXCEEDS_HARD_LIMIT");
  }
  if (context.killSwitch && intent.mutable !== false) violations.push("KILL_SWITCH_ACTIVE");
  if (intent.requiresClaim && !context.validClaim) violations.push("VALID_CLAIM_REQUIRED");
  if (intent.marketDependent && !context.feedTrusted) violations.push("UNTRUSTED_MARKET_DATA");
  if (context.requestedByModel && ["change_constitution", "elevate_risk", "disable_kill_switch", "recapitalize_fund"].includes(capability)) {
    violations.push("MODEL_AUTHORITY_FORBIDDEN");
  }
  return {
    allowed: violations.length === 0,
    decision: violations.length ? "veto" : "allow",
    violations,
    kernelVersion: "safety-kernel.v1",
    invariants: HARD_INVARIANTS,
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = { evaluateSafety };
