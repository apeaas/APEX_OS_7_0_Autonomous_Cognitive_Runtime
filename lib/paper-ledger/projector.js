"use strict";

function project(events, seed = null) {
  const state = seed ? clone(seed) : initialProjection();
  for (const event of events) applyEvent(state, event);
  return finalize(state);
}

function initialProjection() {
  return {
    aggregateId: "PAPER-PORTFOLIO",
    cash: 0,
    equity: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    positions: [],
    closedTrades: [],
    exposure: { gross: 0, net: 0, bySymbol: {} },
    funds: {},
    highWaterMark: 0,
    drawdown: 0,
    version: 0,
    lastEventApplied: null,
    initialized: false,
    legacyImported: false,
  };
}

function applyEvent(state, event) {
  switch (event.type) {
    case "portfolio_initialized":
      state.cash = number(event.payload.cash);
      state.realizedPnL = 0;
      state.positions = [];
      state.closedTrades = [];
      state.initialized = true;
      break;
    case "legacy_portfolio_imported":
      applyLegacyPortfolio(state, event.payload.portfolio);
      state.legacyImported = true;
      state.legacyFingerprint = event.payload.fingerprint;
      break;
    case "paper_order_filled":
      state.cash -= number(event.payload.position.capital);
      state.positions.push(clone(event.payload.position));
      break;
    case "paper_position_modified": {
      const position = state.positions.find(item => item.id === event.payload.positionId);
      if (position) {
        if (event.payload.stop != null) position.stop = number(event.payload.stop);
        if (event.payload.target != null) position.target = number(event.payload.target);
        position.modifiedAt = event.occurredAt;
      }
      break;
    }
    case "paper_position_closed": {
      const index = state.positions.findIndex(item => item.id === event.payload.positionId);
      if (index >= 0) {
        const position = state.positions[index];
        const closedCapital = number(event.payload.closedCapital);
        const pnl = number(event.payload.realizedPnL);
        const remaining = number(position.capital) - closedCapital;
        if (remaining <= 0.00000001) state.positions.splice(index, 1);
        else position.capital = remaining;
        state.cash += closedCapital + pnl;
        state.realizedPnL += pnl;
        state.closedTrades.unshift({
          id: event.id,
          positionId: event.payload.positionId,
          symbol: event.payload.symbol,
          capital: closedCapital,
          entry: number(event.payload.entry),
          exit: number(event.payload.exit),
          pnl,
          reason: event.payload.reason || "",
          closedAt: event.occurredAt,
        });
      }
      break;
    }
    case "paper_cash_adjusted":
      state.cash += number(event.payload.amount);
      break;
    case "autonomous_fund_authorized":
    case "autonomous_fund_activated":
    case "profit_consolidated":
    case "fund_restricted":
    case "fund_frozen":
      applyFundEvent(state, event);
      break;
    default:
      break;
  }
  state.version += 1;
  state.lastEventApplied = event.id;
  state.lastEventChecksum = event.integrity?.checksum || null;
  updateDerived(state);
}

function applyLegacyPortfolio(state, portfolio) {
  state.cash = number(portfolio.cash);
  state.realizedPnL = number(portfolio.realizedPnL);
  state.positions = clone(portfolio.positions);
  state.closedTrades = clone(portfolio.closedTrades);
  state.initialized = true;
}

function applyFundEvent(state, event) {
  const id = event.payload.fundId || "AUTONOMOUS_GROWTH_POOL";
  const current = state.funds[id] || {};
  state.funds[id] = { ...current, ...clone(event.payload), lastEventId: event.id };
}

function finalize(state) {
  updateDerived(state);
  return state;
}

function updateDerived(state) {
  state.unrealizedPnL = state.positions.reduce((sum, position) => sum + number(position.unrealizedPnL), 0);
  const deployed = state.positions.reduce((sum, position) => sum + number(position.capital), 0);
  state.equity = state.cash + deployed + state.unrealizedPnL;
  state.exposure = state.positions.reduce((exposure, position) => {
    const capital = number(position.capital);
    exposure.gross += Math.abs(capital);
    exposure.net += capital;
    exposure.bySymbol[position.symbol] = number(exposure.bySymbol[position.symbol]) + capital;
    return exposure;
  }, { gross: 0, net: 0, bySymbol: {} });
  state.highWaterMark = Math.max(number(state.highWaterMark), state.equity);
  state.drawdown = state.highWaterMark > 0 ? (state.highWaterMark - state.equity) / state.highWaterMark : 0;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { applyEvent, initialProjection, project };
