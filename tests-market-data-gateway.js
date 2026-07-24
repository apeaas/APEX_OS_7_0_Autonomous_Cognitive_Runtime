"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const marketMath = require("./assets/js/market-math");
const marketQuality = require("./assets/js/market-quality");
const { SYMBOLS, INTERVAL_MS, normalizeKlines } = require("./lib/market-data/contracts");
const { MarketDataGateway } = require("./lib/market-data/gateway");

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} no coincide con ${expected}`);
}

function fixtureCandles(count = 120, start = 1_700_000_000_000) {
  return Array.from({ length: count }, (_, index) => {
    const close = index + 1;
    return {
      openTime: start + index * INTERVAL_MS,
      closeTime: start + (index + 1) * INTERVAL_MS - 1,
      open: close - 0.5,
      high: close + 1,
      low: Math.max(0.1, close - 1),
      close,
      volume: 100 + index,
    };
  });
}

function binanceRows(candles) {
  return candles.map(row => [
    row.openTime, String(row.open), String(row.high), String(row.low), String(row.close), String(row.volume), row.closeTime,
  ]);
}

function ticker(symbol, eventTime, price = 100) {
  return { s: symbol, E: eventTime, c: String(price), P: "0.5", h: String(price + 2), l: String(price - 2), o: String(price - 1), v: "1234", b: String(price - 0.1), a: String(price + 0.1) };
}

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = {};
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event, handler) {
    this.listeners[event] = handler;
  }

  emit(event, payload = {}) {
    this.listeners[event]?.(payload);
  }

  close() {
    this.emit("close", { code: 1000 });
  }
}

function fakeTimers() {
  let id = 0;
  const timeouts = new Map();
  const intervals = new Map();
  const create = (store, callback, delay) => {
    const handle = { id: ++id, callback, delay, unref() {} };
    store.set(handle.id, handle);
    return handle;
  };
  return {
    timeouts,
    intervals,
    setTimeoutImpl: (callback, delay) => create(timeouts, callback, delay),
    clearTimeoutImpl: handle => timeouts.delete(handle?.id),
    setIntervalImpl: (callback, delay) => create(intervals, callback, delay),
    clearIntervalImpl: handle => intervals.delete(handle?.id),
    runTimeout(delay) {
      const handle = [...timeouts.values()].find(item => item.delay === delay);
      assert.ok(handle, `No existe timer de ${delay}ms`);
      timeouts.delete(handle.id);
      handle.callback();
    },
  };
}

async function main() {
  const ascending = fixtureCandles(60);
  const metrics = marketMath.indicators(ascending);
  near(metrics.ema20, 50.52589689358546);
  near(metrics.ema50, 37.81256749115398);
  near(metrics.rsi14, 100);
  near(metrics.atr14, 2);
  near(metrics.volumeRatio, 1.0635451505016722);

  const contractStart = 1_700_000_000_000;
  const cleanRows = binanceRows(fixtureCandles(8, contractStart));
  const clean = normalizeKlines(cleanRows, { symbol: "BTCUSDT", interval: "15m", now: contractStart + 20 * INTERVAL_MS });
  assert.equal(clean.candles.length, 8);
  assert.equal(clean.issues.length, 0);

  const disordered = normalizeKlines([cleanRows[1], cleanRows[0], cleanRows[1], cleanRows[4]], { symbol: "BTCUSDT", interval: "15m", now: contractStart + 20 * INTERVAL_MS });
  assert.ok(disordered.issues.some(item => item.code === "out_of_order"));
  assert.ok(disordered.issues.some(item => item.code === "duplicate_candle"));
  assert.ok(disordered.issues.some(item => item.code === "missing_candles"));

  const invalidRows = cleanRows.map(row => [...row]);
  invalidRows[0][2] = "0.5";
  invalidRows[1][4] = "-1";
  const invalid = normalizeKlines(invalidRows, { symbol: "ETHUSDT", interval: "15m", now: contractStart + 20 * INTERVAL_MS });
  assert.ok(invalid.issues.some(item => item.code === "invalid_ohlcv_integrity"));
  assert.ok(invalid.issues.some(item => item.code === "invalid_numeric_value"));
  assert.ok(normalizeKlines(cleanRows, { symbol: "DOGEUSDT", interval: "15m", now: contractStart + 20 * INTERVAL_MS }).issues.some(item => item.code === "invalid_symbol"));
  assert.ok(normalizeKlines(cleanRows, { symbol: "BTCUSDT", interval: "1m", now: contractStart + 20 * INTERVAL_MS }).issues.some(item => item.code === "invalid_interval"));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-market-gateway-"));
  const cacheFile = path.join(tempDir, "market-cache.json");
  const timers = fakeTimers();
  const events = [];
  let now = contractStart + 200 * INTERVAL_MS;
  const liveCandles = fixtureCandles(120, now - 119 * INTERVAL_MS);
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => binanceRows(liveCandles) });
  const gateway = new MarketDataGateway({
    now: () => now,
    fetchImpl,
    WebSocketImpl: FakeWebSocket,
    cacheFile,
    ...timers,
    eventSink: (type, payload, severity) => events.push({ type, payload, severity }),
  });

  try {
    await gateway.start();
    assert.equal(gateway.quality.status, "recovering");
    assert.equal(FakeWebSocket.instances.length, 1);
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.emit("open");
    SYMBOLS.forEach((symbol, index) => firstSocket.emit("message", { data: JSON.stringify({ data: ticker(symbol, now, 100 + index) }) }));
    assert.equal(gateway.quality.status, "healthy");
    assert.equal(gateway.quality.trusted, true);
    assert.equal(gateway.snapshot().executionMode, "PAPER_ONLY");
    assert.equal(gateway.status().readOnly, true);

    now += 20_000;
    assert.equal(gateway.evaluateQuality("degraded_fixture").status, "degraded");
    assert.equal(gateway.quality.trusted, false);
    now += 40_000;
    assert.equal(gateway.evaluateQuality("stale_fixture").status, "stale");

    now += 1_000;
    SYMBOLS.forEach((symbol, index) => gateway.ingestTicker({ data: ticker(symbol, now, 101 + index) }, now));
    assert.equal(gateway.quality.status, "healthy");

    firstSocket.emit("close", { code: 1006 });
    assert.equal(gateway.quality.status, "recovering");
    const reconnectEvents = events.filter(event => event.type === "MARKET_GATEWAY_RECONNECT_SCHEDULED");
    assert.equal(reconnectEvents.length, 1);
    assert.equal(reconnectEvents[0].payload.delay, 500);
    firstSocket.emit("close", { code: 1006 });
    assert.equal(events.filter(event => event.type === "MARKET_GATEWAY_RECONNECT_SCHEDULED").length, 1, "No debe programar reconexiones duplicadas");

    timers.runTimeout(500);
    assert.equal(FakeWebSocket.instances.length, 2);
    const recoveredSocket = FakeWebSocket.instances[1];
    recoveredSocket.emit("open");
    now += 1_000;
    SYMBOLS.forEach((symbol, index) => recoveredSocket.emit("message", { data: JSON.stringify({ data: ticker(symbol, now, 102 + index) }) }));
    assert.equal(gateway.quality.status, "healthy");
    assert.ok(events.some(event => event.type === "MARKET_GATEWAY_QUALITY_CHANGED" && event.payload.current === "recovering"));
    assert.ok(events.some(event => event.type === "MARKET_GATEWAY_QUALITY_CHANGED" && event.payload.current === "healthy"));

    gateway.saveCache();
    assert.ok(fs.existsSync(cacheFile));
    const cached = new MarketDataGateway({ now: () => now + 60_000, cacheFile, WebSocketImpl: null });
    assert.equal(cached.loadCache(), true);
    assert.equal(cached.quality.status, "stale");
    assert.equal(cached.quality.trusted, false);
    assert.equal(cached.history("BTCUSDT").candles.length, 120);

    const healthy = { status: "healthy", trusted: true, source: "gateway" };
    const degraded = { status: "degraded", trusted: false, source: "gateway" };
    for (const action of ["think", "governance", "risk", "paper_open", "paper_close", "paper_modify", "autonomous_cycle"]) {
      assert.equal(marketQuality.gate(action, healthy).ok, true);
      assert.equal(marketQuality.gate(action, degraded).ok, false);
    }
    assert.equal(marketQuality.clientSource(degraded, 2), "gateway_wait");
    assert.equal(marketQuality.clientSource(degraded, 3), "direct_fallback");
    assert.equal(marketQuality.isTrusted({ status: "stale", trusted: true }), false);

    const autonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "config", "apex_autonomy.json"), "utf8"));
    assert.equal(autonomy.executionMode, "PAPER_ONLY");
    assert.equal(autonomy.hardLocks.liveTrading, false);
    assert.equal(autonomy.hardLocks.externalAccounts, false);
    assert.equal(autonomy.humanAutonomyCeilingPct, 5);
    const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const appSource = fs.readFileSync(path.join(__dirname, "assets", "js", "app.js"), "utf8");
    assert.ok(serverSource.includes('marketQuality.gate("autonomous_cycle"'));
    assert.ok(appSource.includes('trustedMarketGate("paper_open")'));
    assert.ok(appSource.includes("ESPERAR DATOS CONFIABLES"));
    assert.ok(appSource.includes("browser_direct_fallback"));
    assert.ok(!/liveTrading:\\s*true/.test(serverSource + appSource));
    assert.ok(!/externalAccounts:\\s*true/.test(serverSource + appSource));
  } finally {
    gateway.stop("test_complete");
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log("APEX Market Data Gateway deterministic tests: OK");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
