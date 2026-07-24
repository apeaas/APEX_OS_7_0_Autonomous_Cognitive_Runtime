"use strict";

const { sha256, stableStringify } = require("../paper-ledger/contracts");

function validateLegacyPortfolio(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return failure("INVALID_LEGACY_PORTFOLIO", "Portfolio heredado ausente.");
  for (const field of ["cash", "equity", "realized", "positions", "closedTrades"]) {
    if (!(field in input)) return failure("PARTIAL_LEGACY_IMPORT", `Falta ${field} en la importación.`);
  }
  if (!finiteNonNegative(input.cash) || !finiteNonNegative(input.equity) || !finite(input.realized)) {
    return failure("INVALID_LEGACY_NUMBERS", "Cash, equity o PnL heredado no son válidos.");
  }
  if (!Array.isArray(input.positions) || !Array.isArray(input.closedTrades)) {
    return failure("INVALID_LEGACY_COLLECTIONS", "Posiciones e historial deben ser arrays.");
  }
  const ids = new Set();
  const positions = [];
  for (const candidate of input.positions) {
    const validated = validatePosition(candidate);
    if (!validated.ok) return validated;
    if (ids.has(validated.position.id)) return failure("DUPLICATE_POSITION", "Hay posiciones heredadas duplicadas.");
    ids.add(validated.position.id);
    positions.push(validated.position);
  }
  const deployed = positions.reduce((sum, position) => sum + position.capital, 0);
  if (deployed > Number(input.equity) * 20 + 0.01) return failure("IMPOSSIBLE_EXPOSURE", "La exposición heredada es imposible.");

  const normalized = {
    cash: Number(input.cash),
    equity: Number(input.equity),
    realizedPnL: Number(input.realized),
    positions,
    closedTrades: input.closedTrades.map(normalizeClosedTrade),
  };
  return {
    ok: true,
    portfolio: normalized,
    fingerprint: sha256(stableStringify(normalized)),
  };
}

function validatePosition(input) {
  if (!input || typeof input !== "object") return failure("INVALID_POSITION", "Posición inválida.");
  const id = String(input.id || "").trim();
  const symbol = normalizeSymbol(input.symbol);
  if (!id || !symbol) return failure("INVALID_POSITION_IDENTITY", "Toda posición requiere id y symbol.");
  for (const field of ["capital", "entry", "stop", "target"]) {
    if (!finitePositive(input[field])) return failure("INVALID_POSITION_NUMBER", `${field} debe ser finito y positivo.`);
  }
  if (!(Number(input.stop) < Number(input.entry) && Number(input.entry) < Number(input.target))) {
    return failure("IMPOSSIBLE_POSITION", "La posición long requiere stop < entry < target.");
  }
  return {
    ok: true,
    position: {
      id,
      symbol,
      capital: Number(input.capital),
      entry: Number(input.entry),
      stop: Number(input.stop),
      target: Number(input.target),
      openedAt: normalizeDate(input.openedAt),
      source: String(input.source || "LEGACY_IMPORT").slice(0, 80),
    },
  };
}

function validateOpenCommand(input) {
  const candidate = {
    id: input.positionId || input.id || "PENDING",
    symbol: input.symbol,
    capital: input.capital,
    entry: input.entry,
    stop: input.stop,
    target: input.target,
    openedAt: new Date().toISOString(),
    source: input.source || "PAPER_COMMAND",
  };
  return validatePosition(candidate);
}

function normalizeClosedTrade(input) {
  if (!input || typeof input !== "object") return {};
  return {
    id: String(input.id || ""),
    positionId: String(input.parentId || input.positionId || input.id || ""),
    symbol: normalizeSymbol(input.symbol),
    capital: finite(input.capital) ? Number(input.capital) : 0,
    entry: finite(input.entry) ? Number(input.entry) : 0,
    exit: finite(input.exit) ? Number(input.exit) : 0,
    pnl: finite(input.pnl) ? Number(input.pnl) : 0,
    reason: String(input.reason || "").slice(0, 500),
    closedAt: normalizeDate(input.closedAt),
  };
}

function normalizeSymbol(value) {
  const symbol = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{5,20}$/.test(symbol) ? symbol : "";
}

function normalizeDate(value) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(0).toISOString();
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function finitePositive(value) {
  return finite(value) && Number(value) > 0;
}

function finiteNonNegative(value) {
  return finite(value) && Number(value) >= 0;
}

function failure(code, message) {
  return { ok: false, code, message };
}

module.exports = {
  normalizeSymbol,
  validateLegacyPortfolio,
  validateOpenCommand,
  validatePosition,
};
