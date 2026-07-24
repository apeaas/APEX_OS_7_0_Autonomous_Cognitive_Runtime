"use strict";

const FUND_TYPES = Object.freeze([
  "PATRIMONY_RESERVE",
  "AUTONOMOUS_GROWTH_POOL",
  "PROFIT_CONSOLIDATION_POOL",
]);
const FUND_STATES = Object.freeze(["DRAFT", "AUTHORIZED", "ACTIVE", "RESTRICTED", "FROZEN", "CLOSED"]);

function authorizeFund(input, context = {}) {
  requireHuman(context);
  const allocationPct = positive(input.autonomousAllocationPct, "autonomousAllocationPct");
  if (allocationPct > 0.05) throw fundError("FUND_ALLOCATION_EXCEEDS_5_PERCENT", "La contribución inicial no puede superar 5%.");
  const referenceAmount = positive(input.capitalReferenceAmount, "capitalReferenceAmount");
  const initial = referenceAmount * allocationPct;
  const at = iso(input.capitalReferenceAt || Date.now());
  return {
    fundId: String(input.fundId || "AUTONOMOUS_GROWTH_POOL"),
    fundType: "AUTONOMOUS_GROWTH_POOL",
    capitalReferenceId: requiredString(input.capitalReferenceId, "capitalReferenceId"),
    capitalReferenceAmount: referenceAmount,
    capitalReferenceAt: at,
    capitalReferenceFrozen: true,
    autonomousAllocationPct: allocationPct,
    initialAutonomousContribution: initial,
    activationAt: null,
    netAssetValue: initial,
    cash: initial,
    realizedPnL: 0,
    unrealizedPnL: 0,
    retainedProfit: 0,
    consolidatedProfit: 0,
    highWaterMark: initial,
    drawdownPct: 0,
    grossExposure: 0,
    netExposure: 0,
    status: "AUTHORIZED",
    policyVersion: context.policyVersion || "autonomous-fund.v1",
    topUpAllowed: false,
    automaticReturnAllowed: false,
  };
}

function activateFund(fund, context = {}) {
  requireHuman(context);
  assertFund(fund);
  if (fund.status !== "AUTHORIZED") throw fundError("INVALID_FUND_TRANSITION", "Sólo un fondo AUTHORIZED puede activarse.");
  return { ...fund, status: "ACTIVE", activationAt: iso(context.at || Date.now()) };
}

function applyPerformance(fund, performance = {}) {
  assertFund(fund);
  const realizedPnL = finite(performance.realizedPnL, "realizedPnL");
  const unrealizedPnL = finite(performance.unrealizedPnL, "unrealizedPnL");
  const grossExposure = nonNegative(performance.grossExposure, "grossExposure");
  const netExposure = finite(performance.netExposure, "netExposure");
  const retainedProfit = Math.max(0, realizedPnL - Number(fund.consolidatedProfit));
  const netAssetValue = Number(fund.initialAutonomousContribution) + realizedPnL + unrealizedPnL - Number(fund.consolidatedProfit);
  const cash = Math.max(0, Number(fund.initialAutonomousContribution) + realizedPnL - Number(fund.consolidatedProfit) - grossExposure);
  const highWaterMark = Math.max(Number(fund.highWaterMark), netAssetValue);
  return {
    ...fund,
    netAssetValue,
    cash,
    realizedPnL,
    unrealizedPnL,
    retainedProfit,
    highWaterMark,
    drawdownPct: highWaterMark > 0 ? (highWaterMark - netAssetValue) / highWaterMark : 0,
    grossExposure,
    netExposure,
  };
}

function consolidateProfit(fund, amount, context = {}) {
  requireHuman(context);
  assertFund(fund);
  if (!["ACTIVE", "RESTRICTED"].includes(fund.status)) throw fundError("INVALID_FUND_TRANSITION", "El fondo no admite consolidación en su estado actual.");
  const requested = positive(amount, "amount");
  if (requested > Number(fund.retainedProfit) || requested > Number(fund.cash)) {
    throw fundError("INSUFFICIENT_RETAINED_PROFIT", "La consolidación supera la ganancia retenida disponible.");
  }
  return {
    ...fund,
    cash: Number(fund.cash) - requested,
    netAssetValue: Number(fund.netAssetValue) - requested,
    retainedProfit: Number(fund.retainedProfit) - requested,
    consolidatedProfit: Number(fund.consolidatedProfit) + requested,
  };
}

function transitionFund(fund, target, context = {}) {
  requireHuman(context);
  assertFund(fund);
  if (!["RESTRICTED", "FROZEN", "CLOSED"].includes(target)) throw fundError("INVALID_FUND_STATE", "Estado de fondo inválido.");
  if (fund.status === "CLOSED") throw fundError("INVALID_FUND_TRANSITION", "Un fondo cerrado no puede reabrirse.");
  return { ...fund, status: target };
}

function assertFund(fund) {
  if (!fund || fund.fundType !== "AUTONOMOUS_GROWTH_POOL") throw fundError("INVALID_FUND", "Fondo autónomo inválido.");
  if (!FUND_STATES.includes(fund.status)) throw fundError("INVALID_FUND_STATE", "Estado de fondo inválido.");
  if (Number(fund.autonomousAllocationPct) > 0.05) throw fundError("FUND_ALLOCATION_EXCEEDS_5_PERCENT", "El fondo viola el límite de 5%.");
  if (!fund.capitalReferenceFrozen) throw fundError("CAPITAL_REFERENCE_NOT_FROZEN", "La base de capital debe permanecer congelada.");
  const expected = Number(fund.capitalReferenceAmount) * Number(fund.autonomousAllocationPct);
  if (Math.abs(expected - Number(fund.initialAutonomousContribution)) > 0.000001) {
    throw fundError("INITIAL_CONTRIBUTION_CHANGED", "La contribución inicial fue recalculada o alterada.");
  }
}

function requireHuman(context) {
  if (context.authority !== "human_operator") throw fundError("HUMAN_AUTHORITY_REQUIRED", "El fondo requiere autoridad humana explícita.");
}

function requiredString(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw fundError("INVALID_FUND_INPUT", `${field} es obligatorio.`);
  return normalized;
}

function positive(value, field) {
  const parsed = finite(value, field);
  if (!(parsed > 0)) throw fundError("INVALID_FUND_INPUT", `${field} debe ser positivo.`);
  return parsed;
}

function nonNegative(value, field) {
  const parsed = finite(value, field);
  if (parsed < 0) throw fundError("INVALID_FUND_INPUT", `${field} no puede ser negativo.`);
  return parsed;
}

function finite(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw fundError("INVALID_FUND_INPUT", `${field} debe ser finito.`);
  return parsed;
}

function iso(value) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw fundError("INVALID_FUND_INPUT", "Fecha inválida.");
  return new Date(timestamp).toISOString();
}

function fundError(code, message) {
  return Object.assign(new Error(message), { code, statusCode: 400 });
}

module.exports = {
  FUND_STATES,
  FUND_TYPES,
  activateFund,
  applyPerformance,
  assertFund,
  authorizeFund,
  consolidateProfit,
  transitionFund,
};
