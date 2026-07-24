"use strict";

const { project } = require("../paper-ledger/projector");
const {
  activateFund,
  authorizeFund,
  consolidateProfit,
  transitionFund,
} = require("./model");

class AutonomousFundService {
  constructor(options) {
    this.store = options.store;
    this.snapshots = options.snapshots;
    this.refresh();
  }

  execute(command, context) {
    this.refresh();
    if (!context?.idempotencyKey) throw Object.assign(new Error("Idempotency key obligatoria."), { code: "IDEMPOTENCY_KEY_REQUIRED" });
    const existing = this.store.findByIdempotencyKey(context.idempotencyKey);
    if (existing) return { ok: true, duplicate: true, fund: this.current(), projection: this.projection };
    if (context.killSwitch && !["freeze", "restrict"].includes(command.type)) {
      throw Object.assign(new Error("Kill switch activo."), { code: "KILL_SWITCH_ACTIVE", statusCode: 423 });
    }
    const current = this.current();
    let type;
    let next;
    switch (command.type) {
      case "authorize":
        if (current) throw fundError("FUND_ALREADY_AUTHORIZED", "El fondo ya fue autorizado; no puede recalcularse.");
        next = authorizeFund(command, context);
        type = "autonomous_fund_authorized";
        break;
      case "activate":
        next = activateFund(requiredCurrent(current), context);
        type = "autonomous_fund_activated";
        break;
      case "consolidate":
        next = consolidateProfit(requiredCurrent(current), command.amount, context);
        type = "profit_consolidated";
        break;
      case "restrict":
        next = transitionFund(requiredCurrent(current), "RESTRICTED", context);
        type = "fund_restricted";
        break;
      case "freeze":
        next = transitionFund(requiredCurrent(current), "FROZEN", context);
        type = "fund_frozen";
        break;
      case "recapitalize":
        throw fundError("RECAPITALIZATION_REQUIRES_NEW_CONSTITUTION", "La recapitalización exige nueva Constitución y aprobación humana.");
      default:
        throw fundError("UNKNOWN_FUND_COMMAND", `Comando de fondo desconocido: ${command.type}.`);
    }
    this.store.append({
      type,
      aggregateId: "PAPER-PORTFOLIO",
      idempotencyKey: context.idempotencyKey,
      causationId: context.causationId || context.idempotencyKey,
      correlationId: context.correlationId || context.idempotencyKey,
      sessionId: context.sessionId,
      actor: context.actor,
      policyVersion: context.policyVersion || "autonomous-fund.v1",
      payload: { ...next, reason: String(command.reason || "").slice(0, 500) },
    });
    this.refresh();
    if (this.snapshots) this.snapshots.save(this.projection);
    return { ok: true, duplicate: false, fund: this.current(), projection: this.projection };
  }

  current() {
    return this.projection.funds.AUTONOMOUS_GROWTH_POOL || null;
  }

  refresh() {
    this.projection = project(this.store.all());
    return this.projection;
  }
}

function requiredCurrent(fund) {
  if (!fund) throw fundError("FUND_NOT_AUTHORIZED", "El fondo todavía no fue autorizado.");
  return fund;
}

function fundError(code, message) {
  return Object.assign(new Error(message), { code, statusCode: 400 });
}

module.exports = { AutonomousFundService };
