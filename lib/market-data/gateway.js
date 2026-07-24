"use strict";

const fs = require("node:fs");
const path = require("node:path");
const EventEmitter = require("node:events");
const { SYMBOLS, INTERVAL, INTERVAL_MS, normalizeKlines, normalizeTicker } = require("./contracts");
const marketMath = require("../../assets/js/market-math");
const marketQuality = require("../../assets/js/market-quality");

const REST_BASES = Object.freeze(["https://api.binance.com", "https://data-api.binance.vision"]);
const STREAMS = Object.freeze([
  "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker",
  "wss://stream.binance.com/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker",
  "wss://data-stream.binance.vision/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker",
]);

class MarketDataGateway extends EventEmitter {
  constructor(options = {}) {
    super();
    this.now = options.now || Date.now;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.WebSocketImpl = options.WebSocketImpl === undefined ? globalThis.WebSocket : options.WebSocketImpl;
    this.setTimeoutImpl = options.setTimeoutImpl || setTimeout;
    this.clearTimeoutImpl = options.clearTimeoutImpl || clearTimeout;
    this.setIntervalImpl = options.setIntervalImpl || setInterval;
    this.clearIntervalImpl = options.clearIntervalImpl || clearInterval;
    this.cacheFile = options.cacheFile || path.join(options.dataDir || process.cwd(), "apex-market-cache.json");
    this.restBases = options.restBases || REST_BASES;
    this.streams = options.streams || STREAMS;
    this.degradedAfterMs = Number(options.degradedAfterMs || 15_000);
    this.staleAfterMs = Number(options.staleAfterMs || 45_000);
    this.historyRefreshMs = Number(options.historyRefreshMs || 5 * 60_000);
    this.eventSink = typeof options.eventSink === "function" ? options.eventSink : () => {};
    this.running = false;
    this.socket = null;
    this.socketConnected = false;
    this.streamIndex = 0;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.healthTimer = null;
    this.historyTimer = null;
    this.cacheTimer = null;
    this.sequence = 0;
    this.histories = Object.fromEntries(SYMBOLS.map(symbol => [symbol, []]));
    this.tickers = {};
    this.symbolIssues = Object.fromEntries(SYMBOLS.map(symbol => [symbol, []]));
    this.quality = marketQuality.normalize({ status: "disconnected", source: "gateway", reason: "not_started" });
  }

  async start() {
    if (this.running) return this.snapshot();
    this.running = true;
    this.loadCache();
    this.transition("recovering", "startup");
    await this.refreshHistory();
    this.connect();
    this.healthTimer = this.setIntervalImpl(() => this.evaluateQuality("health_check"), 1000);
    this.historyTimer = this.setIntervalImpl(() => this.refreshHistory().catch(error => this.recordIssue("history_refresh_failed", error.message)), this.historyRefreshMs);
    this.healthTimer?.unref?.();
    this.historyTimer?.unref?.();
    return this.snapshot();
  }

  stop(reason = "stopped") {
    this.running = false;
    if (this.reconnectTimer) this.clearTimeoutImpl(this.reconnectTimer);
    if (this.healthTimer) this.clearIntervalImpl(this.healthTimer);
    if (this.historyTimer) this.clearIntervalImpl(this.historyTimer);
    if (this.cacheTimer) this.clearTimeoutImpl(this.cacheTimer);
    this.reconnectTimer = this.healthTimer = this.historyTimer = this.cacheTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.socketConnected = false;
    try { socket?.close?.(); } catch {}
    this.transition("disconnected", reason);
  }

  async refreshHistory() {
    const results = await Promise.all(SYMBOLS.map(symbol => this.fetchSymbolHistory(symbol)));
    const successful = results.filter(result => result.ok).length;
    if (successful) this.scheduleCache();
    this.evaluateQuality(successful === SYMBOLS.length ? "history_refreshed" : "history_partial");
    return { ok: successful > 0, successful, total: SYMBOLS.length, results };
  }

