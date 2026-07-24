"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AutonomousFundService } = require("./lib/autonomous-fund/service");
const {
  activateFund,
  applyPerformance,
  authorizeFund,
  consolidateProfit,
} = require("./lib/autonomous-fund/model");
const { proposeStageTransition } = require("./lib/constitution/change-control");
const { ConstitutionIntegrityError, ConstitutionRegistry, contentHash } = require("./lib/constitution/registry");
const { EventStore } = require("./lib/paper-ledger/event-store");
const { RiskEngine } = require("./lib/risk/engine");
const { resolveRiskPolicy } = require("./lib/risk/policy");
const { evaluateSafety } = require("./lib/safety-kernel/evaluator");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "apex-policy-"));

try {
  const sourceConstitution = JSON.parse(fs.readFileSync(path.join(__dirname, "config/patrimonial-constitution.v1.json"), "utf8"));
  assert.equal(contentHash(sourceConstitution), sourceConstitution.contentHash);
  const configPath = path.join(root, "constitution.json");
  const statePath = path.join(root, "active.json");
  fs.writeFileSync(configPath, JSON.stringify(sourceConstitution, null, 2), "utf8");
  const registry = new ConstitutionRegistry({ configPath, statePath });
  const constitution = registry.active();
  assert.equal(constitution.status, "ACTIVE");
  assert.equal(registry.metadata().contentHash, constitution.contentHash);

  const modified = { ...sourceConstitution, objective: `${sourceConstitution.objective} Cambio silencioso.` };
  modified.contentHash = contentHash(modified);
  fs.writeFileSync(configPath, JSON.stringify(modified, null, 2), "utf8");
  assert.throws(
    () => new ConstitutionRegistry({ configPath, statePath }),
    error => error instanceof ConstitutionIntegrityError && error.code === "SILENT_CONSTITUTION_CHANGE_BLOCKED",
  );
  const liveEnabled = {
    ...sourceConstitution,
    nonNegotiableLimits: { ...sourceConstitution.nonNegotiableLimits, liveTrading: true },
  };
  liveEnabled.contentHash = contentHash(liveEnabled);
  fs.writeFileSync(path.join(root, "live-enabled.json"), JSON.stringify(liveEnabled), "utf8");
  assert.throws(
    () => new ConstitutionRegistry({ configPath: path.join(root, "live-enabled.json"), statePath: path.join(root, "live-state.json") }),
    error => error.code === "INVALID_CONSTITUTION",
  );
  const invalid = { ...sourceConstitution, contentHash: "invalid" };
  fs.writeFileSync(path.join(root, "invalid.json"), JSON.stringify(invalid), "utf8");
  assert.throws(
    () => new ConstitutionRegistry({ configPath: path.join(root, "invalid.json"), statePath: path.join(root, "invalid-state.json") }),
    error => error.code === "CONSTITUTION_HASH_MISMATCH",
  );
  assert.equal(proposeStageTransition("EXPANSION", constitution, { type: "model", id: "AI" }).code, "HUMAN_AUTHORITY_REQUIRED");
  const stageProposal = proposeStageTransition("EXPANSION", constitution, { type: "human_operator", id: "H-1" });
  assert.equal(stageProposal.status, "PENDING_HUMAN_CONFIRMATION");
  assert.equal(stageProposal.automaticallyApplied, false);

  assert.equal(evaluateSafety({ type: "live_trade", executionMode: "LIVE" }, {}).decision, "veto");
  assert.equal(evaluateSafety({ type: "open_position", marketDependent: true }, { feedTrusted: false }).violations.includes("UNTRUSTED_MARKET_DATA"), true);
  assert.equal(evaluateSafety({ type: "open_position" }, { killSwitch: true }).violations.includes("KILL_SWITCH_ACTIVE"), true);
  assert.equal(evaluateSafety({ type: "change_constitution" }, { requestedByModel: true }).allowed, false);
  assert.equal(evaluateSafety({ type: "open_position", autonomousAllocationPct: 0.051 }, {}).allowed, false);

  const engine = new RiskEngine({ constitution });
  const portfolio = {
    cash: 10_000,
    equity: 10_000,
    positions: [],
    exposure: { gross: 0 },
    closedTrades: [],
  };
  const runtimeConfig = {
    riskPerTradePct: 0.25,
    maxPositionPct: 1.5,
    dailyLossLimitPct: 1,
    maxConcurrentPositions: 3,
    autonomyCapPct: 5,
    minRiskReward: 1.6,
  };
  const trustedContext = {
    profile: "manual",
    portfolio,
    runtimeConfig,
    feedQuality: { status: "healthy", trusted: true, reason: "test" },
    symbolQuality: { trusted: true, ageMs: 1 },
    dailyPnl: 0,
  };
  const openIntent = {
    type: "open_position",
    symbol: "BTCUSDT",
    capital: 100,
    entry: 100,
    stop: 95,
    target: 110,
    executionMode: "PAPER_ONLY",
    stage: "CAPITAL_BUILDING",
  };
  const approved = engine.evaluateIntent(openIntent, trustedContext);
  assert.equal(approved.decision, "approve");
  assert.equal(approved.approvedSize, 100);
  const reduced = engine.evaluateIntent({ ...openIntent, capital: 1_000 }, trustedContext);
  assert.equal(reduced.decision, "reduce");
  assert.equal(reduced.approvedSize, 150);
  const untrusted = engine.evaluateIntent(openIntent, { ...trustedContext, feedQuality: { status: "degraded", trusted: false }, symbolQuality: { trusted: false } });
  assert.equal(untrusted.decision, "reject");
  assert.equal(untrusted.reasons.includes("UNTRUSTED_MARKET_DATA"), true);
  const duplicate = engine.evaluateIntent(openIntent, { ...trustedContext, portfolio: { ...portfolio, positions: [{ id: "P", symbol: "BTCUSDT", capital: 10 }], exposure: { gross: 10 } } });
  assert.equal(duplicate.reasons.includes("DUPLICATE_SYMBOL_EXPOSURE"), true);
  const dailyLoss = engine.evaluateIntent(openIntent, { ...trustedContext, dailyPnl: -101 });
  assert.equal(dailyLoss.reasons.includes("DAILY_LOSS_LIMIT"), true);
  const expired = engine.evaluateIntent({ ...openIntent, expiresAt: "2020-01-01T00:00:00.000Z" }, trustedContext);
  assert.equal(expired.reasons.includes("INTENT_EXPIRED"), true);
  const policy = resolveRiskPolicy("manual", constitution, { ...runtimeConfig, riskPerTradePct: 99, maxPositionPct: 99 });
  assert.equal(policy.limits.maximumRiskPerTradePct, 0.005);
  assert.equal(policy.limits.maximumPositionPct, 0.02);

  assert.throws(
    () => authorizeFund({ capitalReferenceId: "REF", capitalReferenceAmount: 10_000, autonomousAllocationPct: 0.051 }, { authority: "human_operator" }),
    error => error.code === "FUND_ALLOCATION_EXCEEDS_5_PERCENT",
  );
  assert.throws(
    () => authorizeFund({ capitalReferenceId: "REF", capitalReferenceAmount: 10_000, autonomousAllocationPct: 0.05 }, { authority: "model" }),
    error => error.code === "HUMAN_AUTHORITY_REQUIRED",
  );
  const authorized = authorizeFund({
    capitalReferenceId: "REF-10000",
    capitalReferenceAmount: 10_000,
    capitalReferenceAt: "2026-07-24T00:00:00.000Z",
    autonomousAllocationPct: 0.05,
  }, { authority: "human_operator" });
  assert.equal(authorized.initialAutonomousContribution, 500);
  assert.equal(authorized.capitalReferenceFrozen, true);
  const active = activateFund(authorized, { authority: "human_operator", at: "2026-07-24T01:00:00.000Z" });
  assert.equal(active.status, "ACTIVE");
  const grown = applyPerformance(active, { realizedPnL: 100, unrealizedPnL: 0, grossExposure: 0, netExposure: 0 });
  assert.equal(grown.netAssetValue, 600);
  assert.equal(grown.retainedProfit, 100);
  const consolidated = consolidateProfit(grown, 50, { authority: "human_operator" });
  assert.equal(consolidated.netAssetValue, 550);
  assert.equal(consolidated.consolidatedProfit, 50);
  assert.equal(consolidated.automaticReturnAllowed, false);
  const loss = applyPerformance(active, { realizedPnL: -100, unrealizedPnL: 0, grossExposure: 0, netExposure: 0 });
  assert.equal(loss.netAssetValue, 400);
  assert.equal(loss.initialAutonomousContribution, 500);

  const fundStore = new EventStore({ filePath: path.join(root, "fund-ledger.ndjson") });
  const fundService = new AutonomousFundService({ store: fundStore });
  const fundContext = key => ({
    idempotencyKey: key,
    sessionId: "H-1",
    actor: { type: "human_operator", id: "H-1" },
    authority: "human_operator",
    policyVersion: "autonomous-fund.v1",
  });
  const serviceAuthorized = fundService.execute({
    type: "authorize",
    capitalReferenceId: "REF-SERVICE",
    capitalReferenceAmount: 10_000,
    capitalReferenceAt: "2026-07-24T00:00:00.000Z",
    autonomousAllocationPct: 0.05,
  }, fundContext("fund-authorize-1"));
  assert.equal(serviceAuthorized.fund.initialAutonomousContribution, 500);
  const duplicateAuthorization = fundService.execute({ type: "authorize" }, fundContext("fund-authorize-1"));
  assert.equal(duplicateAuthorization.duplicate, true);
  assert.throws(
    () => fundService.execute({
      type: "authorize",
      capitalReferenceId: "REF-NEW",
      capitalReferenceAmount: 20_000,
      autonomousAllocationPct: 0.05,
    }, fundContext("fund-authorize-2")),
    error => error.code === "FUND_ALREADY_AUTHORIZED",
  );
  const serviceActive = fundService.execute({ type: "activate" }, fundContext("fund-activate-1"));
  assert.equal(serviceActive.fund.status, "ACTIVE");
  assert.throws(
    () => fundService.execute({ type: "recapitalize", amount: 100 }, fundContext("fund-recap-1")),
    error => error.code === "RECAPITALIZATION_REQUIRES_NEW_CONSTITUTION",
  );
  const frozen = fundService.execute({ type: "freeze", reason: "test" }, { ...fundContext("fund-freeze-1"), killSwitch: true });
  assert.equal(frozen.fund.status, "FROZEN");

  const autonomousRisk = engine.evaluateIntent(openIntent, {
    ...trustedContext,
    profile: "autonomous",
    fund: active,
  });
  assert.equal(autonomousRisk.decision, "approve");
  const noFundRisk = engine.evaluateIntent(openIntent, { ...trustedContext, profile: "autonomous", fund: null });
  assert.equal(noFundRisk.reasons.includes("AUTONOMOUS_FUND_NOT_ACTIVE"), true);

  console.log("APEX 7.1 constitutional Risk and fund tests: OK · 43 assertions");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
