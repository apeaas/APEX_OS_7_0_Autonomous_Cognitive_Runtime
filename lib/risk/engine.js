"use strict";

const { evaluateConstitution } = require("../constitution/evaluator");
const { evaluateSafety } = require("../safety-kernel/evaluator");
const { validateRiskDecision } = require("./contracts");
const { resolveRiskPolicy } = require("./policy");

class RiskEngine {
  constructor(options) {
    this.constitution = options.constitution;
  }

  evaluateIntent(intent, context = {}) {
    const evaluatedAt = new Date(context.now || Date.now()).toISOString();
    const profileName = context.profile || "manual";
    const policy = resolveRiskPolicy(profileName, this.constitution, context.runtimeConfig);
    const feedEvidence = {
      trusted: Boolean(context.feedQuality?.trusted),
      status: context.feedQuality?.status || "unknown",
      reason: context.feedQuality?.reason || null,
      symbol: intent.symbol || null,
      symbolFresh: Boolean(context.symbolQuality?.trusted ?? context.feedQuality?.trusted),
      ageMs: finite(context.symbolQuality?.ageMs) ? Number(context.symbolQuality.ageMs) : null,
      observedAt: evaluatedAt,
    };
    const base = {
      decision: "reject",
      approvedRisk: 0,
      approvedSize: 0,
      reasons: [],
      limitsApplied: limitEntries(policy.limits),
      warnings: [],
      policyVersion: policy.policyVersion,
      constitutionVersion: this.constitution.version,
      feedEvidence,
      evaluatedAt,
    };

    if (!policy.enabled) return this.finalize(base, "reject", ["RISK_PROFILE_DISABLED"]);
    const safety = evaluateSafety({
      ...intent,
      executionMode: intent.executionMode || "PAPER_ONLY",
      marketDependent: isMarketDependent(intent),
      mutable: true,
    }, {
      killSwitch: context.killSwitch,
      feedTrusted: feedEvidence.trusted && feedEvidence.symbolFresh,
      requestedByModel: context.requestedByModel,
      validClaim: context.validClaim,
    });
    if (!safety.allowed) return this.finalize(base, "reject", safety.violations);
    const constitutional = evaluateConstitution(intent, this.constitution);
    if (!constitutional.allowed) return this.finalize(base, "reject", constitutional.reasons);
    if (intent.expiresAt && Date.parse(intent.expiresAt) <= Date.parse(evaluatedAt)) {
      return this.finalize(base, "reject", ["INTENT_EXPIRED"]);
    }

    if (intent.type === "open_position") return this.evaluateOpen(intent, context, policy, base);
    if (intent.type === "close_position") return this.evaluateClose(intent, context, base);
    if (intent.type === "modify_position") return this.evaluateModify(intent, context, base);
    if (["import_legacy_portfolio", "read_only"].includes(intent.type)) return this.finalize(base, "approve", ["NON_MARKET_ADMINISTRATIVE_INTENT"]);
    return this.finalize(base, "reject", ["UNSUPPORTED_RISK_INTENT"]);
  }

