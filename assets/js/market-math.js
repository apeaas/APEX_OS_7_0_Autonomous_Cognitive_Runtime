"use strict";

(function exposeMarketMath(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.APEX_MARKET_MATH = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function finiteSeries(values) {
    return (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  }

  function average(values) {
    const series = finiteSeries(values);
    return series.length ? series.reduce((sum, value) => sum + value, 0) / series.length : 0;
  }

  function ema(values, period) {
    const safePeriod = Math.max(1, Math.trunc(Number(period) || 1));
    const series = finiteSeries(values);
    if (!series.length) return 0;
    const slice = series.slice(-Math.max(safePeriod * 3, safePeriod));
    const smoothing = 2 / (safePeriod + 1);
    let result = slice[0];
    for (let index = 1; index < slice.length; index += 1) {
      result = slice[index] * smoothing + result * (1 - smoothing);
    }
    return result;
  }

  function rsi(values, period = 14) {
    const safePeriod = Math.max(1, Math.trunc(Number(period) || 14));
    const series = finiteSeries(values);
    if (series.length < 2) return 50;
    const slice = series.slice(-(safePeriod + 1));
    let gains = 0;
    let losses = 0;
    for (let index = 1; index < slice.length; index += 1) {
      const difference = slice[index] - slice[index - 1];
      if (difference >= 0) gains += difference;
      else losses -= difference;
    }
    const observations = Math.max(slice.length - 1, 1);
    const averageGain = gains / observations;
    const averageLoss = losses / observations;
    if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
    return 100 - (100 / (1 + averageGain / averageLoss));
  }

  function atr(candles, period = 14) {
    const safePeriod = Math.max(1, Math.trunc(Number(period) || 14));
    const rows = Array.isArray(candles) ? candles : [];
    if (rows.length < 2) return 0;
    const trueRanges = [];
    for (let index = 1; index < rows.length; index += 1) {
      const candle = rows[index] || {};
      const previousClose = Number(rows[index - 1]?.close);
      const high = Number(candle.high);
      const low = Number(candle.low);
      if (![previousClose, high, low].every(Number.isFinite)) continue;
      trueRanges.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
    }
    return average(trueRanges.slice(-safePeriod));
  }

  function relativeVolume(candles, period = 20) {
    const safePeriod = Math.max(1, Math.trunc(Number(period) || 20));
    const rows = Array.isArray(candles) ? candles : [];
    if (!rows.length) return 0;
    const volumes = rows.slice(-safePeriod).map(row => Number(row?.volume)).filter(Number.isFinite);
    const current = Number(rows[rows.length - 1]?.volume);
    const baseline = average(volumes);
    if (!Number.isFinite(current) || baseline <= 0) return 0;
    return current / baseline;
  }

  function indicators(candles) {
    const rows = Array.isArray(candles) ? candles : [];
    const closes = rows.map(row => Number(row?.close)).filter(Number.isFinite);
    const last = closes[closes.length - 1] || 0;
    const atr14 = atr(rows, 14);
    return {
      ema20: ema(closes, 20),
      ema50: ema(closes, 50),
      rsi14: rsi(closes, 14),
      atr14,
      atrPct: last > 0 ? (atr14 / last) * 100 : 0,
      volumeRatio: relativeVolume(rows, 20),
    };
  }

  return Object.freeze({ average, ema, rsi, atr, relativeVolume, indicators });
});
