"use strict";

const crypto = require("node:crypto");
const { prepareLegacyImport } = require("./migration");
const { project } = require("./projector");
const { normalizeSymbol, validateOpenCommand } = require("../portfolio/validators");

class LedgerCommandError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "LedgerCommandError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

class PaperLedgerCommands {
  constructor(options) {
    this.store = options.store;
    this.snapshots = options.snapshots;
    this.aggregateId = options.aggregateId || "PAPER-PORTFOLIO";
    this.projection = project(this.store.all());
  }

  initialize(cash = 25_000) {
    if (this.projection.initialized) return this.result(true);
    this.store.append(this.event("portfolio_initialized", {
      cash: finitePositive(cash, "initialCash"),
      currency: "USD",
      executionMode: "PAPER_ONLY",
    }, {
      idempotencyKey: "system:portfolio_initialized:v1",
      sessionId: "SYSTEM",
      actor: { type: "system", id: "APEX_BOOT" },
      causationId: "APEX_BOOT",
      correlationId: "APEX_BOOT",
    }));
    return this.rebuild(false);
  }

  execute(command, context) {
    this.projection = project(this.store.all());
    if (!context?.idempotencyKey) throw new LedgerCommandError("IDEMPOTENCY_KEY_REQUIRED", "El comando PAPER requiere idempotency key.");
    const existing = this.store.findByIdempotencyKey(context.idempotencyKey);
    if (existing) return this.result(true, { eventId: existing.id });
    if (context.killSwitch) throw new LedgerCommandError("KILL_SWITCH_ACTIVE", "El kill switch bloquea mutaciones PAPER.", 423);
    this.assertVersion(command.expectedVersion);

    switch (command.type) {
      case "open_position":
        return this.openPosition(command, context);
      case "modify_position":
        return this.modifyPosition(command, context);
      case "close_position":
        return this.closePosition(command, context);
      case "adjust_cash":
        return this.adjustCash(command, context);
      case "import_legacy_portfolio":
        return this.importLegacy(command, context);
      default:
        throw new LedgerCommandError("UNKNOWN_PAPER_COMMAND", `Comando PAPER desconocido: ${command.type}.`);
    }
  }

  openPosition(command, context) {
    const validation = validateOpenCommand(command);
    if (!validation.ok) throw new LedgerCommandError(validation.code, validation.message);
    const position = {
      ...validation.position,
      id: command.positionId || crypto.randomUUID(),
      openedAt: new Date().toISOString(),
      source: String(command.source || context.actor?.type || "PAPER_COMMAND").slice(0, 80),
    };
    if (this.projection.positions.some(item => item.id === position.id || item.symbol === position.symbol)) {
      throw new LedgerCommandError("DUPLICATE_POSITION", "Ya existe una posición para ese id o símbolo.");
    }
    if (position.capital > this.projection.cash) throw new LedgerCommandError("INSUFFICIENT_PAPER_CASH", "Cash PAPER insuficiente.");

    this.store.appendMany([
      this.event("paper_order_submitted", {
        orderId: position.id,
        symbol: position.symbol,
        capital: position.capital,
        entry: position.entry,
        stop: position.stop,
        target: position.target,
        executionMode: "PAPER_ONLY",
      }, { ...context, idempotencyKey: `${context.idempotencyKey}:submitted` }),
      this.event("paper_order_filled", {
        orderId: position.id,
        fillPrice: position.entry,
        position,
        executionMode: "PAPER_ONLY",
      }, context),
    ]);
    return this.rebuild(false, { positionId: position.id });
  }

  modifyPosition(command, context) {
    const position = this.findPosition(command);
    const stop = command.stop == null ? null : finitePositive(command.stop, "stop");
    const target = command.target == null ? null : finitePositive(command.target, "target");
    if (stop == null && target == null) throw new LedgerCommandError("EMPTY_MODIFICATION", "Se requiere stop o target.");
    if (stop != null && stop >= position.entry) throw new LedgerCommandError("INVALID_STOP", "El stop long debe ser menor a entry.");
    if (target != null && target <= position.entry) throw new LedgerCommandError("INVALID_TARGET", "El target long debe ser mayor a entry.");
    this.store.append(this.event("paper_position_modified", {
      positionId: position.id,
      symbol: position.symbol,
      stop,
      target,
      reason: String(command.reason || "").slice(0, 500),
    }, context));
    return this.rebuild(false, { positionId: position.id });
  }

