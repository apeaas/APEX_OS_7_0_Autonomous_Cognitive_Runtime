"use strict";

/* APEX Quantum Rebirth · Living Cockpit
   Presentation intelligence only. Trading logic remains in app.js. */

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const symbolMeta = {
    BTCUSDT: { key: "BTC", label: "BTC/USDT" },
    ETHUSDT: { key: "ETH", label: "ETH/USDT" },
    SOLUSDT: { key: "SOL", label: "SOL/USDT" }
  };

  const engineScripts = {
    engineOpportunityActivity: [
      "Escaneando universo...",
      "Filtrando volumen anómalo...",
      "Priorizando candidatos líquidos...",
      "Buscando asimetrías..."
    ],
    engineFeedActivity: [
      "Interpretando régimen...",
      "Cruzando contexto y precio...",
      "Validando calidad del feed...",
      "Actualizando narrativa de mercado..."
    ],
    engineRiskActivity: [
      "Auditando límites...",
      "Revisando correlaciones...",
      "Sin veto duro activo.",
      "Protegiendo presupuesto de riesgo..."
    ],
    engineStrategyActivity: [
      "Comparando horizontes...",
      "Probando confirmaciones...",
      "Fiscal interrogando la tesis...",
      "Esperando convergencia..."
    ],
    enginePortfolioActivity: [
      "Sin concentración crítica.",
      "Calculando exposición neta...",
      "Equity sincronizada.",
      "Evaluando capacidad disponible..."
    ],
    engineGovernanceActivity: [
      "Autoauditoría activa...",
      "Trust Score estable.",
      "Licencia paper verificada.",
      "Revisando trazabilidad..."
    ]
  };

  const activityWords = ["OBSERVANDO", "SINTETIZANDO", "DELIBERANDO", "AUDITANDO", "BUSCANDO"];
  let engineTick = 0;
  let packetCount = Number(sessionStorage.getItem("apex-living-packets") || 0);

  function state() {
    try { return window.APEX_API?.getState?.() || null; }
    catch { return null; }
  }

  function analysis(symbol) {
    try { return window.APEX_API?.getAnalysis?.(symbol) || null; }
    catch { return null; }
  }

  function setText(id, value) {
    const el = byId(id);
    if (el && value !== undefined && value !== null) el.textContent = String(value);
  }

  function number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function price(value) {
    const n = number(value);
    if (!n) return "—";
    const digits = n >= 1000 ? 2 : n >= 10 ? 2 : 3;
    return n.toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function pct(value) {
    const n = number(value);
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  }

  function money(value) {
    return `US$ ${number(value).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
  }

  function sparkPath(values) {
    const usable = (values || []).filter(Number.isFinite).slice(-55);
    if (usable.length < 2) return "M0 24 L240 24";
    const min = Math.min(...usable);
    const max = Math.max(...usable);
    const range = Math.max(max - min, Math.abs(max) * .0001, 1e-9);
    return usable.map((value, index) => {
      const x = index / (usable.length - 1) * 240;
      const y = 42 - ((value - min) / range) * 35;
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  }

  function updateMarkets(snapshot) {
    Object.entries(symbolMeta).forEach(([symbol, meta]) => {
      const data = snapshot?.symbols?.[symbol];
      const a = analysis(symbol);
      setText(`cockpit${meta.key}Price`, price(data?.price));
      const changeEl = byId(`cockpit${meta.key}Change`);
      if (changeEl) {
        changeEl.textContent = data ? pct(data.change) : "—";
        changeEl.classList.toggle("positive", number(data?.change) >= 0);
        changeEl.classList.toggle("negative", number(data?.change) < 0);
      }
      setText(`cockpit${meta.key}Trend`, a ? `${a.trendLabel} · ${a.regime}` : "Analizando");
      setText(`cockpit${meta.key}Rsi`, a ? number(a.rsi14).toFixed(1) : "—");
      setText(`cockpit${meta.key}Atr`, a ? `${number(a.atrPct).toFixed(2)}%` : "—");
      setText(`cockpit${meta.key}Vol`, a ? `x${number(a.volumeRatio, 1).toFixed(2)}` : "—");
      const path = byId(`cockpit${meta.key}Spark`);
      if (path) path.setAttribute("d", sparkPath(snapshot?.marketHistory?.[symbol]));
    });
  }

  function alertRow(signal, title, detail, time = "ahora") {
    return `<div><span class="alert-signal ${signal}-signal"></span><p><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></p><time>${escapeHtml(time)}</time></div>`;
  }

  function updateAlerts(snapshot) {
    const holder = byId("cockpitAlerts");
    if (!holder) return;
    const rows = [];
    const decision = snapshot?.decision;
    if (decision) {
      const label = window.APEX_API?.getSymbolLabel?.(decision.symbol) || decision.symbol;
      if (decision.verdict === "SETUP VÁLIDO") rows.push(alertRow("green", `${label} supera el umbral`, `${decision.confidence}% de confianza · revisión paper`, "live"));
      else if (decision.verdict === "EN OBSERVACIÓN") rows.push(alertRow("blue", `${label} en observación`, "Falta confirmación antes de elevar exposición", "live"));
      else rows.push(alertRow("amber", "Sin ventaja operable", "APEX conserva capital y continúa buscando", "live"));
    }

    Object.keys(symbolMeta).forEach(symbol => {
      const a = analysis(symbol);
      if (!a) return;
      const label = symbolMeta[symbol].label;
      if (a.volumeRatio >= 1.15) rows.push(alertRow("green", `${label} volumen inusual`, `Ratio x${a.volumeRatio.toFixed(2)} · ${a.regime}`, "2m"));
      if (a.riskLabel === "Alto") rows.push(alertRow("red", `${label} riesgo elevado`, `ATR ${a.atrPct.toFixed(2)}% · veto bajo revisión`, "4m"));
      else if (a.confidence >= 76) rows.push(alertRow("blue", `${label} caso competitivo`, `${a.confidence}% · ${a.trendLabel}`, "5m"));
    });

    const unique = rows.filter((row, index, all) => all.indexOf(row) === index).slice(0, 5);
    holder.innerHTML = unique.length ? unique.join("") : alertRow("blue", "Radar activo", "Esperando suficiente historial para clasificar", "ahora");
  }

  function updateStrategies(snapshot) {
    ["scalp", "intraday", "swing"].forEach(key => {
      const row = q(`[data-strategy-row="${key}"]`);
      const plan = snapshot?.strategies?.[key];
      if (!row || !plan) return;
      const cells = row.children;
      const label = window.APEX_API?.getSymbolLabel?.(plan.symbol) || plan.symbol || key;
      cells[0].textContent = `${key === "scalp" ? "Scalp" : key === "intraday" ? "Intraday" : "Swing"} ${label.split("/")[0]}`;
      cells[1].textContent = key === "scalp" ? "1m" : key === "intraday" ? "15m" : "4h";
      cells[2].textContent = plan.bias || plan.signal || (plan.verdict === "SETUP VÁLIDO" ? "LONG" : "NEUTRAL");
      cells[3].textContent = `${number(plan.confidence)}%`;
      cells[4].textContent = plan.verdict || "Analizando";
      row.classList.toggle("approved", plan.verdict === "SETUP VÁLIDO");
      row.classList.toggle("rejected", plan.verdict === "NO TRADE");
    });
  }

  function updatePositions(snapshot) {
    const holder = byId("cockpitPositions");
    if (!holder) return;
    const positions = snapshot?.portfolio?.positions || [];
    if (!positions.length) {
      holder.innerHTML = '<div class="empty-instrument">Sin posiciones paper abiertas. Capital disponible.</div>';
      return;
    }
    holder.innerHTML = positions.slice(0, 3).map(pos => {
      const current = snapshot?.symbols?.[pos.symbol]?.price || pos.entry;
      const pnl = (number(current) - number(pos.entry)) * number(pos.qty);
      return `<div class="cockpit-position-item"><strong>${escapeHtml(window.APEX_API?.getSymbolLabel?.(pos.symbol) || pos.symbol)}</strong><span>Entrada ${price(pos.entry)}</span><em class="${pnl < 0 ? "bad" : "good"}">${money(pnl)}</em></div>`;
    }).join("");
  }

  function updateActivity() {
    const source = byId("activityLog");
    const holder = byId("cockpitActivity");
    if (!holder) return;
    const sourceRows = source ? qa(".log-entry", source).slice(0, 3) : [];
    if (sourceRows.length) {
      holder.innerHTML = sourceRows.map(row => {
        const time = q(".log-time", row)?.textContent || "ahora";
        const title = q(".log-body strong", row)?.textContent || "Evento APEX";
        const detail = q(".log-body span", row)?.textContent || "Trazabilidad registrada";
        return `<div class="cockpit-activity-item"><time>${escapeHtml(time)}</time><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>`;
      }).join("");
    } else {
      holder.innerHTML = [
        ["ahora", "Core activo", "Síntesis de mercado en curso"],
        ["-1m", "Governance", "Licencia paper verificada"],
        ["-2m", "Hunter", "Radar cuantitativo operativo"]
      ].map(([time, title, detail]) => `<div class="cockpit-activity-item"><time>${time}</time><strong>${title}</strong><small>${detail}</small></div>`).join("");
    }
  }

  function updateEngineSpeech(snapshot) {
    engineTick += 1;
    Object.entries(engineScripts).forEach(([id, lines], index) => {
      const el = byId(id);
      if (!el) return;
      const phase = Math.floor(engineTick / (2 + (index % 3))) + index;
      let line = lines[phase % lines.length];
      if (id === "enginePortfolioActivity") line = number(snapshot?.portfolio?.positions?.length) ? `${snapshot.portfolio.positions.length} posiciones bajo control.` : lines[phase % lines.length];
      if (id === "engineOpportunityActivity" && snapshot?.decision?.verdict === "SETUP VÁLIDO") line = `${window.APEX_API?.getSymbolLabel?.(snapshot.decision.symbol) || snapshot.decision.symbol}: caso elevado.`;
      el.textContent = line;
      el.closest(".engine-instrument")?.classList.add("speaking");
      setTimeout(() => el.closest(".engine-instrument")?.classList.remove("speaking"), 520);
    });
    setText("coreActivityWord", activityWords[engineTick % activityWords.length]);
    setText("coreMicroState", activityWords[(engineTick + 1) % activityWords.length]);
  }

  function updateCapital(snapshot) {
    if (!snapshot?.portfolio) return;
    setText("summaryPnl", money(snapshot.portfolio.realized));
    setText("summaryEquity", money(snapshot.portfolio.equity));
    const autonomy = byId("autonomyPercent")?.textContent || "5%";
    setText("summaryAutonomy", autonomy);
    const trust = byId("trustScore")?.textContent || "84/100";
    setText("summaryTrust", trust);
  }

  function sync() {
    const snapshot = state();
    updateMarkets(snapshot);
    updateAlerts(snapshot);
    updateStrategies(snapshot);
    updatePositions(snapshot);
    updateActivity();
    updateCapital(snapshot);
    const persistedEvents = window.APEX_EVENT_BUS?.stats?.().count;
    if (Number.isFinite(persistedEvents)) {
      packetCount = persistedEvents;
    } else {
      packetCount += snapshot?.feedStatus?.includes("LIVE") ? 3 : 1;
      sessionStorage.setItem("apex-living-packets", String(packetCount));
    }
    setText("corePackets", packetCount.toLocaleString("es-AR"));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function openOperationsWithPrompt(prompt) {
    const openButton = q('[data-open-panel="operations"]');
    openButton?.click();
    setTimeout(() => {
      const input = byId("chatInput");
      if (!input) return;
      input.value = prompt;
      input.focus();
      byId("sendChatBtn")?.click();
    }, 360);
  }

  byId("cockpitChatSend")?.addEventListener("click", () => {
    const input = byId("cockpitChatInput");
    const prompt = input?.value.trim();
    if (!prompt) {
      input?.focus();
      return;
    }
    openOperationsWithPrompt(prompt);
    input.value = "";
  });

  byId("cockpitChatInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") byId("cockpitChatSend")?.click();
  });

  // Canvas-driven motion: independent of CSS animation settings and resilient to reduced-motion OS preferences.
  const canvas = byId("livingCoreCanvas");
  const stage = byId("livingCoreStage");
  const core = byId("coreVisual");
  let ctx = canvas?.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastFrame = 0;

  const particles = Array.from({ length: 30 }, (_, i) => ({
    angle: (i / 30) * Math.PI * 2,
    radius: .24 + (i % 6) * .048,
    speed: .00014 + (i % 7) * .000018,
    size: 1.05 + (i % 4) * .42,
    phase: i * .74
  }));

  function resizeCanvas() {
    if (!canvas || !stage || !ctx) return;
    const rect = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function nodeCenters() {
    if (!stage) return [];
    const base = stage.getBoundingClientRect();
    return qa(".engine-instrument", stage).map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
    });
  }

  function draw(time) {
    if (!ctx || !canvas || !stage || !core) return;
    if (!width || !height) resizeCanvas();
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2 - 3;
    const minDim = Math.min(width, height);
    const confidence = Math.max(20, Math.min(100, Number((byId("coreCenterText")?.textContent || "70").replace(/\D/g, "")) || 70));
    const energy = confidence / 100;
    const pulse = 1 + Math.sin(time / 760) * .018 + Math.sin(time / 2600) * .012;
    core.style.setProperty("--core-pulse", pulse.toFixed(4));
    core.style.filter = `saturate(${(.92 + energy * .42).toFixed(2)}) brightness(${(.94 + energy * .18).toFixed(2)})`;

    const rings = qa(".ring", core);
    rings.forEach((ring, index) => {
      const direction = index % 2 ? -1 : 1;
      ring.style.transform = `rotate(${direction * time * (.006 + index * .0025)}deg)`;
    });

    // Energy field.
    const radial = ctx.createRadialGradient(cx, cy, minDim * .04, cx, cy, minDim * .48);
    radial.addColorStop(0, `rgba(68, 215, 255, ${.12 + energy * .08})`);
    radial.addColorStop(.42, `rgba(76, 87, 255, ${.065 + energy * .04})`);
    radial.addColorStop(1, "rgba(4, 8, 20, 0)");
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * .48, 0, Math.PI * 2);
    ctx.fill();

    // Connections to instruments.
    const nodes = nodeCenters();
    nodes.forEach((node, index) => {
      const gradient = ctx.createLinearGradient(cx, cy, node.x, node.y);
      gradient.addColorStop(0, `rgba(68, 215, 255, ${.19 + energy * .10})`);
      gradient.addColorStop(.58, "rgba(80, 118, 245, .12)");
      gradient.addColorStop(1, "rgba(80, 118, 245, .02)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(node.x, node.y);
      ctx.stroke();

      const travel = ((time * (.00012 + index * .000007)) + index * .16) % 1;
      const px = cx + (node.x - cx) * travel;
      const py = cy + (node.y - cy) * travel;
      ctx.fillStyle = index % 3 === 0 ? "rgba(73,229,170,.9)" : "rgba(78,203,255,.92)";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 1.6 + (index % 2) * .5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Orbiting information particles.
    particles.forEach((particle, index) => {
      const angle = particle.angle + time * particle.speed;
      const rx = width * particle.radius;
      const ry = height * (particle.radius * .62);
      const wobble = Math.sin(time / 1150 + particle.phase) * 4;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * ry + wobble;
      const alpha = .24 + .48 * (0.5 + 0.5 * Math.sin(time / 880 + particle.phase));
      ctx.fillStyle = index % 5 === 0 ? `rgba(174,124,255,${alpha})` : `rgba(68,215,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Periodic synthesis wave.
    const wave = (time % 3300) / 3300;
    ctx.strokeStyle = `rgba(78, 190, 255, ${(1 - wave) * .21})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * (.19 + wave * .32), 0, Math.PI * 2);
    ctx.stroke();

    lastFrame = time;
    requestAnimationFrame(draw);
  }

  if (canvas && stage && ctx) {
    resizeCanvas();
    new ResizeObserver(resizeCanvas).observe(stage);
    requestAnimationFrame(draw);
  }

  sync();
  updateEngineSpeech(state());
  setInterval(sync, 1200);
  setInterval(() => updateEngineSpeech(state()), 2700);

  const activitySource = byId("activityLog");
  if (activitySource) new MutationObserver(updateActivity).observe(activitySource, { childList: true, subtree: true, characterData: true });
});
