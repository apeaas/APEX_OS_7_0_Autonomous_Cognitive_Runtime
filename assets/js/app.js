
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const SYMBOLS = {
    BTCUSDT: { label: "BTC/USDT", short: "BTC", color: "#f0bd67" },
    ETHUSDT: { label: "ETH/USDT", short: "ETH", color: "#7d9bff" },
    SOLUSDT: { label: "SOL/USDT", short: "SOL", color: "#58d9a3" }
  };
  const STREAMS = [
    "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker",
    "wss://stream.binance.com/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker",
    "wss://data-stream.binance.vision/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker"
  ];
  const marketMath = window.APEX_MARKET_MATH;
  const marketQuality = window.APEX_MARKET_QUALITY;
  const eventBus = window.APEX_EVENT_BUS || null;
  const emitEvent = (type, payload = {}, meta = {}) => {
    try { return eventBus?.emit(type, payload, meta) || null; }
    catch (error) { console.warn("APEX event emission failed", error); return null; }
  };

  const state = {
    feedStatus: "Recuperando",
    feedQuality: marketQuality?.normalize?.({ status: "recovering", source: "gateway", reason: "startup" }) || { status: "recovering", trusted: false },
    marketSource: "gateway_wait",
    gatewayFailures: 0,
    gatewayPoll: null,
    reconnectTimer: null,
    directFallbackActive: false,
    symbols: {},
    marketHistory: {},
    candles: {},
    density: load("apex-density", "comfortable"),
    focusSymbol: "ETHUSDT",
    decision: null,
    strategies: {},
    watchlist: load("apex-watchlist", []),
    ignoredUntil: load("apex-ignoredUntil", {}),
    portfolio: load("apex-portfolio", {
      equity: 25000,
      cash: 25000,
      realized: 0,
      positions: [],
      closedTrades: []
    }),
    bots: load("apex-bots", [
      { id: "sentinel", name: "Sentinela", desc: "Monitoreo y alertas", active: true, last: "Supervisando mercado" },
      { id: "spot-hunter", name: "Spot Hunter", desc: "Setups spot con aprobación", active: true, last: "Escaneando oportunidades" },
      { id: "sandbox", name: "Sandbox", desc: "Pruebas experimentales", active: false, last: "Pausado" }
    ]),
    socket: null,
    streamIndex: 0,
    ticketValidated: false,
    ticketExecuted: false,
    evidenceSymbol: null
  };

  const els = {
    currentDate: $("#currentDate"), currentTime: $("#currentTime"),
    feedStatus: $("#feedStatus"), watchCount: $("#watchCount"),
    marketCards: $("#marketCards"), positionsList: $("#positionsList"),
    activityLog: $("#activityLog"), marketModePill: $("#marketModePill"),
    decisionTitle: $("#decisionTitle"), decisionText: $("#decisionText"),
    focusAsset: $("#focusAsset"), focusConfidence: $("#focusConfidence"),
    focusRisk: $("#focusRisk"), focusValidity: $("#focusValidity"),
    coreVisual: $("#coreVisual"), coreMode: $("#coreMode"), coreCenterText: $("#coreCenterText"),
    engineOpportunity: $("#engineOpportunity"), engineRisk: $("#engineRisk"), engineStrategy: $("#engineStrategy"),
    enginePortfolio: $("#enginePortfolio"), engineBots: $("#engineBots"), engineFeed: $("#engineFeed"),
    scalpAsset: $("#scalpAsset"), intradayAsset: $("#intradayAsset"), swingAsset: $("#swingAsset"),
    scalpBody: $("#scalpBody"), intradayBody: $("#intradayBody"), swingBody: $("#swingBody"),
    equityValue: $("#equityValue"), cashValue: $("#cashValue"), exposureValue: $("#exposureValue"),
    realizedValue: $("#realizedValue"), winRateValue: $("#winRateValue"), botsList: $("#botsList"),
    chatMessages: $("#chatMessages"), chatInput: $("#chatInput"), chatStatus: $("#chatStatus"),
    evidenceModal: $("#evidenceModal"), evidenceTitle: $("#evidenceTitle"), evidenceGrid: $("#evidenceGrid"),
    tradeDrawer: $("#tradeDrawer"), drawerAsset: $("#drawerAsset"),
    capitalInput: $("#capitalInput"), entryInput: $("#entryInput"), stopInput: $("#stopInput"), targetInput: $("#targetInput"),
    ticketResult: $("#ticketResult"), validateTradeBtn: $("#validateTradeBtn")
  };

  const strategyMap = {
    scalp: { holder: els.scalpBody, asset: els.scalpAsset, label: "scalp" },
    intraday: { holder: els.intradayBody, asset: els.intradayAsset, label: "intraday" },
    swing: { holder: els.swingBody, asset: els.swingAsset, label: "swing" }
  };

  init();

  function init() {
    updateClock();
    setInterval(updateClock, 1000);
    applyDensity(state.density);
    renderChatSeed();
    bindUI();
    renderBots();
    renderPortfolio();
    hydrateMarketHistory().finally(connectMarketDataGateway);
    setInterval(simulateBotsAndChecks, 6000);
    setInterval(checkOpenPositions, 3000);
    if (state.portfolio.positions.length) log("Sistema", "Restauración de posiciones paper", "OK");
    emitEvent("APPLICATION_READY", {
      version: "7.0.0",
      feedMode: "REAL_DATA",
      executionMode: "PAPER_ONLY",
      restoredPositions: state.portfolio.positions.length
    }, { source: "APEX_CORE", category: "system", severity: "success" });
  }

  function bindUI() {
    $all(".nav-btn").forEach(btn => btn.addEventListener("click", () => {
      $all(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const section = $("#" + btn.dataset.focus);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    $("#refreshDecisionBtn").addEventListener("click", () => { refreshDecision(); log("APEX", "Lectura general actualizada", "SCAN"); });
    $("#openTicketBtn").addEventListener("click", () => openTicketFor(state.focusSymbol));
    $("#askApexBtn").addEventListener("click", () => {
      sendApexQuestion(`¿Qué ves en ${SYMBOLS[state.focusSymbol].short}?`);
      $(".context-panel")?.scrollIntoView({ behavior: "smooth" });
    });
    $("#openEvidenceBtn").addEventListener("click", () => openEvidence(state.focusSymbol));
    $("#closeEvidenceBtn").addEventListener("click", closeEvidence);
    $("#evidenceTicketBtn").addEventListener("click", () => { closeEvidence(); openTicketFor(state.evidenceSymbol || state.focusSymbol); });
    $("#evidenceAskBtn").addEventListener("click", () => {
      const sym = state.evidenceSymbol || state.focusSymbol;
      closeEvidence(); sendApexQuestion(`Explicame el setup de ${SYMBOLS[sym].short}`);
    });

    $("#closeDrawerBtn").addEventListener("click", closeDrawer);
    $("#validateTradeBtn").addEventListener("click", validateOrExecuteTicket);
    [els.capitalInput, els.entryInput, els.stopInput, els.targetInput].forEach(i => i.addEventListener("input", resetTicketValidation));
    $all(".strategy-ticket-btn").forEach(btn => btn.addEventListener("click", () => {
      const s = state.strategies[btn.dataset.strategy];
      if (s) openTicketWithPlan(s.symbol, s.entry, s.stop, s.target);
    }));

    $("#sendChatBtn").addEventListener("click", handleSendChat);
    $("#chatInput").addEventListener("keydown", e => { if (e.key === "Enter") handleSendChat(); });

    $("#resetPaperBtn").addEventListener("click", resetPaperPortfolio);
    $("#exportCsvBtn").addEventListener("click", exportClosedTradesCsv);

    $all("[data-density]").forEach(btn => btn.addEventListener("click", () => applyDensity(btn.dataset.density)));

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeEvidence(); closeDrawer(); }
    });
  }

  function updateClock() {
    const now = new Date();
    els.currentDate.textContent = now.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    els.currentTime.textContent = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  async function connectMarketDataGateway() {
    await pollMarketDataGateway();
    if (!state.gatewayPoll) state.gatewayPoll = setInterval(pollMarketDataGateway, 1000);
  }

  async function pollMarketDataGateway() {
    try {
      const response = await fetch("/api/market/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const quality = marketQuality?.normalize?.(payload.quality) || payload.quality || { status: "disconnected", trusted: false };
      state.gatewayFailures = 0;
      applyFeedQuality(quality);
      Object.entries(payload.symbols || {}).forEach(([symbol, entry]) => {
        if (!SYMBOLS[symbol] || !entry?.ticker) return;
        state.symbols[symbol] = { ...entry.ticker };
        if (!state.marketHistory[symbol]) state.marketHistory[symbol] = [];
        const price = Number(entry.ticker.price);
        const last = state.marketHistory[symbol][state.marketHistory[symbol].length - 1];
        if (Number.isFinite(price) && price !== last) state.marketHistory[symbol].push(price);
        if (state.marketHistory[symbol].length > 120) state.marketHistory[symbol].shift();
      });
      state.marketSource = marketQuality?.clientSource?.(quality, state.gatewayFailures) || (quality.trusted ? "gateway" : "gateway_wait");
      if (state.marketSource === "gateway") stopDirectFallback();
      else if (state.marketSource === "direct_fallback") startDirectFallback();
      refreshAll();
    } catch (error) {
      state.gatewayFailures += 1;
      const quality = {
        status: state.gatewayFailures >= 3 ? "disconnected" : "recovering",
        trusted: false,
        source: "gateway",
        reason: "gateway_unreachable",
        issues: [{ code: "gateway_unreachable", detail: error.message }]
      };
      applyFeedQuality(quality);
      state.marketSource = marketQuality?.clientSource?.(quality, state.gatewayFailures) || (state.gatewayFailures >= 3 ? "direct_fallback" : "gateway_wait");
      if (state.marketSource === "direct_fallback") startDirectFallback();
    }
  }

  function applyFeedQuality(input) {
    const quality = marketQuality?.normalize?.(input) || input || { status: "disconnected", trusted: false };
    const previous = state.feedQuality?.status;
    state.feedQuality = quality;
    const label = marketQuality?.label?.(quality) || String(quality.status || "disconnected").toUpperCase();
    setFeedStatus(label, quality.trusted ? "live" : "warn");
    eventBus?.emitIfChanged("market-feed-quality", `${quality.status}:${quality.trusted}`, "DATA_FEED_QUALITY_CHANGED", {
      status: quality.status,
      trusted: quality.trusted,
      source: quality.source,
      reason: quality.reason,
      ageMs: quality.ageMs,
      latencyMs: quality.latencyMs,
      previous
    }, { source: "MARKET_GATEWAY", category: "market", severity: quality.trusted ? "success" : ["recovering", "degraded"].includes(quality.status) ? "warning" : "error" });
  }

  function startDirectFallback() {
    if (state.directFallbackActive) return;
    state.directFallbackActive = true;
    connectDirectFallbackStream();
  }

  function stopDirectFallback() {
    state.directFallbackActive = false;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    const socket = state.socket;
    state.socket = null;
    try { socket?.close?.(); } catch {}
  }

  function connectDirectFallbackStream() {
    if (!state.directFallbackActive || state.socket) return;
    applyFeedQuality({ status: "recovering", trusted: false, source: "browser_direct_fallback", reason: `connecting_stream_${state.streamIndex + 1}` });
    try {
      state.socket = new WebSocket(STREAMS[state.streamIndex]);
      state.socket.onopen = () => {
        applyFeedQuality({ status: "degraded", trusted: false, source: "browser_direct_fallback", reason: "gateway_unavailable_direct_feed_visible" });
        log("Feed", "Conexión Binance establecida", "LIVE");
      };
      state.socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        const data = payload.data || payload;
        if (!data.s || !SYMBOLS[data.s]) return;
        const sym = data.s;
        const price = Number(data.c), change = Number(data.P), high = Number(data.h), low = Number(data.l),
              vol = Number(data.v), bid = Number(data.b), ask = Number(data.a), open = Number(data.o);
        if (![price, high, low, vol, bid, ask, open].every(Number.isFinite) || !(high >= price && price >= low && ask >= bid)) return;
        state.symbols[sym] = { price, change, high, low, vol, bid, ask, open, spread: ask - bid, ts: Date.now(), source: "browser_direct_fallback" };
        if (!state.marketHistory[sym]) state.marketHistory[sym] = [];
        state.marketHistory[sym].push(price);
        if (state.marketHistory[sym].length > 80) state.marketHistory[sym].shift();
        refreshAll();
      };
      state.socket.onerror = () => attemptReconnect("fallback_stream_error");
      state.socket.onclose = () => attemptReconnect("fallback_stream_closed");
    } catch (err) {
      attemptReconnect("Falló conexión");
    }
  }

  function attemptReconnect(reason) {
    if (!state.directFallbackActive || state.reconnectTimer) return;
    state.socket = null;
    applyFeedQuality({ status: "disconnected", trusted: false, source: "browser_direct_fallback", reason });
    state.streamIndex = (state.streamIndex + 1) % STREAMS.length;
    const delay = Math.min(30_000, 1000 * (2 ** Math.min(state.streamIndex, 4)));
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connectDirectFallbackStream();
    }, delay);
  }

  function setFeedStatus(text, mode) {
    state.feedStatus = text;
    els.feedStatus.textContent = text;
    els.engineFeed.textContent = text.includes("LIVE") ? "Sync" : text.includes("Reconectando") ? "Retry" : "Delay";
    els.marketModePill.textContent = text.includes("LIVE") ? "LIVE MARKET DATA" : "FEED " + text.toUpperCase();
    els.coreMode.textContent = text.includes("LIVE") ? "READY" : "DELAY";
    els.coreVisual.classList.remove("live", "warning", "alert");
    els.coreVisual.classList.add(text.includes("LIVE") ? "live" : text.includes("Reconectando") ? "warning" : "alert");
    const feedEventState = text.includes("LIVE") ? "LIVE" : text.includes("Reconectando") || text.includes("Error") || text.includes("Falló") ? "RECONNECTING" : "CONNECTING";
    eventBus?.emitIfChanged("feed-status", feedEventState, "DATA_FEED_STATUS_CHANGED", {
      status: text,
      state: feedEventState,
      live: feedEventState === "LIVE",
      streamIndex: state.streamIndex
    }, { source: "DATA_PIPELINE", category: "market", severity: feedEventState === "LIVE" ? "success" : feedEventState === "RECONNECTING" ? "warning" : "info" });
  }

  function refreshAll() {
    if (!Object.keys(state.symbols).length) return;
    computeStrategies();
    refreshDecision();
    renderMarket();
    renderStrategies();
    renderPortfolio();
    renderBots();
    persist();
  }

  function renderMarket() {
    els.marketCards.innerHTML = "";
    Object.keys(SYMBOLS).forEach(sym => {
      const d = state.symbols[sym];
      const card = document.createElement("div");
      card.className = "market-card";
      const trend = analyzeSymbol(sym).trendLabel;
      card.innerHTML = `
        <div class="market-main">
          <strong>${SYMBOLS[sym].label}</strong>
          <span>Precio ${fmtPrice(d?.price)} · Cambio 24h <b class="${d?.change>=0?'good':'bad'}">${fmtPct(d?.change)}</b></span>
        </div>
        <div class="market-meta">
          <div><span>Spread</span><strong>${fmtPrice(d?.spread || 0)}</strong></div>
          <div><span>Tendencia</span><strong>${trend}</strong></div>
          <div><span>Volumen</span><strong>${compact(d?.vol || 0)}</strong></div>
          <div><span>Watch</span><strong>${state.watchlist.includes(sym) ? "Sí" : "No"}</strong></div>
        </div>
        <div class="indicator-strip">
          ${indicator("EMA20", fmtPrice(analyzeSymbol(sym).ema20))}
          ${indicator("EMA50", fmtPrice(analyzeSymbol(sym).ema50))}
          ${indicator("RSI14", analyzeSymbol(sym).rsi14.toFixed(1))}
          ${indicator("ATR", analyzeSymbol(sym).atrPct.toFixed(2) + "%")}
          ${indicator("Score", analyzeSymbol(sym).confidence + "%")}
        </div>
        <div class="score-line"><i style="width:${analyzeSymbol(sym).confidence}%"></i></div>
        <div class="data-freshness">Régimen ${analyzeSymbol(sym).regime} · Volumen x${analyzeSymbol(sym).volumeRatio.toFixed(2)}</div>
        <div class="market-actions">
          <button class="mini-btn" data-action="ticket" data-symbol="${sym}">Ticket</button>
          <button class="mini-btn" data-action="evidence" data-symbol="${sym}">Evidencia</button>
          <button class="mini-btn" data-action="watch" data-symbol="${sym}">${state.watchlist.includes(sym) ? "Siguiendo" : "Seguir"}</button>
        </div>
      `;
      els.marketCards.appendChild(card);
    });
    $all("[data-action='ticket']").forEach(b => b.onclick = () => openTicketFor(b.dataset.symbol));
    $all("[data-action='evidence']").forEach(b => b.onclick = () => openEvidence(b.dataset.symbol));
    $all("[data-action='watch']").forEach(b => b.onclick = () => toggleWatch(b.dataset.symbol));
    els.watchCount.textContent = state.watchlist.length;
  }

  function analyzeSymbol(sym) {
    const d = state.symbols[sym];
    const feedTrusted = Boolean(marketQuality?.isTrusted?.(state.feedQuality));
    const candles = state.candles[sym] || [];
    const closes = candles.length ? candles.map(c => c.close) : (state.marketHistory[sym] || []);
    const current = d?.price || closes[closes.length - 1] || 0;
    const series = closes.length ? [...closes.slice(-120), current] : [current];
    const ema20 = ema(series, 20);
    const ema50 = ema(series, 50);
    const rsi14 = rsi(series, 14);
    const atr14 = candles.length ? atr(candles.slice(-60), 14) : Math.abs((d?.high || current) - (d?.low || current)) / 14;
    const recentVol = candles.slice(-20).map(c => c.volume);
    const volumeNow = candles[candles.length - 1]?.volume || d?.vol || 0;
    const volumeAvg = average(recentVol) || volumeNow || 1;
    const volumeRatio = volumeNow / Math.max(volumeAvg, 1e-9);
    const first = series[Math.max(0, series.length - 20)] || current;
    const momentum = first ? ((current - first) / first) * 100 : 0;
    const positionRange = d ? ((d.price - d.low) / Math.max(d.high - d.low, 0.00001)) * 100 : 50;
    const atrPct = current ? (atr14 / current) * 100 : 0;

    let trend = "Neutral";
    if (current > ema20 && ema20 > ema50) trend = "Alcista";
    else if (current < ema20 && ema20 < ema50) trend = "Bajista";

    const regime = atrPct > 2.2 ? "Volátil" : Math.abs(momentum) < .25 ? "Lateral" : "Tendencial";
    const risk = atrPct > 2.5 || Math.abs(d?.change || 0) > 5 ? "Alto" : atrPct > 1.25 || Math.abs(d?.change || 0) > 2.5 ? "Moderado" : "Normal";

    const trendScore = trend === "Alcista" ? 88 : trend === "Bajista" ? 32 : 55;
    const momentumScore = clamp(Math.round(50 + momentum * 15), 15, 90);
    const rsiScore = rsi14 >= 45 && rsi14 <= 65 ? 82 : rsi14 > 70 || rsi14 < 30 ? 38 : 64;
    const liquidityScore = clamp(Math.round(65 + Math.min(volumeRatio, 2) * 14), 50, 94);
    const riskScore = risk === "Normal" ? 86 : risk === "Moderado" ? 62 : 35;
    let confidence = clamp(Math.round(trendScore*.28 + momentumScore*.18 + rsiScore*.18 + liquidityScore*.16 + riskScore*.20), 35, 94);

    let recommendation = trend === "Alcista" && rsi14 < 70 && risk !== "Alto" && volumeRatio >= .75 ? "COMPRAR" :
      trend === "Bajista" && (risk === "Alto" || rsi14 < 38) ? "EVITAR" : "ESPERAR";
    if (!feedTrusted) {
      confidence = Math.min(confidence, 35);
      recommendation = "ESPERAR";
    }

    return { trendLabel: trend, regime, riskLabel: risk, confidence, momentum, positionRange,
      ema20, ema50, rsi14, atr14, atrPct, volumeRatio,
      scores: { trend: trendScore, momentum: momentumScore, rsi: rsiScore, liquidity: liquidityScore, risk: riskScore },
      recommendation, feedTrusted, feedQualityStatus: state.feedQuality?.status || "disconnected" };
  }

  function computeStrategies() {
    const options = Object.keys(SYMBOLS).map(sym => {
      const a = analyzeSymbol(sym), d = state.symbols[sym];
      if (!d) return null;
      return { sym, score: a.confidence + (a.trendLabel === "Alcista" ? 6 : 0) - (a.riskLabel === "Alto" ? 10 : 0), a, d };
    }).filter(Boolean).sort((a,b) => b.score - a.score);

    const scalpBase = options[0] || options[1];
    const swingBase = [...options].sort((a,b) => (a.d.change||0) - (b.d.change||0)).slice(-1)[0] || options[0];
    const intraBase = options[1] || options[0];

    state.strategies.scalp = buildPlan("scalp", scalpBase);
    state.strategies.intraday = buildPlan("intraday", intraBase);
    state.strategies.swing = buildPlan("swing", swingBase);
  }

  function buildPlan(type, base) {
    if (!base) return null;
    const { sym, d, a } = base;
    const entry = d.price;
    const atrProxy = Math.max(d.price * 0.0035, Math.abs(d.change) * d.price * 0.0007);
    const multipliers = type === "scalp" ? { sl: 0.9, tp: 1.5, validity: "15 min" } :
                        type === "intraday" ? { sl: 1.4, tp: 2.4, validity: "6 h" } :
                        { sl: 2.2, tp: 4.0, validity: "3 días" };
    const stop = entry - atrProxy * multipliers.sl;
    const target = entry + atrProxy * multipliers.tp;
    const rr = (target - entry) / Math.max(entry - stop, 0.00001);
    const verdict = a.recommendation === "COMPRAR" ? "SETUP VÁLIDO" : a.recommendation === "ESPERAR" ? "EN OBSERVACIÓN" : "NO TRADE";
    return {
      key: type,
      symbol: sym,
      entry, stop, target, rr,
      confidence: clamp(a.confidence + (type === "swing" ? 2 : 0), 35, 94),
      risk: a.riskLabel,
      verdict,
      validity: multipliers.validity,
      note: verdict === "SETUP VÁLIDO"
        ? "Tendencia favorable, riesgo controlado y contexto apto para entrada paper."
        : verdict === "EN OBSERVACIÓN"
        ? "La idea tiene mérito, pero todavía conviene esperar confirmación."
        : "El contexto actual no justifica una operación nueva."
    };
  }

  function renderStrategies() {
    Object.keys(strategyMap).forEach(k => {
      const plan = state.strategies[k];
      const holder = strategyMap[k].holder;
      strategyMap[k].asset.textContent = plan ? SYMBOLS[plan.symbol].label : "—";
      if (!plan) { holder.innerHTML = "<p class='strategy-note'>Sin datos suficientes.</p>"; return; }
      holder.innerHTML = `
        ${sRow("Entrada", fmtPrice(plan.entry))}
        ${sRow("Stop", fmtPrice(plan.stop))}
        ${sRow("Target", fmtPrice(plan.target))}
        ${sRow("R/R", plan.rr.toFixed(2))}
        ${sRow("Confianza", plan.confidence + "%")}
        ${sRow("Riesgo", plan.risk)}
        ${sRow("Estado", `<span class="${plan.verdict==='SETUP VÁLIDO'?'good':plan.verdict==='NO TRADE'?'bad':'warn'}">${plan.verdict}</span>`)}
        ${sRow("Vigencia", plan.validity)}
        <p class="strategy-note">${plan.note}</p>
      `;
    });
  }

  function refreshDecision() {
    const plans = Object.values(state.strategies).filter(Boolean);
    if (!plans.length) return;
    plans.sort((a,b) => b.confidence - a.confidence);
    const best = plans[0];
    state.focusSymbol = best.symbol;
    state.decision = best;
    els.decisionTitle.textContent = `APEX sugiere: ${best.verdict === "SETUP VÁLIDO" ? "CONSIDERAR ENTRADA PAPER" : best.verdict === "EN OBSERVACIÓN" ? "ESPERAR" : "EVITAR"}`;
    els.decisionText.textContent = best.note;
    els.focusAsset.textContent = SYMBOLS[best.symbol].label;
    els.focusConfidence.textContent = best.confidence + "%";
    els.focusRisk.textContent = best.risk;
    els.focusValidity.textContent = best.validity;
    els.coreCenterText.textContent = best.confidence + "%";
    els.engineRisk.textContent = best.risk === "Alto" ? "Vigilando" : best.risk === "Moderado" ? "Moderado" : "Normal";
    els.engineStrategy.textContent = best.verdict === "SETUP VÁLIDO" ? "Listo" : "Filtro";
    els.engineOpportunity.textContent = best.symbol.replace("USDT", "");
    document.body.dataset.apexState = best.verdict === "SETUP VÁLIDO" ? "opportunity" : best.verdict === "NO TRADE" ? "risk" : "waiting";
    els.coreVisual.classList.remove("opportunity", "risk", "waiting");
    els.coreVisual.classList.add(document.body.dataset.apexState);
    const decisionSignature = [best.symbol, best.verdict, best.risk, Math.round(best.confidence / 5) * 5].join("|");
    eventBus?.emitIfChanged("decision-synthesis", decisionSignature, "DECISION_SYNTHESIZED", {
      symbol: best.symbol,
      strategy: best.key,
      verdict: best.verdict,
      confidence: best.confidence,
      risk: best.risk,
      validity: best.validity,
      summary: best.note
    }, { source: "DECISION_ENGINE", category: "decision", severity: best.verdict === "SETUP VÁLIDO" ? "success" : best.verdict === "NO TRADE" ? "warning" : "info", symbol: best.symbol });
  }

  function renderPortfolio() {
    const p = state.portfolio;
    const openValue = p.positions.reduce((sum, pos) => sum + pos.capital, 0);
    const winCount = p.closedTrades.filter(t => t.pnl > 0).length;
    const winRate = p.closedTrades.length ? (winCount / p.closedTrades.length) * 100 : 0;

    els.equityValue.textContent = money(p.equity);
    els.cashValue.textContent = money(p.cash);
    els.exposureValue.textContent = ((openValue / Math.max(p.equity, 1)) * 100).toFixed(1) + "%";
    els.realizedValue.textContent = money(p.realized);
    els.winRateValue.textContent = winRate.toFixed(0) + "%";

    els.positionsList.innerHTML = "";
    if (!p.positions.length) {
      els.positionsList.innerHTML = `<div class="position-card"><div class="pos-head"><strong>Sin posiciones abiertas</strong><span>Tu capital está líquido</span></div></div>`;
    } else {
      p.positions.forEach(pos => {
        const current = state.symbols[pos.symbol]?.price || pos.entry;
        const pnl = ((current - pos.entry) / pos.entry) * pos.capital;
        const card = document.createElement("div");
        card.className = "position-card";
        card.innerHTML = `
          <div class="pos-head"><strong>${SYMBOLS[pos.symbol].label}</strong><span class="${pnl>=0?'good':'bad'}">${money(pnl)}</span></div>
          <div class="pos-meta">
            <div><span>Entrada</span><strong>${fmtPrice(pos.entry)}</strong></div>
            <div><span>Stop</span><strong>${fmtPrice(pos.stop)}</strong></div>
            <div><span>Target</span><strong>${fmtPrice(pos.target)}</strong></div>
            <div><span>Capital</span><strong>${money(pos.capital)}</strong></div>
          </div>
          <div class="row" style="margin-top:8px"><button class="mini-btn" data-close-pos="${pos.id}">Cerrar manual</button></div>
        `;
        els.positionsList.appendChild(card);
      });
      $all("[data-close-pos]").forEach(btn => btn.onclick = () => closePosition(btn.dataset.closePos, "Cierre manual"));
    }
    els.enginePortfolio.textContent = openValue > p.equity * 0.5 ? "Expuesto" : openValue > 0 ? "Activo" : "Estable";
  }

  function renderBots() {
    els.botsList.innerHTML = "";
    state.bots.forEach(bot => {
      const item = document.createElement("div");
      item.className = "bot-card";
      item.innerHTML = `
        <div class="bot-title">
          <strong>${bot.name}</strong>
          <span>${bot.desc} · ${bot.last}</span>
        </div>
        <div class="bot-actions">
          <button class="mini-btn">${bot.active ? "Pausar" : "Activar"}</button>
        </div>
      `;
      item.querySelector("button").onclick = () => {
        bot.active = !bot.active;
        bot.last = bot.active ? "Reanudado" : "Pausado por usuario";
        emitEvent("AGENT_STATE_CHANGED", {
          agentId: bot.id,
          agentName: bot.name,
          active: bot.active,
          message: `${bot.name} ${bot.active ? "activado" : "pausado"}`
        }, { source: "AUTOMATION", category: "agent", severity: bot.active ? "success" : "warning" });
        log("Bot", `${bot.name} ${bot.active ? "activado" : "pausado"}`, bot.active ? "RUN" : "PAUSE");
        renderBots(); persist();
      };
      els.botsList.appendChild(item);
    });
    els.engineBots.textContent = `${state.bots.filter(b=>b.active).length}/${state.bots.length}`;
  }

  function renderChatSeed() {
    addChat("apex", "Sistema iniciado. Datos reales de mercado, Event Bus persistente y operatoria completamente paper.");
    addChat("apex", "La capa AI Command puede razonar sobre toda la plataforma, abrir módulos y proponer acciones gobernadas. Las acciones sensibles requieren confirmación.");
  }

  function handleSendChat() {
    const msg = els.chatInput.value.trim();
    if (!msg) return;
    els.chatInput.value = "";
    sendApexQuestion(msg);
  }

  async function sendApexQuestion(msg) {
    addChat("user", msg);
    emitEvent("DIALOGUE_REQUESTED", { message: msg, symbol: state.focusSymbol }, { source: "USER", category: "dialogue", severity: "info", symbol: state.focusSymbol });
    els.chatStatus.textContent = "THINKING";
    if (window.APEX_AI?.ask) {
      try {
        await window.APEX_AI.ask(msg, { userAlreadyAdded: true });
      } catch (error) {
        const response = `${apexResponse(msg)}\n\nLa capa AI Command encontró un error: ${error.message}`;
        addChat("apex", response);
        emitEvent("DIALOGUE_RESPONSE_FALLBACK", { message: response, question: msg }, { source: "APEX_LOCAL", category: "dialogue", severity: "warning", symbol: state.focusSymbol });
      } finally {
        els.chatStatus.textContent = "READY";
      }
      return;
    }
    setTimeout(() => {
      const response = apexResponse(msg);
      addChat("apex", response);
      emitEvent("DIALOGUE_RESPONSE_GENERATED", { message: response, question: msg, symbol: state.focusSymbol }, { source: "APEX_LOCAL", category: "dialogue", severity: "info", symbol: state.focusSymbol });
      els.chatStatus.textContent = "READY";
    }, 350);
  }

  function apexResponse(msg) {
    const q = msg.toLowerCase();
    const sym = q.includes("btc") ? "BTCUSDT" : q.includes("sol") ? "SOLUSDT" : q.includes("eth") ? "ETHUSDT" : state.focusSymbol;
    const analysis = analyzeSymbol(sym);
    const plan = Object.values(state.strategies).find(p => p.symbol === sym) || state.decision;
    if (q.includes("memoria") || q.includes("historial") || q.includes("última decisión") || q.includes("ultima decision")) {
      const memory = eventBus?.getMemory?.();
      const lastDecision = memory?.decisions?.[0];
      const lastOutcome = memory?.outcomes?.[0];
      if (!lastDecision) return "La memoria persistente está activa, pero todavía no acumuló una decisión propia suficiente. Construí un caso y quedará disponible en futuras sesiones.";
      const outcomeText = lastOutcome ? ` El último resultado paper registrado fue ${lastOutcome.eventType || "un evento operativo"}${Number.isFinite(Number(lastOutcome.pnl)) ? ` con P&L ${money(lastOutcome.pnl)}` : ""}.` : " Todavía no hay resultados paper cerrados asociados.";
      return `Recuerdo ${lastDecision.caseId || "el último caso"}: ${lastDecision.symbol || "mercado"}, decisión ${String(lastDecision.decision || "sin decisión").toLowerCase()} con consenso ${lastDecision.consensus || 0}%.${outcomeText}`;
    }
    if (q.includes("riesgo")) {
      return `${SYMBOLS[sym].short} muestra riesgo ${analysis.riskLabel.toLowerCase()}. Mi lectura actual prioriza proteger capital antes que forzar entradas.`;
    }
    if (q.includes("bot")) {
      const active = state.bots.filter(b => b.active).length;
      return `Hay ${active} bots activos. Los bots actuales monitorean, filtran y ayudan, pero todavía no ejecutan dinero real.`;
    }
    if (q.includes("portfolio") || q.includes("capital")) {
      return `Tu portfolio paper tiene ${money(state.portfolio.equity)} de equity, ${money(state.portfolio.cash)} de liquidez y ${state.portfolio.positions.length} posiciones abiertas.`;
    }
    if (q.includes("scalp") || q.includes("intraday") || q.includes("swing") || q.includes("operacion") || q.includes("operación")) {
      return `Para ${SYMBOLS[plan.symbol].short} veo ${plan.key} en estado "${plan.verdict}". Entrada ${fmtPrice(plan.entry)}, stop ${fmtPrice(plan.stop)}, target ${fmtPrice(plan.target)} y confianza ${plan.confidence}%.`;
    }
    return `${SYMBOLS[sym].short} está ${analysis.trendLabel.toLowerCase()} en régimen ${analysis.regime.toLowerCase()}. EMA20 ${fmtPrice(analysis.ema20)}, EMA50 ${fmtPrice(analysis.ema50)}, RSI ${analysis.rsi14.toFixed(1)}, ATR ${analysis.atrPct.toFixed(2)}% y volumen relativo x${analysis.volumeRatio.toFixed(2)}. Mi veredicto es ${analysis.recommendation} con ${analysis.confidence}% de confianza.`;
  }

  function openEvidence(sym) {
    const d = state.symbols[sym];
    const a = analyzeSymbol(sym);
    const plan = Object.values(state.strategies).find(p => p?.symbol === sym) || state.decision || (d ? {
      entry: d.price,
      stop: d.price,
      target: d.price,
      rr: 0
    } : null);
    state.evidenceSymbol = sym;
    els.evidenceTitle.textContent = SYMBOLS[sym].label;
    if (!d || !plan) {
      els.evidenceGrid.innerHTML = `<div class="ev evidence-loading"><span>Estado</span><strong>Sincronizando datos del mercado...</strong></div>`;
      els.evidenceModal.classList.remove("hidden");
      return;
    }
    const rangePos = a.positionRange.toFixed(0) + "%";
    els.evidenceGrid.innerHTML = `
      ${ev("Precio", fmtPrice(d.price))}
      ${ev("Cambio 24h", `<span class="${d.change>=0?'good':'bad'}">${fmtPct(d.change)}</span>`)}
      ${ev("Tendencia", a.trendLabel)}
      ${ev("Régimen", a.regime)}
      ${ev("EMA 20", fmtPrice(a.ema20))}
      ${ev("EMA 50", fmtPrice(a.ema50))}
      ${ev("RSI 14", a.rsi14.toFixed(1))}
      ${ev("ATR 14", fmtPrice(a.atr14) + " · " + a.atrPct.toFixed(2) + "%")}
      ${ev("Volumen relativo", "x" + a.volumeRatio.toFixed(2))}
      ${ev("Momentum corto", fmtPct(a.momentum))}
      ${ev("Confianza", a.confidence + "%")}
      ${ev("Riesgo", a.riskLabel)}
      ${ev("Spread", fmtPrice(d.spread))}
      ${ev("Posición en rango", rangePos)}
      ${ev("Entrada sugerida", fmtPrice(plan.entry))}
      ${ev("Stop", fmtPrice(plan.stop))}
      ${ev("Target", fmtPrice(plan.target))}
      ${ev("R/R", plan.rr.toFixed(2))}
    `;
    els.evidenceModal.classList.remove("hidden");
  }

  function closeEvidence() {
    els.evidenceModal.classList.add("hidden");
  }

  function openTicketFor(sym) {
    const plan = Object.values(state.strategies).find(p => p.symbol === sym) || state.decision;
    openTicketWithPlan(sym, plan?.entry || state.symbols[sym]?.price || 0, plan?.stop || 0, plan?.target || 0);
  }

  function openTicketWithPlan(sym, entry, stop, target) {
    els.drawerAsset.textContent = SYMBOLS[sym].label;
    els.tradeDrawer.dataset.symbol = sym;
    els.entryInput.value = round(entry);
    els.stopInput.value = round(stop);
    els.targetInput.value = round(target);
    resetTicketValidation(true);
    els.tradeDrawer.classList.add("open");
  }
  function closeDrawer(){ els.tradeDrawer.classList.remove("open"); }

  function trustedMarketGate(action) {
    return marketQuality?.gate?.(action, state.feedQuality) || { ok: Boolean(state.feedQuality?.trusted), message: "Datos de mercado no confiables." };
  }

  function validateOrExecuteTicket() {
    const symbol = els.tradeDrawer.dataset.symbol || state.focusSymbol;
    const capital = Number(els.capitalInput.value);
    const entry = Number(els.entryInput.value);
    const stop = Number(els.stopInput.value);
    const target = Number(els.targetInput.value);
    const feedGate = trustedMarketGate("paper_open");
    if (!feedGate.ok) {
      state.ticketValidated = false;
      emitEvent("RISK_FEED_QUALITY_VETO", { symbol, action: "paper_open", quality: state.feedQuality, reason: feedGate.message }, { source: "RISK", category: "risk", severity: "error", symbol });
      return showTicket("rejected", "OPERACIÓN BLOQUEADA", feedGate.message);
    }

    if (!state.ticketValidated) {
      if (capital <= 0 || capital > state.portfolio.cash) {
        const reason = capital > state.portfolio.cash ? "No hay liquidez suficiente." : "Capital inválido.";
        emitEvent("RISK_TICKET_REJECTED", { symbol, capital, entry, stop, target, reason }, { source: "RISK", category: "risk", severity: "warning", symbol });
        return showTicket("rejected", "OPERACIÓN RECHAZADA", reason);
      }
      if (!(entry > stop && target > entry)) {
        const reason = "La relación entrada / stop / target no es válida.";
        emitEvent("RISK_TICKET_REJECTED", { symbol, capital, entry, stop, target, reason }, { source: "RISK", category: "risk", severity: "warning", symbol });
        return showTicket("rejected", "OPERACIÓN RECHAZADA", reason);
      }
      const riskAmt = capital * ((entry - stop) / entry);
      if (riskAmt > state.portfolio.equity * 0.02) {
        const reason = "El riesgo supera el 2% del equity.";
        emitEvent("RISK_VETO", { symbol, capital, riskAmt, equity: state.portfolio.equity, reason }, { source: "RISK", category: "risk", severity: "error", symbol });
        return showTicket("rejected", "OPERACIÓN RECHAZADA", reason);
      }
      state.ticketValidated = true;
      els.validateTradeBtn.textContent = "EJECUTAR EN PAPER";
      emitEvent("RISK_TICKET_APPROVED", { symbol, capital, entry, stop, target, riskAmt }, { source: "RISK", category: "risk", severity: "success", symbol });
      return showTicket("approved", "APROBADA POR RISK ENGINE", `Capital ${money(capital)} · Riesgo estimado ${money(riskAmt)} · Operación lista.`);
    }

    const id = "P" + Date.now().toString().slice(-6);
    state.portfolio.cash -= capital;
    state.portfolio.positions.unshift({ id, symbol, capital, entry, stop, target, openedAt: Date.now() });
    showTicket("executed", "ORDEN PAPER EJECUTADA", `${id} · ${SYMBOLS[symbol].label} · ${money(capital)} · Estado ABIERTA`);
    els.validateTradeBtn.textContent = "OPERACIÓN EJECUTADA";
    els.validateTradeBtn.disabled = true;
    state.ticketExecuted = true;
    emitEvent("PAPER_TRADE_OPENED", {
      tradeId: id, symbol, capital, entry, stop, target,
      executionMode: "PAPER_ONLY"
    }, { source: "EXECUTION", category: "execution", severity: "success", symbol, correlationId: id });
    log("Trade", `Orden paper abierta en ${SYMBOLS[symbol].short}`, "OPEN");
    renderPortfolio(); persist();
  }

  function showTicket(type, title, msg) {
    els.ticketResult.className = "validation-result " + type;
    els.ticketResult.innerHTML = `<strong>${title}</strong><span>${msg}</span>`;
    els.ticketResult.classList.remove("hidden");
  }

  function resetTicketValidation(force = false) {
    if (!force && state.ticketExecuted) return;
    state.ticketValidated = false;
    state.ticketExecuted = false;
    els.validateTradeBtn.textContent = "VALIDAR OPERACIÓN";
    els.validateTradeBtn.disabled = false;
    els.ticketResult.className = "validation-result hidden";
  }

  function checkOpenPositions() {
    if (!trustedMarketGate("risk").ok) return;
    const positions = [...state.portfolio.positions];
    positions.forEach(pos => {
      const current = state.symbols[pos.symbol]?.price;
      if (!current) return;
      if (current <= pos.stop) closePosition(pos.id, "Stop Loss");
      else if (current >= pos.target) closePosition(pos.id, "Take Profit");
    });
  }

  function closePosition(id, reason) {
    const idx = state.portfolio.positions.findIndex(p => p.id === id);
    if (idx < 0) return;
    const pos = state.portfolio.positions[idx];
    const current = state.symbols[pos.symbol]?.price || pos.entry;
    const pnl = ((current - pos.entry) / pos.entry) * pos.capital;
    state.portfolio.positions.splice(idx, 1);
    state.portfolio.cash += pos.capital + pnl;
    state.portfolio.realized += pnl;
    state.portfolio.equity = state.portfolio.cash + state.portfolio.positions.reduce((s,p)=>s+p.capital,0);
    state.portfolio.closedTrades.unshift({
      id: pos.id, symbol: pos.symbol, capital: pos.capital, entry: pos.entry, exit: current, pnl, reason, closedAt: Date.now()
    });
    emitEvent("PAPER_TRADE_CLOSED", {
      tradeId: pos.id, symbol: pos.symbol, capital: pos.capital, entry: pos.entry,
      exit: current, pnl, reason, executionMode: "PAPER_ONLY"
    }, { source: "EXECUTION", category: "execution", severity: pnl >= 0 ? "success" : "warning", symbol: pos.symbol, correlationId: pos.id });
    log("Trade", `${SYMBOLS[pos.symbol].short} cerrada por ${reason} · ${money(pnl)}`, pnl >= 0 ? "WIN" : "LOSS");
    renderPortfolio(); persist();
  }

  function toggleWatch(sym) {
    if (state.watchlist.includes(sym)) state.watchlist = state.watchlist.filter(s => s !== sym);
    else state.watchlist.unshift(sym);
    emitEvent("WATCHLIST_CHANGED", {
      symbol: sym,
      watching: state.watchlist.includes(sym),
      message: `${SYMBOLS[sym].short} ${state.watchlist.includes(sym) ? "agregado" : "quitado"} de seguimiento`
    }, { source: "HUNTER", category: "research", severity: "info", symbol: sym });
    log("Watchlist", `${SYMBOLS[sym].short} ${state.watchlist.includes(sym) ? "agregado" : "quitado"} de seguimiento`, "WATCH");
    renderMarket(); persist();
  }

  function simulateBotsAndChecks() {
    const best = state.decision;
    if (best?.verdict === "SETUP VÁLIDO") {
      const bot = state.bots.find(b => b.id === "spot-hunter");
      if (bot && bot.active) { bot.last = `Detectó ${SYMBOLS[best.symbol].short} ${best.key}`; }
    }
    renderBots();
  }

  function resetPaperPortfolio() {
    if (!confirm("¿Reiniciar portfolio paper y track record?")) return;
    state.portfolio = { equity: 25000, cash: 25000, realized: 0, positions: [], closedTrades: [] };
    emitEvent("PAPER_PORTFOLIO_RESET", { equity: 25000, executionMode: "PAPER_ONLY", reason: "Reset manual confirmado" }, { source: "PORTFOLIO", category: "execution", severity: "warning" });
    log("Sistema", "Portfolio paper reiniciado", "RESET");
    renderPortfolio(); persist();
  }

  function exportClosedTradesCsv() {
    const trades = state.portfolio.closedTrades;
    if (!trades.length) { log("Export", "No hay trades cerrados para exportar", "INFO"); return; }
    const lines = ["id,symbol,capital,entry,exit,pnl,reason,closedAt"];
    trades.forEach(t => lines.push([t.id, t.symbol, t.capital, t.entry, t.exit, t.pnl, t.reason, new Date(t.closedAt).toISOString()].join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "apex_closed_trades.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    emitEvent("PAPER_TRACK_RECORD_EXPORTED", { tradeCount: trades.length, format: "CSV" }, { source: "PORTFOLIO", category: "audit", severity: "success" });
    log("Export", "Historial paper exportado a CSV", "CSV");
  }

  function escapeChatText(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/\n/g, "<br>");
  }

  function addChat(role, text) {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble " + role;
    bubble.innerHTML = `<strong>${role === "apex" ? "APEX" : "Usuario"}</strong><p>${escapeChatText(text)}</p>`;
    els.chatMessages.prepend(bubble);
  }

  function log(source, message, tag = "INFO") {
    const event = emitEvent("SYSTEM_ACTIVITY", { message, tag }, {
      source,
      category: "activity",
      severity: ["LOSS", "FALLBACK", "RESET"].includes(tag) ? "warning" : ["OK", "READY", "LIVE", "WIN", "OPEN", "CSV"].includes(tag) ? "success" : "info"
    });
    if (eventBus) return event;
    const entry = document.createElement("div");
    entry.className = "log-entry";
    const time = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    entry.innerHTML = `<span class="log-time">${time}</span><div class="log-body"><strong>${source}</strong><span>${message}</span></div><span class="log-tag">${tag}</span>`;
    els.activityLog.prepend(entry);
    return null;
  }

  async function hydrateMarketHistory() {
    await Promise.all(Object.keys(SYMBOLS).map(async sym => {
      try {
        const response = await fetch(`/api/market/history?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const payload = await response.json();
        const rows = Array.isArray(payload.candles) ? payload.candles : [];
        if (!rows.length) throw new Error("Sin velas validadas");
        state.candles[sym] = rows.map(r => ({ open:+r.open, high:+r.high, low:+r.low, close:+r.close, volume:+r.volume, ts:+r.openTime }));
        state.marketHistory[sym] = state.candles[sym].map(c => c.close);
      } catch (error) {
        try {
          const fallback = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=15m&limit=120`);
          if (!fallback.ok) throw new Error("HTTP " + fallback.status);
          const rows = await fallback.json();
          state.candles[sym] = rows.map(r => ({ open:+r[1], high:+r[2], low:+r[3], close:+r[4], volume:+r[5], ts:+r[0] }));
          state.marketHistory[sym] = state.candles[sym].map(c => c.close);
          return;
        } catch {}
        log("Data Pipeline", `${SYMBOLS[sym].short}: histórico no disponible; se usará feed incremental`, "FALLBACK");
      }
    }));
    log("Data Pipeline", "Histórico 15m normalizado para EMA, RSI, ATR y volumen", "READY");
  }

  function applyDensity(mode) {
    const allowed = ["compact", "comfortable", "large"];
    state.density = allowed.includes(mode) ? mode : "comfortable";
    document.body.dataset.density = state.density;
    $all("[data-density]").forEach(b => b.classList.toggle("active", b.dataset.density === state.density));
    save("apex-density", state.density);
  }

  function ema(values, period) {
    return marketMath?.ema?.(values, period) ?? 0;
  }
  function rsi(values, period=14) {
    return marketMath?.rsi?.(values, period) ?? 50;
  }
  function atr(candles, period=14) {
    return marketMath?.atr?.(candles, period) ?? 0;
  }
  function average(values){ return marketMath?.average?.(values) ?? 0; }
  function indicator(label,value){ return `<div class="indicator-chip"><span>${label}</span><strong>${value}</strong></div>`; }

  function persist() {
    save("apex-watchlist", state.watchlist);
    save("apex-portfolio", state.portfolio);
    save("apex-bots", state.bots);
  }

  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }

  function $ (s) { return document.querySelector(s); }
  function $all (s) { return document.querySelectorAll(s); }
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
  function money(v){ return "US$ " + Number(v).toLocaleString("es-AR", { maximumFractionDigits: 2 }); }
  function fmtPrice(v){ return Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtPct(v){ return (v >= 0 ? "+" : "") + Number(v || 0).toFixed(2) + "%"; }
  function compact(v){ return Number(v||0).toLocaleString("es-AR", { maximumFractionDigits: 0 }); }
  function round(v){ return Number(v||0).toFixed(2); }
  function sRow(k,v){ return `<div class="s-row"><span>${k}</span><strong>${v}</strong></div>`; }
  function ev(k,v){ return `<div class="ev"><span>${k}</span><strong>${v}</strong></div>`; }

  function commandResolveSymbol(value) {
    const normalized = String(value || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (normalized.includes("BTC")) return "BTCUSDT";
    if (normalized.includes("SOL")) return "SOLUSDT";
    if (normalized.includes("ETH")) return "ETHUSDT";
    if (SYMBOLS[normalized]) return normalized;
    throw new Error(`Activo no soportado en esta etapa: ${value || "vacío"}`);
  }

  function commandSnapshot() {
    const symbols = {};
    Object.keys(SYMBOLS).forEach(symbol => {
      const market = state.symbols[symbol] || {};
      let analysis = null;
      try { analysis = market.price ? analyzeSymbol(symbol) : null; } catch { analysis = null; }
      symbols[symbol] = {
        label: SYMBOLS[symbol].label,
        price: Number(market.price || 0),
        timestamp: Number(market.ts || 0),
        change24h: Number(market.change || 0),
        bid: Number(market.bid || 0),
        ask: Number(market.ask || 0),
        analysis: analysis ? {
          trend: analysis.trendLabel,
          regime: analysis.regime,
          recommendation: analysis.recommendation,
          confidence: analysis.confidence,
          risk: analysis.riskLabel,
          rsi14: Number(analysis.rsi14 || 0),
          atrPct: Number(analysis.atrPct || 0),
          volumeRatio: Number(analysis.volumeRatio || 0),
          ema20: Number(analysis.ema20 || 0),
          ema50: Number(analysis.ema50 || 0)
        } : null
      };
    });
    const memory = eventBus?.getMemory?.() || {};
    return {
      version: "7.0.0",
      executionMode: "PAPER_ONLY",
      externalAccounts: false,
      feedStatus: state.feedStatus,
      feedQuality: marketQuality?.normalize?.(state.feedQuality) || state.feedQuality,
      marketSource: state.marketSource,
      focusSymbol: state.focusSymbol,
      symbols,
      decision: state.decision ? { ...state.decision } : null,
      strategies: state.strategies,
      portfolio: {
        equity: state.portfolio.equity,
        cash: state.portfolio.cash,
        realized: state.portfolio.realized,
        positions: state.portfolio.positions.map(position => ({ ...position, currentPrice: state.symbols[position.symbol]?.price || position.entry })),
        closedTradeCount: state.portfolio.closedTrades.length,
        recentClosedTrades: state.portfolio.closedTrades.slice(0, 8),
        dailyPnl: state.portfolio.closedTrades.filter(trade => Date.now() - Number(trade.closedAt || 0) < 86400000).reduce((sum, trade) => sum + Number(trade.pnl || 0), 0)
      },
      agents: state.bots.map(bot => ({ id: bot.id, name: bot.name, active: bot.active, last: bot.last })),
      watchlist: [...state.watchlist],
      governance: {
        autonomyCapPct: Number(localStorage.getItem("apexAutonomyCap") || 5),
        trustScore: document.getElementById("trustScore")?.textContent || "N/D",
        autonomyState: document.getElementById("autonomyState")?.textContent || "Paper",
        liveTrading: false
      },
      memory: {
        eventCount: eventBus?.stats?.().count || 0,
        decisions: (memory.decisions || []).slice(0, 6),
        objections: (memory.objections || []).slice(0, 6),
        audits: (memory.audits || []).slice(0, 4),
        outcomes: (memory.outcomes || []).slice(0, 6)
      }
    };
  }

  function commandFocusAsset(value) {
    const symbol = commandResolveSymbol(value);
    state.focusSymbol = symbol;
    refreshDecision();
    renderMarket();
    emitEvent("AI_FOCUS_ASSET_CHANGED", { symbol }, { source: "AI_COMMAND", category: "navigation", severity: "info", symbol });
    return { ok: true, symbol, message: `Foco cambiado a ${SYMBOLS[symbol].label}.` };
  }

  function commandRefreshReading(value) {
    const symbol = commandResolveSymbol(value || state.focusSymbol);
    state.focusSymbol = symbol;
    refreshDecision();
    refreshAll();
    return { ok: true, symbol, decision: state.decision, message: `Lectura de ${SYMBOLS[symbol].label} actualizada.` };
  }

  function commandPreparePaperTrade(input = {}) {
    const symbol = commandResolveSymbol(input.symbol || state.focusSymbol);
    const marketPrice = state.symbols[symbol]?.price || 0;
    const entry = Number(input.entry || marketPrice);
    const stop = Number(input.stop || 0);
    const target = Number(input.target || 0);
    const capital = Number(input.capital || 0);
    if (!(capital > 0)) throw new Error("El capital paper debe ser mayor a cero.");
    if (!(entry > 0 && stop > 0 && target > 0)) throw new Error("Faltan entrada, stop o target válidos.");
    openTicketWithPlan(symbol, entry, stop, target);
    els.capitalInput.value = String(capital);
    resetTicketValidation(true);
    emitEvent("AI_PAPER_TICKET_PREPARED", { symbol, capital, entry, stop, target, rationale: input.rationale || "" }, { source: "AI_COMMAND", category: "execution", severity: "info", symbol });
    return { ok: true, symbol, message: `Ticket paper preparado para ${SYMBOLS[symbol].label}. Revisalo antes de ejecutar.` };
  }

  function commandExecutePaperTrade(input = {}) {
    const symbol = commandResolveSymbol(input.symbol || state.focusSymbol);
    const feedGate = trustedMarketGate("paper_open");
    if (!feedGate.ok) throw new Error(feedGate.message);
    const capital = Number(input.capital);
    const entry = Number(input.entry);
    const stop = Number(input.stop);
    const target = Number(input.target);
    if (!(capital > 0) || capital > state.portfolio.cash) throw new Error(capital > state.portfolio.cash ? "No hay liquidez paper suficiente." : "Capital inválido.");
    if (!(entry > stop && target > entry && stop > 0)) throw new Error("La relación entrada / stop / target no es válida para una posición long spot.");
    const riskAmt = capital * ((entry - stop) / entry);
    if (riskAmt > state.portfolio.equity * 0.02) throw new Error("Risk Engine vetó la orden: riesgo mayor al 2% del equity.");
    const id = "AI" + Date.now().toString().slice(-7);
    state.portfolio.cash -= capital;
    state.portfolio.positions.unshift({ id, symbol, capital, entry, stop, target, openedAt: Date.now(), source: "AI_COMMAND" });
    state.portfolio.equity = state.portfolio.cash + state.portfolio.positions.reduce((sum, position) => sum + position.capital, 0);
    emitEvent("PAPER_TRADE_OPENED", { tradeId: id, symbol, capital, entry, stop, target, riskAmt, rationale: input.rationale || "", executionMode: "PAPER_ONLY", requestedBy: "AI_COMMAND" }, { source: "EXECUTION", category: "execution", severity: "success", symbol, correlationId: id });
    log("AI Command", `Orden paper ${id} abierta en ${SYMBOLS[symbol].short}`, "OPEN");
    renderPortfolio(); persist();
    return { ok: true, tradeId: id, symbol, riskAmt, message: `Orden PAPER ${id} ejecutada en ${SYMBOLS[symbol].label}. Capital ${money(capital)}; riesgo estimado ${money(riskAmt)}.` };
  }

  function commandFindPosition(input = {}) {
    const tradeId = String(input.trade_id || input.tradeId || "").trim();
    if (tradeId) {
      const found = state.portfolio.positions.find(position => position.id === tradeId);
      if (!found) throw new Error(`No existe la posición ${tradeId}.`);
      return found;
    }
    const symbol = commandResolveSymbol(input.symbol || state.focusSymbol);
    const matches = state.portfolio.positions.filter(position => position.symbol === symbol);
    if (!matches.length) throw new Error(`No hay posición abierta en ${SYMBOLS[symbol].label}.`);
    if (matches.length > 1) throw new Error(`Hay más de una posición en ${SYMBOLS[symbol].label}; indicá el trade ID.`);
    return matches[0];
  }

  function commandClosePaperPosition(input = {}) {
    const position = commandFindPosition(input);
    const feedGate = trustedMarketGate("paper_close");
    if (!feedGate.ok) throw new Error(feedGate.message);
    const fraction = Math.max(0.01, Math.min(1, Number(input.fraction || 1)));
    const index = state.portfolio.positions.findIndex(item => item.id === position.id);
    const current = state.symbols[position.symbol]?.price || position.entry;
    const closedCapital = position.capital * fraction;
    const pnl = ((current - position.entry) / position.entry) * closedCapital;
    if (fraction >= 0.999) state.portfolio.positions.splice(index, 1);
    else state.portfolio.positions[index] = { ...position, capital: position.capital - closedCapital };
    state.portfolio.cash += closedCapital + pnl;
    state.portfolio.realized += pnl;
    state.portfolio.equity = state.portfolio.cash + state.portfolio.positions.reduce((sum, item) => sum + item.capital, 0);
    state.portfolio.closedTrades.unshift({ id: `${position.id}-${Math.round(fraction * 100)}`, parentId: position.id, symbol: position.symbol, capital: closedCapital, entry: position.entry, exit: current, pnl, reason: input.rationale || `AI close ${Math.round(fraction * 100)}%`, closedAt: Date.now() });
    emitEvent("PAPER_TRADE_CLOSED", { tradeId: position.id, symbol: position.symbol, fraction, capital: closedCapital, entry: position.entry, exit: current, pnl, reason: input.rationale || "AI command", executionMode: "PAPER_ONLY" }, { source: "EXECUTION", category: "execution", severity: pnl >= 0 ? "success" : "warning", symbol: position.symbol, correlationId: position.id });
    renderPortfolio(); persist();
    return { ok: true, tradeId: position.id, fraction, pnl, message: `Cerré en PAPER el ${Math.round(fraction * 100)}% de ${SYMBOLS[position.symbol].label}. P&L realizado ${money(pnl)}.` };
  }

  function commandModifyPaperPosition(input = {}) {
    const position = commandFindPosition(input);
    const feedGate = trustedMarketGate("paper_modify");
    if (!feedGate.ok) throw new Error(feedGate.message);
    const current = state.symbols[position.symbol]?.price || position.entry;
    const stop = input.stop == null ? position.stop : Number(input.stop);
    const target = input.target == null ? position.target : Number(input.target);
    if (!(stop > 0 && stop < current)) throw new Error("El nuevo stop debe ser positivo y quedar por debajo del precio actual.");
    if (!(target > current)) throw new Error("El nuevo target debe quedar por encima del precio actual.");
    position.stop = stop;
    position.target = target;
    emitEvent("PAPER_POSITION_PROTECTION_MODIFIED", { tradeId: position.id, symbol: position.symbol, stop, target, current, rationale: input.rationale || "", executionMode: "PAPER_ONLY" }, { source: "EXECUTION", category: "execution", severity: "success", symbol: position.symbol, correlationId: position.id });
    renderPortfolio(); persist();
    return { ok: true, tradeId: position.id, message: `Protección PAPER actualizada en ${SYMBOLS[position.symbol].label}: stop ${fmtPrice(stop)}, target ${fmtPrice(target)}.` };
  }

  function commandSetAgentState(agentId, active) {
    const bot = state.bots.find(item => item.id === agentId);
    if (!bot) throw new Error(`Agente desconocido: ${agentId}.`);
    bot.active = Boolean(active);
    bot.last = bot.active ? "Activado por AI Command" : "Pausado por AI Command";
    emitEvent("AGENT_STATE_CHANGED", { agentId, active: bot.active, requestedBy: "AI_COMMAND" }, { source: "AUTOMATION", category: "agent", severity: bot.active ? "success" : "warning" });
    renderBots(); persist();
    return { ok: true, message: `${bot.name} quedó ${bot.active ? "activo" : "pausado"}.` };
  }

  function commandSetWatchlist(value, watching) {
    const symbol = commandResolveSymbol(value);
    const has = state.watchlist.includes(symbol);
    if (Boolean(watching) !== has) toggleWatch(symbol);
    return { ok: true, symbol, message: `${SYMBOLS[symbol].label} ${watching ? "agregado a" : "quitado de"} seguimiento.` };
  }

  function commandRunGovernanceAudit(reason = "AI Command") {
    const button = document.getElementById("runAuditBtn");
    if (!button) throw new Error("Governance Engine no está disponible.");
    button.click();
    emitEvent("AI_GOVERNANCE_AUDIT_REQUESTED", { reason }, { source: "AI_COMMAND", category: "governance", severity: "warning" });
    return { ok: true, message: "Autoauditoría ejecutada. Governance puede mantener, reducir o suspender autonomía; nunca elevar el techo humano." };
  }

  function commandExportMemory() {
    const button = document.getElementById("exportMemoryBtn");
    if (!button) throw new Error("El exportador de memoria no está disponible.");
    button.click();
    return { ok: true, message: "Memoria y Event Bus exportados a JSON." };
  }

  window.APEX_API = {
    getAnalysis: (symbol) => analyzeSymbol(symbol),
    getFocusSymbol: () => state.focusSymbol,
    getSymbolLabel: (symbol) => SYMBOLS[symbol]?.label || symbol,
    getState: () => state,
    getFeedQuality: () => marketQuality?.normalize?.(state.feedQuality) || state.feedQuality,
    getEventBus: () => eventBus,
    getMemory: () => eventBus?.getMemory?.() || null,
    getCommandSnapshot: commandSnapshot,
    appendChat: addChat,
    localResponse: apexResponse,
    commandFocusAsset,
    commandRefreshReading,
    commandOpenEvidence: (symbol) => { const resolved = commandResolveSymbol(symbol); openEvidence(resolved); return { ok: true, message: `Abrí evidencia de ${SYMBOLS[resolved].label}.` }; },
    commandCreateCase: (symbol, objective) => {
      const resolved = commandResolveSymbol(symbol);
      state.focusSymbol = resolved;
      const result = window.APEX_CASE_API?.buildCase?.(resolved, { persist: true, objective });
      document.querySelector('[data-open-panel="thinking"]')?.click();
      return { ok: true, result, message: `Caso construido para ${SYMBOLS[resolved].label}.` };
    },
    commandPreparePaperTrade,
    commandExecutePaperTrade,
    commandClosePaperPosition,
    commandModifyPaperPosition,
    commandSetAgentState,
    commandSetWatchlist,
    commandRunGovernanceAudit,
    commandExportMemory
  };
});

