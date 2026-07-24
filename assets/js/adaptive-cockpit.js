"use strict";

/* APEX Quantum Architecture II · Adaptive Cockpit */
document.addEventListener("DOMContentLoaded", () => {
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const byId = id => document.getElementById(id);

  const panels = qa("[data-panel]");
  const placeholder = byId("workspacePlaceholder");
  const toast = byId("apexToast");
  let toastTimer = null;
  let currentPanel = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function setNavState(panelName, preferredButton = null) {
    const navButtons = qa(".nav-btn");
    const chosen = preferredButton?.classList?.contains("nav-btn")
      ? preferredButton
      : panelName
        ? navButtons.find(button => button.dataset.openPanel === panelName)
        : navButtons.find(button => button.dataset.focus === "decision");
    navButtons.forEach(button => button.classList.toggle("active", button === chosen));
  }

  function openPanel(panelName, options = {}) {
    const target = panels.find(panel => panel.dataset.panel === panelName);
    if (!target) return;

    panels.forEach(panel => {
      const isTarget = panel === target;
      panel.classList.toggle("is-hidden", !isTarget);
      panel.setAttribute("aria-hidden", String(!isTarget));
    });

    placeholder?.classList.add("is-hidden");
    currentPanel = panelName;
    localStorage.setItem("apex-active-workspace", panelName);
    setNavState(panelName, options.navButton || null);

    target.classList.add("is-entering");
    requestAnimationFrame(() => requestAnimationFrame(() => target.classList.remove("is-entering")));

    const scrollTargetId = options.scrollTarget;
    const scrollTarget = scrollTargetId ? byId(scrollTargetId) : target;
    setTimeout(() => scrollTarget?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);

    const title = q(".detail-header h2", target)?.textContent || "Espacio de trabajo";
    if (options.announce !== false) showToast(`${title} abierto. Mission Control mantiene el resto en síntesis.`);
  }

  function closePanels({ scroll = true, announce = true } = {}) {
    panels.forEach(panel => {
      panel.classList.add("is-hidden");
      panel.setAttribute("aria-hidden", "true");
    });
    placeholder?.classList.remove("is-hidden");
    currentPanel = null;
    localStorage.removeItem("apex-active-workspace");
    setNavState(null);
    if (scroll) byId("decision")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (announce) showToast("Volviste al modo síntesis.");
  }

  qa("[data-open-panel]").forEach(button => {
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", event => {
      const panelName = button.dataset.openPanel;
      qa("[data-open-panel]").forEach(other => other.setAttribute("aria-expanded", String(other.dataset.openPanel === panelName)));
      openPanel(panelName, {
        scrollTarget: button.dataset.scrollTarget,
        navButton: button.classList.contains("nav-btn") ? button : null
      });
      event.stopPropagation();
    });
  });

  qa("[data-close-panel]").forEach(button => button.addEventListener("click", () => closePanels()));

  // Mission Control always starts quiet. The last workspace is remembered only during the same browser session.
  const remembered = sessionStorage.getItem("apex-session-workspace");
  if (remembered && panels.some(panel => panel.dataset.panel === remembered)) {
    openPanel(remembered, { scrollTarget: null, announce: false });
  } else {
    closePanels({ scroll: false, announce: false });
  }

  window.addEventListener("beforeunload", () => {
    if (currentPanel) sessionStorage.setItem("apex-session-workspace", currentPanel);
    else sessionStorage.removeItem("apex-session-workspace");
  });

  function text(id, fallback = "—") {
    return byId(id)?.textContent?.trim() || fallback;
  }

  function setText(id, value) {
    const element = byId(id);
    if (element && value !== undefined && value !== null) element.textContent = value;
  }

  function numericPercent(value) {
    return Number(String(value || "0").replace(/[^0-9.-]/g, "")) || 0;
  }

  function updateModuleState(element, label, type = "neutral") {
    if (!element) return;
    element.textContent = label;
    element.classList.toggle("good-state", type === "good");
    element.style.color = type === "danger" ? "var(--red)" : "";
    element.style.borderColor = type === "danger" ? "rgba(255,102,125,.28)" : "";
    element.style.background = type === "danger" ? "rgba(255,102,125,.065)" : "";
  }

  function getApexState() {
    try { return window.APEX_API?.getState?.() || null; }
    catch { return null; }
  }

  function syncCockpit() {
    const state = getApexState();
    const decision = state?.decision || null;
    const strategies = state?.strategies ? Object.values(state.strategies).filter(Boolean) : [];
    const relevantCases = strategies.filter(plan => plan.verdict !== "NO TRADE");
    const validCases = strategies.filter(plan => plan.verdict === "SETUP VÁLIDO");

    setText("summaryHunterCount", String(relevantCases.length));
    if (decision) {
      const symbolLabel = window.APEX_API?.getSymbolLabel?.(decision.symbol) || decision.symbol;
      const hunterCopy = decision.verdict === "SETUP VÁLIDO"
        ? `${symbolLabel} lidera el radar con ${decision.confidence}% de confianza.`
        : decision.verdict === "EN OBSERVACIÓN"
          ? `${symbolLabel} es el mejor caso, pero todavía exige confirmación.`
          : "El radar no encontró una ventaja suficiente para operar.";
      setText("summaryHunterBest", hunterCopy);
      setText("summaryHunterTitle", validCases.length ? "Oportunidad detectada" : "Radar activo");

      const briefing = decision.verdict === "SETUP VÁLIDO"
        ? `El Cazador encontró ${validCases.length} caso${validCases.length === 1 ? "" : "s"} operable${validCases.length === 1 ? "" : "s"}. El mejor está listo para revisión paper; Risk y Governance conservan veto.`
        : decision.verdict === "EN OBSERVACIÓN"
          ? `APEX está siguiendo ${relevantCases.length} caso${relevantCases.length === 1 ? "" : "s"}. Ninguno justifica elevar exposición todavía.`
          : "El comité no encontró ventaja suficiente. No operar también es una decisión activa de protección.";
      setText("proactiveBriefing", briefing);

      setText("marketPulseState", decision.verdict === "SETUP VÁLIDO" ? "Oportunidad selectiva" : decision.verdict === "NO TRADE" ? "Sin ventaja operable" : "Confirmación pendiente");
      setText("riskPulseState", decision.risk === "Alto" ? "Vigilancia elevada" : decision.risk === "Moderado" ? "Control moderado" : "Dentro de límites");

      const commandLabel = decision.risk === "Alto"
        ? "APEX EN MODO PROTECCIÓN"
        : decision.verdict === "SETUP VÁLIDO"
          ? "APEX DETECTÓ UNA OPORTUNIDAD"
          : "APEX OPERANDO NORMAL";
      setText("commandState", commandLabel);
    }

    setText("summaryCaseId", text("caseId", "CASE-0001"));
    setText("summaryCaseAsset", text("caseAsset", "ETH/USDT"));
    setText("summaryConsensus", text("caseConsensus", "—"));
    setText("summaryFiscal", text("prosecutorVerdict", "En revisión").toLocaleLowerCase("es-AR"));
    setText("prosecutorVerdictSummary", text("prosecutorVerdict", "En revisión"));
    setText("historySimilaritySummary", text("historySimilarity", "—"));
    setText("deliberationStateSummary", text("deliberationState", "Deliberando"));

    const caseStatus = text("caseStatus", "EN ANÁLISIS");
    updateModuleState(byId("summaryThinkingState"), caseStatus.replace("CASO ", ""), caseStatus.includes("APROBADO") ? "good" : caseStatus.includes("RECHAZADO") ? "danger" : "neutral");

    const autonomy = text("autonomyPercent", "5%");
    const trust = text("trustScore", "84/100");
    const autonomyState = text("autonomyState", "Habilitada en paper");
    setText("summaryAutonomy", autonomy);
    setText("summaryTrust", trust);
    setText("summaryLicense", autonomyState);

    const trustValue = numericPercent(trust);
    updateModuleState(
      byId("summaryGovernanceState"),
      autonomyState.toUpperCase().includes("SUSPENDIDA") ? "SUSPENDIDA" : autonomyState.toUpperCase().includes("REDUCIDA") ? "REDUCIDA" : "NORMAL",
      autonomyState.toUpperCase().includes("SUSPENDIDA") ? "danger" : trustValue >= 82 ? "good" : "neutral"
    );

    setText("summaryEquity", text("equityValue", "US$ 25.000"));
    setText("summaryExposure", text("exposureValue", "0%"));
    setText("summaryPnl", text("realizedValue", "US$ 0"));
    setText("portfolioSummaryLine", numericPercent(text("exposureValue", "0%")) > 0 ? `Exposición ${text("exposureValue")}` : "Sin exposición");

    const journalFirst = q("#decisionJournal > div:first-child");
    if (journalFirst) {
      const journalTitle = q("strong", journalFirst)?.textContent || "Última decisión registrada";
      setText("journalSummary", journalTitle.length > 42 ? `${journalTitle.slice(0, 39)}…` : journalTitle);
    }

    const now = new Date();
    setText("commandLastSync", `Síntesis ${now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`);
    setText("coreSynthesisLabel", "Última síntesis: ahora");
  }

  const syncTargets = [
    "decisionTitle", "focusAsset", "focusConfidence", "focusRisk", "caseId", "caseAsset", "caseConsensus",
    "caseStatus", "prosecutorVerdict", "historySimilarity", "deliberationState", "autonomyPercent", "trustScore",
    "autonomyState", "equityValue", "exposureValue", "realizedValue", "decisionJournal"
  ].map(byId).filter(Boolean);

  const observer = new MutationObserver(() => syncCockpit());
  syncTargets.forEach(target => observer.observe(target, { childList: true, subtree: true, characterData: true }));

  setInterval(syncCockpit, 1200);
  setTimeout(syncCockpit, 250);
  setTimeout(syncCockpit, 1200);

  qa("[data-chat-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      const input = byId("chatInput");
      if (!input) return;
      input.value = button.dataset.chatPrompt || "";
      input.focus();
      showToast("Pregunta cargada. Editala o enviala.");
    });
  });

  byId("askApexBtn")?.addEventListener("click", () => {
    openPanel("operations");
    setTimeout(() => byId("chatInput")?.focus(), 420);
  });

  byId("evidenceAskBtn")?.addEventListener("click", () => {
    setTimeout(() => {
      openPanel("operations");
      byId("chatInput")?.focus();
    }, 120);
  });

  byId("runAuditBtn")?.addEventListener("click", () => {
    showToast("Governance ejecutó una autoauditoría conservadora.");
    setTimeout(syncCockpit, 80);
  });

  byId("buildCaseBtn")?.addEventListener("click", () => {
    showToast("Nuevo expediente construido y enviado al Fiscal.");
    setTimeout(syncCockpit, 80);
  });

  byId("refreshDecisionBtn")?.addEventListener("click", () => {
    const label = byId("commandLastSync");
    label?.classList.add("is-refreshing");
    showToast("Lectura de Mission Control actualizada.");
    setTimeout(() => label?.classList.remove("is-refreshing"), 500);
  });

  document.addEventListener("keydown", event => {
    const active = document.activeElement;
    const isTyping = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);

    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      openPanel("operations");
      setTimeout(() => byId("chatInput")?.focus(), 260);
    }

    if (event.key === "Escape" && currentPanel && !document.body.classList.contains("modal-open")) {
      closePanels();
    }
  });

  let disclosureReady = false;
  setTimeout(() => { disclosureReady = true; }, 700);
  qa("details").forEach(detail => {
    detail.addEventListener("toggle", () => {
      if (!disclosureReady) return;
      if (detail.open) {
        const title = q("summary strong", detail)?.textContent;
        if (title) showToast(`${title}: detalle desplegado.`);
      }
    });
  });
});
