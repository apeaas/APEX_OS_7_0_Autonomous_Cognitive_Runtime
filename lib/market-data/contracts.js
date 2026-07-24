"use strict";

const SYMBOLS = Object.freeze(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
const INTERVAL = "15m";
const INTERVAL_MS = 15 * 60 * 1000;
const MAX_FUTURE_DRIFT_MS = 60 * 1000;

function issue(code, severity, detail = {}) {
  return { code, severity, ...detail };
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseKline(row, symbol, interval, now) {
  const source = Array.isArray(row) ? {
    openTime: row[0], open: row[1], high: row[2], low: row[3], close: row[4], volume: row[5], closeTime: row[6],
  } : row || {};
  const openTime = Number(source.openTime ?? source.ts);
  const closeTime = Number(source.closeTime ?? (openTime + INTERVAL_MS - 1));
  const open = finitePositive(source.open);
  const high = finitePositive(source.high);
  const low = finitePositive(source.low);
  const close = finitePositive(source.close);
  const volume = finiteNonNegative(source.volume);
  const errors = [];
  if (!Number.isInteger(openTime) || openTime <= 0) errors.push(issue("invalid_timestamp", "error", { openTime }));
  if (!Number.isInteger(closeTime) || closeTime < openTime) errors.push(issue("invalid_close_timestamp", "error", { openTime, closeTime }));
  if (openTime > now + MAX_FUTURE_DRIFT_MS) errors.push(issue("future_timestamp", "error", { openTime, now }));
  if ([open, high, low, close].some(value => value == null) || volume == null) errors.push(issue("invalid_numeric_value", "error", { openTime }));
  if (errors.length) return { candle: null, issues: errors };
  if (high < Math.max(open, close, low) || low > Math.min(open, close, high) || high < low) {
    errors.push(issue("invalid_ohlcv_integrity", "error", { openTime, open, high, low, close }));
  }
  const candle = errors.length ? null : { symbol, interval, openTime, closeTime, open, high, low, close, volume };
  return { candle, issues: errors };
}

function normalizeKlines(rows, options = {}) {
  const symbol = String(options.symbol || "").toUpperCase();
  const interval = String(options.interval || INTERVAL);
  const now = Number(options.now || Date.now());
  const issues = [];
  if (!SYMBOLS.includes(symbol)) issues.push(issue("invalid_symbol", "error", { symbol }));
  if (interval !== INTERVAL) issues.push(issue("invalid_interval", "error", { interval }));
  if (!Array.isArray(rows)) return { candles: [], issues: [...issues, issue("invalid_payload", "error")] };

  const parsed = [];
  let previousInputTimestamp = -Infinity;
  rows.forEach((row, inputIndex) => {
    const result = parseKline(row, symbol, interval, now);
    issues.push(...result.issues.map(item => ({ ...item, inputIndex })));
    if (!result.candle) return;
    if (result.candle.openTime < previousInputTimestamp) {
      issues.push(issue("out_of_order", "warning", { inputIndex, openTime: result.candle.openTime, previousOpenTime: previousInputTimestamp }));
    }
    previousInputTimestamp = result.candle.openTime;
    parsed.push(result.candle);
  });

  parsed.sort((left, right) => left.openTime - right.openTime);
  const candles = [];
  const seen = new Set();
  parsed.forEach(candle => {
    if (seen.has(candle.openTime)) {
      issues.push(issue("duplicate_candle", "warning", { openTime: candle.openTime }));
      return;
    }
    seen.add(candle.openTime);
    const prior = candles[candles.length - 1];
    if (prior && candle.openTime - prior.openTime > INTERVAL_MS) {
      const missing = Math.floor((candle.openTime - prior.openTime) / INTERVAL_MS) - 1;
      issues.push(issue("missing_candles", "warning", { after: prior.openTime, before: candle.openTime, missing }));
    }
    candles.push(candle);
  });
  return { candles, issues };
}

function normalizeTicker(input, options = {}) {
  const source = input?.data || input || {};
  const symbol = String(source.s || source.symbol || "").toUpperCase();
  const receivedAt = Number(options.receivedAt || Date.now());
  const eventTime = Number(source.E ?? source.eventTime ?? receivedAt);
  const price = finitePositive(source.c ?? source.price);
  const high = finitePositive(source.h ?? source.high);
  const low = finitePositive(source.l ?? source.low);
  const open = finitePositive(source.o ?? source.open);
  const volume = finiteNonNegative(source.v ?? source.volume);
  const bid = finitePositive(source.b ?? source.bid);
  const ask = finitePositive(source.a ?? source.ask);
  const change = Number(source.P ?? source.change ?? 0);
  const issues = [];
  if (!SYMBOLS.includes(symbol)) issues.push(issue("invalid_symbol", "error", { symbol }));
  if (!Number.isInteger(eventTime) || eventTime <= 0 || eventTime > receivedAt + MAX_FUTURE_DRIFT_MS) {
    issues.push(issue("invalid_timestamp", "error", { eventTime, receivedAt }));
  }
  if ([price, high, low, open, volume, bid, ask].some(value => value == null) || !Number.isFinite(change)) {
    issues.push(issue("invalid_numeric_value", "error", { symbol }));
  }
  if (!issues.length && (high < Math.max(price, open, low) || low > Math.min(price, open, high) || ask < bid)) {
    issues.push(issue("invalid_ticker_range", "error", { symbol, price, high, low, open, bid, ask }));
  }
  if (issues.length) return { ticker: null, issues };
  return {
    ticker: {
      symbol, price, change, high, low, open, volume, bid, ask,
      spread: ask - bid, eventTime, receivedAt, latencyMs: Math.max(0, receivedAt - eventTime),
    },
    issues,
  };
}

module.exports = Object.freeze({ SYMBOLS, INTERVAL, INTERVAL_MS, normalizeKlines, normalizeTicker });