  closePosition(command, context) {
    const position = this.findPosition(command);
    const fraction = Number(command.fraction == null ? 1 : command.fraction);
    if (!Number.isFinite(fraction) || fraction < 0.01 || fraction > 1) {
      throw new LedgerCommandError("INVALID_CLOSE_FRACTION", "La fracción debe estar entre 0.01 y 1.");
    }
    const exit = finitePositive(command.exit, "exit");
    const closedCapital = position.capital * fraction;
    const realizedPnL = ((exit - position.entry) / position.entry) * closedCapital;
    this.store.append(this.event("paper_position_closed", {
      positionId: position.id,
      symbol: position.symbol,
      fraction,
      closedCapital,
      entry: position.entry,
      exit,
      realizedPnL,
      reason: String(command.reason || "").slice(0, 500),
      executionMode: "PAPER_ONLY",
    }, context));
    return this.rebuild(false, { positionId: position.id, realizedPnL });
  }

  adjustCash(command, context) {
    if (context.authority !== "human_admin" && context.authority !== "system") {
      throw new LedgerCommandError("INSUFFICIENT_AUTHORITY", "Sólo una autoridad humana o de sistema puede ajustar cash.", 403);
    }
    const amount = finite(command.amount, "amount");
    if (this.projection.cash + amount < 0) throw new LedgerCommandError("NEGATIVE_CASH", "El ajuste produciría cash negativo.");
    this.store.append(this.event("paper_cash_adjusted", {
      amount,
      reason: String(command.reason || "").slice(0, 500),
    }, context));
    return this.rebuild(false);
  }

  importLegacy(command, context) {
    const prepared = prepareLegacyImport(command.portfolio, this.store.all());
    if (!prepared.ok) throw new LedgerCommandError(prepared.code, prepared.message, prepared.code === "LEGACY_FINGERPRINT_CONFLICT" ? 409 : 400);
    if (prepared.duplicate) return this.result(true, { fingerprint: prepared.fingerprint });
    if (this.projection.positions.length || this.projection.version > 1) {
      throw new LedgerCommandError("NON_EMPTY_PORTFOLIO", "La importación sólo se permite antes de otras mutaciones PAPER.", 409);
    }
    this.store.append(this.event("legacy_portfolio_imported", {
      portfolio: prepared.portfolio,
      fingerprint: prepared.fingerprint,
      source: "browser_localStorage_v7.0",
      executionMode: "PAPER_ONLY",
    }, context));
    return this.rebuild(false, { fingerprint: prepared.fingerprint });
  }

  findPosition(command) {
    const id = String(command.positionId || command.tradeId || "").trim();
    if (id) {
      const position = this.projection.positions.find(item => item.id === id);
      if (!position) throw new LedgerCommandError("POSITION_NOT_FOUND", `No existe la posición ${id}.`, 404);
      return position;
    }
    const symbol = normalizeSymbol(command.symbol);
    const matches = this.projection.positions.filter(item => item.symbol === symbol);
    if (matches.length !== 1) throw new LedgerCommandError("POSITION_NOT_UNIQUE", "La posición no pudo identificarse de forma única.");
    return matches[0];
  }

  assertVersion(expectedVersion) {
    if (expectedVersion == null) return;
    if (Number(expectedVersion) !== this.projection.version) {
      throw new LedgerCommandError("PORTFOLIO_VERSION_CONFLICT", "La proyección cambió; recargá antes de reintentar.", 409);
    }
  }

  event(type, payload, context) {
    return {
      type,
      aggregateId: this.aggregateId,
      idempotencyKey: context.idempotencyKey,
      causationId: context.causationId || context.idempotencyKey,
      correlationId: context.correlationId || context.idempotencyKey,
      sessionId: context.sessionId || "SYSTEM",
      actor: context.actor || { type: "system", id: "APEX" },
      payload,
      policyVersion: context.policyVersion || "paper-ledger.v1",
    };
  }

  rebuild(duplicate, extra = {}) {
    this.projection = project(this.store.all());
    if (this.snapshots) this.snapshots.save(this.projection);
    return this.result(duplicate, extra);
  }

  result(duplicate, extra = {}) {
    return { ok: true, duplicate, projection: JSON.parse(JSON.stringify(this.projection)), ...extra };
  }
}

function finite(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new LedgerCommandError("INVALID_NUMBER", `${field} debe ser finito.`);
  return parsed;
}

function finitePositive(value, field) {
  const parsed = finite(value, field);
  if (parsed <= 0) throw new LedgerCommandError("INVALID_NUMBER", `${field} debe ser positivo.`);
  return parsed;
}

module.exports = { LedgerCommandError, PaperLedgerCommands };