  async fetchSymbolHistory(symbol) {
    let lastError = null;
    for (const base of this.restBases) {
      try {
        if (typeof this.fetchImpl !== "function") throw new Error("fetch_unavailable");
        const controller = new AbortController();
        const timeout = this.setTimeoutImpl(() => controller.abort(), 8000);
        timeout?.unref?.();
        const url = `${base}/api/v3/klines?symbol=${symbol}&interval=${INTERVAL}&limit=120`;
        const response = await this.fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        this.clearTimeoutImpl(timeout);
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const rows = await response.json();
        const normalized = normalizeKlines(rows, { symbol, interval: INTERVAL, now: this.now() });
        this.symbolIssues[symbol] = normalized.issues.slice(-25);
        if (!normalized.candles.length) throw new Error("no_valid_candles");
        this.histories[symbol] = normalized.candles.slice(-120);
        return { ok: true, symbol, source: base, candles: this.histories[symbol].length, issues: normalized.issues };
      } catch (error) {
        lastError = error;
      }
    }
    this.recordIssue("history_unavailable", lastError?.message || "unknown", symbol);
    return { ok: false, symbol, error: lastError?.message || "unknown" };
  }

  connect() {
    if (!this.running || this.socket || this.reconnectTimer) return false;
    if (typeof this.WebSocketImpl !== "function") {
      this.recordIssue("websocket_unavailable", "Node runtime does not expose WebSocket");
      this.transition(this.hasAnyData() ? "degraded" : "disconnected", "websocket_unavailable");
      return false;
    }
    this.transition("recovering", this.reconnectAttempts ? "reconnecting" : "connecting");
    try {
      const url = this.streams[this.streamIndex % this.streams.length];
      const socket = new this.WebSocketImpl(url);
      this.socket = socket;
      this.bindSocket(socket);
      return true;
    } catch (error) {
      this.socket = null;
      this.handleSocketClose(error);
      return false;
    }
  }

  bindSocket(socket) {
    const bind = (event, handler) => {
      if (typeof socket.addEventListener === "function") socket.addEventListener(event, handler);
      else socket[`on${event}`] = handler;
    };
    bind("open", () => this.handleSocketOpen(socket));
    bind("message", event => this.handleSocketMessage(event?.data ?? event));
    bind("error", error => this.handleSocketError(error));
    bind("close", event => this.handleSocketClose(event));
  }

  handleSocketOpen(socket = this.socket) {
    if (socket !== this.socket || !this.running) return;
    this.socketConnected = true;
    this.reconnectAttempts = 0;
    this.transition("recovering", "socket_open_recovering_history");
    this.refreshHistory().catch(error => this.recordIssue("gap_recovery_failed", error.message));
  }

  handleSocketMessage(raw) {
    let payload;
    try { payload = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(String(raw)); }
    catch {
      this.recordIssue("invalid_websocket_payload", "json_parse_failed");
      this.evaluateQuality("invalid_payload");
      return false;
    }
    return this.ingestTicker(payload);
  }

  ingestTicker(payload, receivedAt = this.now()) {
    const normalized = normalizeTicker(payload, { receivedAt });
    if (!normalized.ticker) {
      normalized.issues.forEach(item => this.recordIssue(item.code, item.severity, item.symbol));
      this.evaluateQuality("invalid_ticker");
      return false;
    }
    const ticker = normalized.ticker;
    const previous = this.tickers[ticker.symbol];
    if (previous && ticker.eventTime < previous.eventTime) {
      this.recordIssue("out_of_order_ticker", `${ticker.eventTime}<${previous.eventTime}`, ticker.symbol);
      this.evaluateQuality("out_of_order_ticker");
      return false;
    }
    if (previous && ticker.eventTime === previous.eventTime && ticker.price === previous.price) {
      this.recordIssue("duplicate_ticker", String(ticker.eventTime), ticker.symbol);
      return false;
    }
    this.sequence += 1;
    this.tickers[ticker.symbol] = { ...ticker, sequence: this.sequence };
    this.symbolIssues[ticker.symbol] = (this.symbolIssues[ticker.symbol] || []).filter(item => item.code !== "ticker_missing").slice(-25);
    this.scheduleCache();
    this.evaluateQuality("ticker_received");
    this.emit("ticker", this.publicTicker(ticker.symbol));
    return true;
  }

  handleSocketError(error) {
    this.recordIssue("websocket_error", error?.message || "socket_error");
  }

  handleSocketClose(event) {
    if (!this.running) return;
    this.socket = null;
    this.socketConnected = false;
    this.transition(this.hasAnyData() ? "recovering" : "disconnected", "socket_closed");
    this.scheduleReconnect(event?.code || "closed");
  }