// APEX 1.3 Governance Foundation
(() => {
  const $ = (id) => document.getElementById(id);
  const slider = $('autonomySlider');
  const sliderValue = $('autonomySliderValue');
  const autonomyPercent = $('autonomyPercent');
  const trustScore = $('trustScore');
  const autonomyState = $('autonomyState');
  const journal = $('decisionJournal');
  const saved = Number(localStorage.getItem('apexAutonomyCap') || 5);
  if (slider) {
    slider.value = Math.min(5, Math.max(0, saved));
    const sync = () => {
      const v = Number(slider.value).toFixed(1).replace('.0','') + '%';
      sliderValue.textContent = v;
      autonomyPercent.textContent = v;
      localStorage.setItem('apexAutonomyCap', slider.value);
    };
    slider.addEventListener('input', sync); sync();
  }
  $('runAuditBtn')?.addEventListener('click', () => {
    const snapshot = window.APEX_API?.getCommandSnapshot?.() || {};
    const integrity = window.APEX_EVENT_BUS?.verifyIntegrity?.(250) || { ok: true };
    const recent = snapshot?.portfolio?.recentClosedTrades || [];
    const positions = snapshot?.portfolio?.positions || [];
    const analyses = Object.values(snapshot?.symbols || {}).map(item => item?.analysis).filter(Boolean);
    let score = 96;
    const reasons = [];
    const feedGate = window.APEX_MARKET_QUALITY?.gate?.('governance', snapshot.feedQuality) || { ok: false };
    if (!feedGate.ok) {
      score -= 30;
      reasons.push(`feed ${snapshot.feedQuality?.status || 'no confirmado'}`);
      if (['stale', 'disconnected'].includes(snapshot.feedQuality?.status)) score = Math.min(score, 65);
    }
    if (!integrity.ok) { score -= 24; reasons.push('integridad de memoria comprometida'); }
    if (analyses.some(item => item.risk === 'Alto')) { score -= 9; reasons.push('riesgo alto detectado'); }
    if (positions.length > 3) { score -= 7; reasons.push('exceso de posiciones'); }
    const recentPnl = recent.slice(0, 8).reduce((sum, item) => sum + Number(item.pnl || 0), 0);
    if (recent.length >= 3 && recentPnl < 0) { score -= 8; reasons.push('track record reciente negativo'); }
    if (recent.length < 3) { score -= 4; reasons.push('muestra histórica insuficiente'); }
    const runtimeState = window.APEX_RUNTIME?.getState?.();
    if (runtimeState?.emergencyStop) { score = Math.min(score, 60); reasons.push('kill switch activo'); }
    if (runtimeState && !runtimeState.snapshotFresh) { score -= 6; reasons.push('snapshot desactualizado'); }
    score = Math.max(45, Math.min(98, Math.round(score)));
    trustScore.textContent = `${score}/100`;
    const auditState = score >= 84 ? 'Habilitada en paper' : score >= 72 ? 'Reducida preventivamente' : 'Suspendida por auditoría';
    autonomyState.textContent = auditState;
    if (score < 84 && slider) slider.value = score >= 72 ? Math.min(Number(slider.value), 2.5) : 0;
    slider?.dispatchEvent(new Event('input'));
    const reasonText = reasons.length ? reasons.join(', ') : 'sin desvíos materiales';
    const row = document.createElement('div');
    row.innerHTML = `<time>Ahora</time><p><strong>Autoauditoría determinística: ${score}/100.</strong><span>${auditState}. Factores: ${reasonText}.</span></p>`;
    journal?.prepend(row);
    window.APEX_EVENT_BUS?.emit("GOVERNANCE_AUDIT_COMPLETED", {
      trustScore: score,
      autonomyState: auditState,
      autonomyCapPct: Number(slider?.value || 0),
      factors: reasons,
      integrityOk: integrity.ok,
      recentPnl,
      liveTrading: false
    }, { source: "GOVERNANCE", category: "governance", severity: score >= 84 ? "success" : score >= 72 ? "warning" : "error" });
  });
  $('exportJournalBtn')?.addEventListener('click', () => {
    const lines = [...(journal?.querySelectorAll('div') || [])].map(x => x.innerText.replace(/\n/g,' — '));
    const blob = new Blob([`APEX DECISION JOURNAL\n\n${lines.join('\n')}`], {type:'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'APEX_Decision_Journal.txt'; a.click(); URL.revokeObjectURL(a.href);
    window.APEX_EVENT_BUS?.emit("DECISION_JOURNAL_EXPORTED", { entries: lines.length, format: "TXT" }, { source: "GOVERNANCE", category: "audit", severity: "success" });
  });
})();

// APEX Quantum Architecture I · Thinking Engine
(() => {
  const byId = id => document.getElementById(id);
  const symbols = ['ETHUSDT','BTCUSDT','SOLUSDT'];
  let caseCounter = Number(localStorage.getItem('apexCaseCounter') || 1);

  function getAnalysis(symbol){ try { return window.APEX_API?.getAnalysis(symbol) || null; } catch { return null; } }
  function activeSymbol(){ try { return window.APEX_API?.getFocusSymbol() || 'ETHUSDT'; } catch { return 'ETHUSDT'; } }
  function label(symbol){ try { return window.APEX_API?.getSymbolLabel(symbol) || symbol.replace('USDT','/USDT'); } catch { return symbol; } }
  function item(title, detail){ return `<div class="case-item"><strong>${title}</strong><span>${detail}</span></div>`; }
  function objection(title, detail){ return `<div class="objection-item"><strong>${title}</strong><span>${detail}</span></div>`; }

  function buildCase(symbol = activeSymbol(), options = {}){
    const persistCase = options.persist !== false;
    const a = getAnalysis(symbol) || {confidence:72, trendLabel:'Neutral', regime:'Lateral', riskLabel:'Moderado', rsi14:50, volumeRatio:1, atrPct:1.2, recommendation:'ESPERAR'};
    const feedQuality = window.APEX_API?.getFeedQuality?.() || { status: 'disconnected', trusted: false };
    const feedTrusted = Boolean(window.APEX_MARKET_QUALITY?.isTrusted?.(feedQuality));
    if (persistCase) {
      caseCounter += 1;
      localStorage.setItem('apexCaseCounter', caseCounter);
    }
    const lastPersistedCase = window.APEX_EVENT_BUS?.getMemory?.()?.decisions?.[0]?.caseId;
    const id = persistCase ? `CASE-${String(caseCounter).padStart(4,'0')}` : (lastPersistedCase || 'CASE-PREVIEW');
    const trendBull = a.trendLabel === 'Alcista';
    const trendBear = a.trendLabel === 'Bajista';
    const enoughVolume = feedTrusted && a.volumeRatio >= .9;
    const highRisk = a.riskLabel === 'Alto';
    const rawConsensus = Math.max(38, Math.min(94, Math.round(a.confidence - (highRisk?12:0) + (enoughVolume?3:-4))));
    const consensus = feedTrusted ? rawConsensus : Math.min(rawConsensus, 35);
    const decision = !feedTrusted ? 'ESPERAR DATOS CONFIABLES' : highRisk ? 'RECHAZAR POR RIESGO' : consensus >= 82 && enoughVolume ? (trendBear ? 'EVITAR / SESGO BAJISTA' : 'APROBAR EN PAPER') : 'ESPERAR CONFIRMACIÓN';
    const autonomous = feedTrusted && decision === 'APROBAR EN PAPER' && consensus >= 86;

    byId('caseId').textContent = id;
    byId('caseAsset').textContent = label(symbol);
    byId('caseConsensus').textContent = `${consensus}%`;
    byId('caseHypothesis').textContent = !feedTrusted
      ? `El feed está ${feedQuality.status || 'no confirmado'}; no se formula una tesis operable hasta recuperar datos saludables y validados.`
      : trendBull
      ? 'La tendencia puede continuar si el precio mantiene estructura, liquidez y confirmación de volumen.'
      : trendBear
        ? 'La debilidad puede prolongarse; cualquier entrada exige invalidación clara del sesgo bajista.'
        : 'El mercado puede abandonar el equilibrio actual, pero todavía no existe una dirección suficientemente confirmada.';

    const evidence = [
      item('Estructura de mercado', `Tendencia ${a.trendLabel.toLowerCase()} con régimen ${a.regime.toLowerCase()}.`),
      item('Momentum y RSI', `RSI14 en ${Number(a.rsi14).toFixed(1)}; lectura compatible con el escenario, sin validarlo por sí sola.`),
      item('Liquidez observable', `Volumen relativo x${Number(a.volumeRatio).toFixed(2)} y riesgo ${a.riskLabel.toLowerCase()}.`)
    ];
    if (a.confidence >= 80) evidence.push(item('Convergencia cuantitativa', `El Confidence Builder alcanza ${a.confidence}%.`));
    const counters = [];
    if (!feedTrusted) counters.push(objection('Calidad de feed no confiable', `Estado ${feedQuality.status || 'desconocido'}; Thinking, Risk y Governance bloquean cualquier conclusión operable.`));
    if (!enoughVolume) counters.push(objection('Confirmación insuficiente', 'El volumen relativo todavía no respalda una ruptura fiable.'));
    if (a.atrPct > 2) counters.push(objection('Volatilidad expandida', `ATR relativo ${Number(a.atrPct).toFixed(2)}%; aumenta el riesgo de barrido.`));
    if (a.rsi14 > 68 || a.rsi14 < 32) counters.push(objection('Extremo de momentum', 'El RSI está cerca de una zona donde el timing puede deteriorarse.'));
    counters.push(objection('Dependencia del contexto', 'El caso aún no incorpora calendario macro, noticias ni datos on-chain externos.'));

    byId('caseEvidence').innerHTML = evidence.join('');
    byId('caseCounterEvidence').innerHTML = counters.join('');
    byId('evidenceCount').textContent = evidence.length;
    byId('counterCount').textContent = counters.length;
    byId('caseDecision').textContent = decision;
    byId('caseAutonomy').textContent = autonomous ? 'HABILITADA EN PAPER' : 'NO HABILITADA';
    byId('caseStatus').textContent = decision.includes('APROBAR') ? 'CASO APROBADO' : decision.includes('RECHAZAR') ? 'CASO RECHAZADO' : !feedTrusted ? 'DATOS NO CONFIABLES' : 'EN ANÁLISIS';

    const objections = [
      objection('Hipótesis alternativa', trendBull ? 'El movimiento puede ser una expansión tardía cerca de resistencia.' : 'La neutralidad puede persistir y erosionar la ventaja por ruido.'),
      objection('Falsabilidad', 'La tesis debe definir un nivel claro cuya ruptura invalide el caso.'),
      objection('Calidad de evidencia', enoughVolume ? 'El volumen acompaña, pero debe sostenerse durante la confirmación.' : 'La evidencia de volumen no alcanza el umbral mínimo.')
    ];
    byId('prosecutorObjections').innerHTML = objections.join('');
    byId('prosecutorVerdict').textContent = !feedTrusted ? 'VETO DE DATOS' : highRisk ? 'OBJECIÓN MAYOR' : consensus >= 84 ? 'TESIS RESISTENTE' : 'OBJECIÓN PARCIAL';
    byId('prosecutorSummary').textContent = !feedTrusted ? 'El feed no cumple el contrato de confianza. El Fiscal veta toda conclusión operable.' : highRisk ? 'El riesgo domina la oportunidad. El Fiscal recomienda no autorizar ejecución.' : consensus >= 84 ? 'La tesis sobrevivió al primer ataque, aunque conserva condiciones de invalidación.' : 'La tesis es plausible, pero todavía depende de confirmaciones adicionales.';
    byId('hardVetoState').textContent = highRisk || !feedTrusted ? 'ACTIVADO' : 'NO ACTIVADO';
    byId('hardVetoState').style.color = highRisk || !feedTrusted ? 'var(--red)' : 'var(--green)';

    const correlationId = id;
    if (persistCase) {
    window.APEX_EVENT_BUS?.emit("CASE_CREATED", {
      caseId: id, symbol, hypothesis: byId('caseHypothesis').textContent,
      confidence: a.confidence, regime: a.regime, risk: a.riskLabel
    }, { source: "CASE_ENGINE", category: "case", severity: "info", caseId: id, symbol, correlationId });
    evidence.forEach((_, index) => window.APEX_EVENT_BUS?.emit("EVIDENCE_REGISTERED", {
      caseId: id, symbol, evidenceIndex: index + 1, evidenceCount: evidence.length
    }, { source: "THINKING", category: "evidence", severity: "success", caseId: id, symbol, correlationId }));
    counters.forEach((_, index) => window.APEX_EVENT_BUS?.emit("PROSECUTOR_OBJECTION", {
      caseId: id, symbol, title: `Objeción ${index + 1}`, detail: byId('caseCounterEvidence').children[index]?.innerText || "Contraevidencia registrada",
      confidence: Math.max(50, 84 - index * 6)
    }, { source: "PROSECUTOR", category: "objection", severity: highRisk || !feedTrusted ? "error" : "warning", caseId: id, symbol, correlationId }));
    window.APEX_EVENT_BUS?.emit("CASE_DECIDED", {
      caseId: id, symbol, decision, consensus, autonomous,
      hypothesis: byId('caseHypothesis').textContent,
      evidenceCount: evidence.length,
      objectionCount: counters.length
    }, { source: "DECISION_ENGINE", category: "decision", severity: decision.includes('APROBAR') ? "success" : decision.includes('RECHAZAR') ? "error" : "info", caseId: id, symbol, correlationId });
    window.APEX_EVENT_BUS?.emit("AUTONOMY_ASSESSED", {
      caseId: id, symbol, autonomous, autonomyCapPct: Number(localStorage.getItem('apexAutonomyCap') || 5),
      reason: autonomous ? "Caso aprobado dentro de licencia paper" : "Umbral autónomo no alcanzado"
    }, { source: "GOVERNANCE", category: "governance", severity: autonomous ? "success" : "info", caseId: id, symbol, correlationId });
    }

    renderHistory(symbol, a, consensus, id);
    renderDeliberation(a, decision, autonomous);
    if (persistCase) addJournal(id, symbol, decision, consensus);
  }

  function renderHistory(symbol, a, consensus, currentCaseId){
    const memory = window.APEX_EVENT_BUS?.getMemory?.();
    const prior = (memory?.decisions || [])
      .filter(record => record.symbol === symbol && record.caseId !== currentCaseId)
      .slice(0, 3);
    const outcomes = (memory?.outcomes || []).filter(record => record.symbol === symbol).slice(0, 2);
    const matches = prior.map(record => {
      const similarity = Math.max(35, Math.min(99, 100 - Math.abs(Number(record.consensus || 50) - consensus)));
      const relatedOutcome = outcomes.find(outcome => outcome.correlationId === record.correlationId || outcome.caseId === record.caseId);
      const result = relatedOutcome
        ? `${record.decision} · resultado paper ${Number(relatedOutcome.pnl || 0) >= 0 ? 'positivo' : 'negativo'}`
        : `${record.decision} · resultado todavía no cerrado`;
      return [record.caseId || 'Caso persistido', similarity, result];
    });
    if (!matches.length) {
      byId('historianMatches').innerHTML = `<div class="history-item"><div><strong>Memoria propia en construcción</strong><span>No hay precedentes persistidos anteriores para ${label(symbol)}. APEX no inventa similitudes.</span></div><b class="match">—</b></div>`;
      byId('historySimilarity').textContent = 'N/D';
      return;
    }
    byId('historianMatches').innerHTML = matches.map(([name,match,result]) => `<div class="history-item"><div><strong>${name}</strong><span>${result}</span></div><b class="match">${Math.round(match)}%</b></div>`).join('');
    byId('historySimilarity').textContent = `${Math.round(matches.reduce((sum,item)=>sum+item[1],0)/matches.length)}%`;
  }

  function renderDeliberation(a, decision, autonomous){
    const rows = [
      ['HUNTER','Detectó una configuración investigable',a.confidence>=70?'APRUEBA':'OBJETA'],
      ['CONTEXT',a.feedTrusted?'Contexto externo pendiente de conexión':`Feed ${a.feedQualityStatus || 'no confiable'}`,a.feedTrusted?'OBJETA':'VETO'],
      ['STRATEGY',`Plan ${a.recommendation.toLowerCase()} compatible con el régimen`,a.recommendation==='COMPRAR'?'APRUEBA':'OBJETA'],
      ['RISK',a.feedTrusted?`Riesgo ${a.riskLabel.toLowerCase()}`:'Calidad de mercado insuficiente',!a.feedTrusted||a.riskLabel==='Alto'?'VETO':a.riskLabel==='Moderado'?'OBJETA':'APRUEBA'],
      ['GOVERNANCE',autonomous?'Licencia paper disponible':a.feedTrusted?'Umbral autónomo no alcanzado':'Autonomía suspendida por datos',autonomous?'APRUEBA':a.feedTrusted?'OBJETA':'VETO']
    ];
    byId('deliberationFlow').innerHTML = rows.map(([agent,text,vote]) => `<div class="deliberation-step"><b class="agent">${agent}</b><span>${text}</span><b class="vote ${vote==='APRUEBA'?'approve':vote==='VETO'?'veto':'object'}">${vote}</b></div>`).join('');
    byId('deliberationState').textContent = decision.includes('APROBAR') ? 'CONSENSO' : decision.includes('RECHAZAR') ? 'VETO' : 'DELIBERANDO';
  }

  function addJournal(id,symbol,decision,consensus){
    const journal=byId('decisionJournal'); if(!journal) return;
    const row=document.createElement('div');
    row.innerHTML=`<time>Ahora</time><p><strong>${id}: ${decision}.</strong><span>${label(symbol)} · consenso ${consensus}% · revisión adversarial registrada.</span></p>`;
    journal.prepend(row);
  }

  byId('buildCaseBtn')?.addEventListener('click',()=>buildCase(symbols[caseCounter%symbols.length]));
  byId('challengeCaseBtn')?.addEventListener('click',()=>{
    const box=byId('prosecutorVerdict');
    box.textContent='REINTERROGATORIO ACTIVO';
    byId('prosecutorSummary').textContent='El Fiscal elevó el estándar: exige invalidación explícita, confirmación temporal y revisión de correlación de portfolio.';
    window.APEX_EVENT_BUS?.emit("PROSECUTOR_REINTERROGATION_STARTED", {
      caseId: byId('caseId')?.textContent, symbol: activeSymbol(),
      message: "El Fiscal elevó el estándar de validación."
    }, { source: "PROSECUTOR", category: "objection", severity: "warning", caseId: byId('caseId')?.textContent, symbol: activeSymbol(), correlationId: byId('caseId')?.textContent });
    byId('prosecutorPanel')?.scrollIntoView?.({behavior:'smooth',block:'center'});
  });
  byId('archiveCaseBtn')?.addEventListener('click',()=>{
    byId('caseStatus').textContent='ARCHIVADO';
    window.APEX_EVENT_BUS?.emit("CASE_ARCHIVED", {
      caseId: byId('caseId').textContent, symbol: activeSymbol(), reason: "Archivado sin ejecución"
    }, { source: "CASE_ENGINE", category: "case", severity: "info", caseId: byId('caseId').textContent, symbol: activeSymbol(), correlationId: byId('caseId').textContent });
    addJournal(byId('caseId').textContent, activeSymbol(), 'CASO ARCHIVADO SIN EJECUCIÓN', Number((byId('caseConsensus').textContent||'0').replace('%','')));
  });

  window.APEX_CASE_API = { buildCase };
  setTimeout(()=>buildCase(activeSymbol(), { persist: false }), 900);
})();
