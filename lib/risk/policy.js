"use strict";

function resolveRiskPolicy(profileName, constitution, runtimeConfig = {}) {
  const profile = constitution.riskProfiles[profileName];
  if (!profile) throw Object.assign(new Error(`Perfil Risk desconocido: ${profileName}.`), { code: "UNKNOWN_RISK_PROFILE" });
  const hard = constitution.nonNegotiableLimits;
  const limits = {
    maximumRiskPerTradePct: minimum(
      profile.maximumRiskPerTradePct,
      hard.maximumRiskPerTradePct,
      percent(runtimeConfig.riskPerTradePct),
    ),
    maximumPositionPct: minimum(
      profile.maximumPositionPct,
      hard.maximumPositionPct,
      percent(runtimeConfig.maxPositionPct),
    ),
    maximumDailyLossPct: minimum(
      profile.maximumDailyLossPct,
      hard.maximumDailyLossPct,
      percent(runtimeConfig.dailyLossLimitPct),
    ),
    maximumConcurrentPositions: minimum(
      profile.maximumConcurrentPositions,
      hard.maximumConcurrentPositions,
      runtimeConfig.maxConcurrentPositions,
    ),
    maximumFundAllocationPct: minimum(
      profile.maximumFundAllocationPct,
      hard.maximumInitialAutonomousAllocationPct,
      percent(runtimeConfig.autonomyCapPct),
    ),
    minimumRiskReward: finite(runtimeConfig.minRiskReward) ? Number(runtimeConfig.minRiskReward) : null,
  };
  return {
    profile: profileName,
    enabled: profile.enabled === true,
    limits,
    policyVersion: "unified-risk.v1",
    sources: ["safety-kernel", `constitution:${constitution.version}`, "runtime-config:restrictive-only"],
  };
}

function minimum(...values) {
  const finiteValues = values.map(Number).filter(Number.isFinite);
  return finiteValues.length ? Math.min(...finiteValues) : 0;
}

function percent(value) {
  return finite(value) ? Number(value) / 100 : undefined;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

module.exports = { resolveRiskPolicy };