  evaluateOpen(intent, context, policy, base) {
    const portfolio = context.portfolio || {};
    const positions = Array.isArray(portfolio.positions) ? portfolio.positions : [];
    const equity = number(portfolio.equity);
    const cash = number(portfolio.cash);
    const entry = number(intent.entry);
    const stop = number(intent.stop);
    const target = number(intent.target);
    const requestedSize = number(intent.capital);
    if (!(equity > 0 && cash >= 0)) return this.finalize(base, "reject", ["PORTFOLIO_UNAVAILABLE"]);
    if (!(requestedSize > 0 && entry > stop && target > entry && stop > 0)) {
      return this.finalize(base, "reject", ["INVALID_LONG_SPOT_GEOMETRY"]);
    }
    if (positions.some(position => position.symbol === intent.symbol)) return this.finalize(base, "reject", ["DUPLICATE_SYMBOL_EXPOSURE"]);
    if (positions.length >= policy.limits.maximumConcurrentPositions) return this.finalize(base, "reject", ["MAX_CONCURRENT_POSITIONS"]);
    const dailyPnl = number(context.dailyPnl);
    if (dailyPnl < -(equity * policy.limits.maximumDailyLossPct)) return this.finalize(base, "reject", ["DAILY_LOSS_LIMIT"]);

    const riskFraction = (entry - stop) / entry;
    const rewardRisk = (target - entry) / (entry - stop);
    if (policy.limits.minimumRiskReward != null && rewardRisk < policy.limits.minimumRiskReward) {
      return this.finalize(base, "reject", ["MINIMUM_REWARD_RISK"]);
    }
    const maxByPosition = equity * policy.limits.maximumPositionPct;
    const maxByRisk = riskFraction > 0 ? (equity * policy.limits.maximumRiskPerTradePct) / riskFraction : 0;
    const grossExposure = number(portfolio.exposure?.gross);
    const grossCeiling = equity * policy.limits.maximumPositionPct * policy.limits.maximumConcurrentPositions;
    let approvedSize = Math.min(requestedSize, cash, maxByPosition, maxByRisk, Math.max(0, grossCeiling - grossExposure));

    if (context.profile === "autonomous") {
      const fund = context.fund;
      if (!fund || fund.status !== "ACTIVE") return this.finalize(base, "reject", ["AUTONOMOUS_FUND_NOT_ACTIVE"]);
      if (Number(fund.autonomousAllocationPct) > policy.limits.maximumFundAllocationPct) {
        return this.finalize(base, "reject", ["AUTONOMOUS_FUND_ALLOCATION_LIMIT"]);
      }
      approvedSize = Math.min(approvedSize, number(fund.cash), Math.max(0, number(fund.netAssetValue) - number(fund.grossExposure)));
    }
    if (!(approvedSize > 0)) return this.finalize(base, "reject", ["NO_APPROVABLE_SIZE"]);
    base.approvedSize = round(approvedSize);
    base.approvedRisk = round(approvedSize * riskFraction);
    base.rewardRisk = round(rewardRisk, 4);
    if (approvedSize + 0.000001 < requestedSize) {
      return this.finalize(base, "reduce", ["SIZE_REDUCED_TO_MOST_RESTRICTIVE_LIMIT"]);
    }
    return this.finalize(base, "approve", ["ALL_RISK_CHECKS_PASSED"]);
  }

  evaluateClose(intent, context, base) {
    const position = findPosition(context.portfolio, intent);
    if (!position) return this.finalize(base, "reject", ["POSITION_NOT_FOUND"]);
    const fraction = intent.fraction == null ? 1 : Number(intent.fraction);
    if (!Number.isFinite(fraction) || fraction < 0.01 || fraction > 1) {
      return this.finalize(base, "reject", ["INVALID_CLOSE_FRACTION"]);
    }
    if (!(number(intent.exit) > 0)) return this.finalize(base, "reject", ["INVALID_EXIT_PRICE"]);
    base.approvedSize = round(number(position.capital) * fraction);
    base.approvedRisk = 0;
    return this.finalize(base, "approve", ["RISK_REDUCING_CLOSE"]);
  }

  evaluateModify(intent, context, base) {
    const position = findPosition(context.portfolio, intent);
    if (!position) return this.finalize(base, "reject", ["POSITION_NOT_FOUND"]);
    if (intent.stop != null && (!(number(intent.stop) > 0) || number(intent.stop) < number(position.stop))) {
      return this.finalize(base, "reject", ["STOP_CANNOT_INCREASE_RISK"]);
    }
    if (intent.target != null && number(intent.target) <= number(position.entry)) {
      return this.finalize(base, "reject", ["INVALID_TARGET"]);
    }
    base.approvedSize = number(position.capital);
    base.approvedRisk = Math.max(0, number(position.capital) * ((number(position.entry) - number(intent.stop ?? position.stop)) / number(position.entry)));
    return this.finalize(base, "approve", ["PROTECTION_DOES_NOT_INCREASE_RISK"]);
  }

  finalize(base, decision, reasons) {
    const result = { ...base, decision, reasons: reasons.slice() };
    const validation = validateRiskDecision(result);
    if (!validation.ok) throw Object.assign(new Error(validation.code), { code: validation.code });
    return result;
  }
}

function isMarketDependent(intent) {
  return ["open_position", "close_position", "modify_position"].includes(intent.type);
}

function findPosition(portfolio, intent) {
  const positions = Array.isArray(portfolio?.positions) ? portfolio.positions : [];
  if (intent.positionId || intent.tradeId) return positions.find(item => item.id === (intent.positionId || intent.tradeId));
  const matches = positions.filter(item => item.symbol === intent.symbol);
  return matches.length === 1 ? matches[0] : null;
}

function limitEntries(limits) {
  return Object.entries(limits).map(([limit, value]) => ({ limit, value }));
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function number(value) {
  return finite(value) ? Number(value) : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

module.exports = { RiskEngine };