  scheduleReconnect(reason = "closed") {
    if (!this.running || this.reconnectTimer) return false;
    this.reconnectAttempts += 1;
    this.streamIndex = (this.streamIndex + 1) % this.streams.length;
    const delay = Math.min(30_000, 500 * (2 ** Math.min(this.reconnectAttempts - 1, 6)));
    this.eventSink("MARKET_GATEWAY_RECONNECT_SCHEDULED", { attempt: this.reconnectAttempts, delay, reason, streamIndex: this.streamIndex }, "warning");
    this.reconnectTimer = this.setTimeoutImpl(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectTimer?.unref?.();
    return true;
  }

  evaluateQuality(reason = "evaluation") {
    const now = this.now();
    const symbolQuality = {};
    const issues = [];
    let newest = 0;
    let oldestAge = 0;
    let maxLatency = 0;
    for (const symbol of SYMBOLS) {
      const ticker = this.tickers[symbol];
      const history = this.histories[symbol] || [];
      const ageMs = ticker ? Math.max(0, now - ticker.receivedAt) : null;
      newest = Math.max(newest, Number(ticker?.receivedAt || 0));
      oldestAge = Math.max(oldestAge, ageMs == null ? Infinity : ageMs);
      maxLatency = Math.max(maxLatency, Number(ticker?.latencyMs || 0));
      const symbolIssues = [...(this.symbolIssues[symbol] || [])];
      if (!ticker) symbolIssues.push({ code: "ticker_missing", severity: "error", symbol });
      if (!history.length) symbolIssues.push({ code: "history_missing", severity: "error", symbol });
      const health = !ticker || !history.length ? "disconnected" : ageMs > this.staleAfterMs ? "stale" : ageMs > this.degradedAfterMs ? "degraded" : "healthy";
      symbolQuality[symbol] = { status: health, ageMs, latencyMs: ticker?.latencyMs ?? null, lastDataAt: ticker ? new Date(ticker.receivedAt).toISOString() : null, candleCount: history.length, issues: symbolIssues.slice(-25) };
      issues.push(...symbolIssues.map(item => ({ ...item, symbol: item.symbol || symbol })));
    }

    let status;
    if (!this.socketConnected && !this.hasAnyData()) status = "disconnected";
    else if (!this.socketConnected) status = oldestAge > this.staleAfterMs ? "stale" : "recovering";
    else if (!Number.isFinite(oldestAge)) status = "recovering";
    else if (oldestAge > this.staleAfterMs) status = "stale";
    else if (oldestAge > this.degradedAfterMs || issues.some(item => ["error", "warning"].includes(item.severity))) status = "degraded";
    else status = "healthy";

    this.transition(status, reason, {
      lastDataAt: newest ? new Date(newest).toISOString() : null,
      ageMs: Number.isFinite(oldestAge) ? oldestAge : null,
      latencyMs: maxLatency,
      sequence: this.sequence,
      issues: issues.slice(-50),
      symbols: symbolQuality,
    });
    return this.quality;
  }

  transition(status, reason, details = {}) {
    const previous = this.quality;
    const next = marketQuality.normalize({ ...details, status, source: "gateway", reason, trusted: status === "healthy" });
    this.quality = next;
    if (previous.status !== next.status || previous.trusted !== next.trusted) {
      const severity = next.status === "healthy" ? "success" : ["degraded", "recovering"].includes(next.status) ? "warning" : "error";
      this.eventSink("MARKET_GATEWAY_QUALITY_CHANGED", { previous: previous.status, current: next.status, reason, trusted: next.trusted, ageMs: next.ageMs, latencyMs: next.latencyMs }, severity);
      this.emit("quality", next);
    }
    return next;
  }

  recordIssue(code, detail, symbol = null) {
    const target = symbol && SYMBOLS.includes(symbol) ? symbol : null;
    const entry = { code, severity: code.includes("invalid") ? "error" : "warning", detail: String(detail || "").slice(0, 300), at: new Date(this.now()).toISOString(), ...(target ? { symbol: target } : {}) };
    if (target) this.symbolIssues[target] = [...(this.symbolIssues[target] || []), entry].slice(-25);
    this.eventSink("MARKET_GATEWAY_ISSUE", entry, entry.severity);
    return entry;
  }

  hasAnyData() {
    return Object.keys(this.tickers).length > 0 || SYMBOLS.some(symbol => (this.histories[symbol] || []).length > 0);
  }

  publicTicker(symbol) {
    const ticker = this.tickers[symbol];
    if (!ticker) return null;
    return {
      symbol,
      price: ticker.price,
      change: ticker.change,
      high: ticker.high,
      low: ticker.low,
      vol: ticker.volume,
      bid: ticker.bid,
      ask: ticker.ask,
      open: ticker.open,
      spread: ticker.spread,
      ts: ticker.receivedAt,
      eventTime: ticker.eventTime,
      latencyMs: ticker.latencyMs,
      sequence: ticker.sequence,
    };
  }

  history(symbol) {
    if (!SYMBOLS.includes(symbol)) return null;
    const candles = (this.histories[symbol] || []).map(candle => ({ ...candle }));
    return { symbol, interval: INTERVAL, candles, indicators: marketMath.indicators(candles), quality: this.quality.symbols?.[symbol] || null };
  }

  snapshot() {
    return {
      contractVersion: "1.0.0",
      source: "binance_public_read_only",
      executionMode: "PAPER_ONLY",
      symbols: Object.fromEntries(SYMBOLS.map(symbol => [symbol, { ticker: this.publicTicker(symbol), indicators: marketMath.indicators(this.histories[symbol] || []) }])),
      quality: this.quality,
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  status() {
    return {
      ok: true,
      service: "APEX Market Data Gateway",
      contractVersion: "1.0.0",
      readOnly: true,
      provider: "Binance Public",
      symbols: SYMBOLS,
      interval: INTERVAL,
      quality: this.quality,
      reconnect: { attempts: this.reconnectAttempts, scheduled: Boolean(this.reconnectTimer), streamIndex: this.streamIndex },
      cache: { file: path.basename(this.cacheFile), loaded: this.hasAnyData() },
      hardLocks: { liveTrading: false, externalAccounts: false, brokerExecution: false, walletSigning: false },
    };
  }

  scheduleCache() {
    if (this.cacheTimer) return;
    this.cacheTimer = this.setTimeoutImpl(() => {
      this.cacheTimer = null;
      this.saveCache();
    }, 250);
    this.cacheTimer?.unref?.();
  }

  saveCache() {
    const payload = {
      contractVersion: "1.0.0",
      savedAt: new Date(this.now()).toISOString(),
      tickers: this.tickers,
      histories: this.histories,
      sequence: this.sequence,
    };
    fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
    const temporary = `${this.cacheFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(payload), "utf8");
    fs.renameSync(temporary, this.cacheFile);
    return payload;
  }

  loadCache() {
    try {
      const payload = JSON.parse(fs.readFileSync(this.cacheFile, "utf8"));
      const now = this.now();
      const histories = {};
      const cacheIssues = [];
      for (const symbol of SYMBOLS) {
        const normalized = normalizeKlines(payload?.histories?.[symbol] || [], { symbol, interval: INTERVAL, now });
        histories[symbol] = normalized.candles.slice(-120);
        cacheIssues.push(...normalized.issues.map(item => ({ ...item, symbol })));
      }
      const tickers = {};
      for (const symbol of SYMBOLS) {
        const cached = payload?.tickers?.[symbol];
        if (!cached) continue;
        const normalized = normalizeTicker({
          s: symbol, c: cached.price, P: cached.change, h: cached.high, l: cached.low, o: cached.open,
          v: cached.volume, b: cached.bid, a: cached.ask, E: cached.eventTime,
        }, { receivedAt: Number(cached.receivedAt || Date.parse(payload.savedAt) || now) });
        if (normalized.ticker) tickers[symbol] = { ...normalized.ticker, sequence: Number(cached.sequence || 0) };
      }
      this.histories = histories;
      this.tickers = tickers;
      this.sequence = Number(payload.sequence || 0);
      this.quality = marketQuality.normalize({
        status: this.hasAnyData() ? "stale" : "disconnected",
        source: "cache",
        reason: this.hasAnyData() ? "cache_loaded_untrusted" : "cache_empty",
        trusted: false,
        issues: cacheIssues,
      });
      this.eventSink("MARKET_GATEWAY_CACHE_LOADED", { savedAt: payload.savedAt, symbols: Object.keys(tickers), trusted: false }, "info");
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = Object.freeze({ MarketDataGateway, REST_BASES, STREAMS, INTERVAL_MS });
