"use strict";

const HARD_INVARIANTS = Object.freeze({
  PAPER_ONLY: true,
  liveTrading: false,
  externalAccounts: false,
  brokerExecution: false,
  walletSigning: false,
  withdrawals: false,
  transfers: false,
  custody: false,
  marketDataReadOnly: true,
  trustedMarketFeedRequired: true,
  maximumInitialAutonomousAllocationPct: 0.05,
  modelCanTrustFeed: false,
  modelCanElevateRisk: false,
  modelCanChangeConstitution: false,
  modelCanDisableKillSwitch: false,
  modelCanActivateLive: false,
  modelCanRecapitalizeFund: false,
  validClaimRequiredForActionCompletion: true,
});

const FORBIDDEN_CAPABILITIES = new Set([
  "live_trade",
  "broker_order",
  "wallet_sign",
  "withdraw",
  "transfer",
  "custody",
  "disable_kill_switch",
  "change_constitution",
  "elevate_risk",
  "recapitalize_fund",
  "self_approve",
  "self_deploy",
]);

function hardLocks() {
  return {
    PAPER_ONLY: true,
    liveTrading: false,
    externalAccounts: false,
    brokerExecution: false,
    walletSigning: false,
    withdrawals: false,
    transfers: false,
    custody: false,
    humanAutonomyCeilingPct: 5,
    autonomyCeilingMutableByAI: false,
    averagingDown: false,
    longSpotOnly: true,
  };
}

module.exports = { FORBIDDEN_CAPABILITIES, HARD_INVARIANTS, hardLocks };
