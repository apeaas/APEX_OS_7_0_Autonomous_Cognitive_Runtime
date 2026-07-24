"use strict";

(() => {
  const $ = selector => document.querySelector(selector);
  const byId = id => document.getElementById(id);
  const history = [];
  const pending = new Map();
  let health = { ok: false, configured: false, model: "—" };
  let listening = false;
  let recognition = null;
  let armed = sessionStorage.getItem("apex-ai-paper-armed") === "true";
  let speakEnabled = localStorage.getItem("apex-ai-speak") === "true";
  let lastResponse = "";

  const SAFE_IMMEDIATE = new Set([
    "navigate_platform", "focus_asset", "refresh_market_reading", "open_evidence",
    "create_case", "prepare_paper_trade", "set_watchlist", "export_system_memory",
    "inspect_runtime", "query_system_memory", "create_plan", "manage_plan",
    "emergency_stop", "export_runtime_state"
  ]);

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindUI();
    setupVoice();
    await checkHealth();
    refreshStatus();
    emit("AI_COMMAND_RUNTIME_READY", {
      configured: health.configured,
      model: health.model,
      voiceInput: Boolean(recognition),
      voiceOutput: "speechSynthesis" in window,
      paperArmed: armed,
      externalAccounts: false,
    }, { source: "AI_COMMAND", category: "system", severity: health.configured ? "success" : "warning" });
  }

  function bindUI() {
    byId("aiCommandPill")?.addEventListener("click", toggleArmed);
    byId("aiArmBtn")?.addEventListener("click", toggleArmed);
    byId("aiSpeakBtn")?.addEventListener("click", () => {
      speakEnabled = !speakEnabled;
      localStorage.setItem("apex-ai-speak", String(speakEnabled));
      refreshStatus();
      toast(speakEnabled ? "Respuesta hablada activada" : "Respuesta hablada desactivada");
    });
    ["aiMicBtn", "cockpitMicBtn", "paletteMicBtn", "chatMicProxy"].forEach(id => byId(id)?.addEventListener("click", toggleListening));
    byId("aiCommandLauncher")?.addEventListener("click", openPalette);
    byId("closeAiPalette")?.addEventListener("click", closePalette);
    byId("aiPaletteSend")?.addEventListener("click", sendPalette);
    byId("aiPaletteInput")?.addEventListener("keydown", event => {
      if (event.key === "Enter") sendPalette();
    });
    byId("aiCommandPalette")?.addEventListener("click", event => {
      if (event.target === byId("aiCommandPalette")) closePalette();
    });
    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
      if (event.key === "Escape") closePalette();
    });
    document.addEventListener("click", event => {
      const confirmButton = event.target.closest("[data-ai-confirm]");
      if (confirmButton) confirmAction(confirmButton.dataset.aiConfirm);
      const cancelButton = event.target.closest("[data-ai-cancel]");
      if (cancelButton) cancelAction(cancelButton.dataset.aiCancel);
    });
  }

  async function checkHealth() {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      health = await response.json();
      health.ok = response.ok && health.ok;
    } catch {
      health = { ok: false, configured: false, model: "offline" };
    }
  }

  async function ask(prompt, options = {}) {
    const clean = String(prompt || "").trim();
    if (!clean) return { text: "" };

    if (isConfirmation(clean)) {
      const action = [...pending.values()][0];
      if (!action) return reply("No hay ninguna acción pendiente para confirmar.");
      return confirmAction(action.id);
    }
    if (isCancellation(clean)) {
      const action = [...pending.values()][0];
      if (!action) return reply("No hay ninguna acción pendiente para cancelar.");
      return cancelAction(action.id);
    }

    if (!options.userAlreadyAdded) appendChat("user", clean);
    remember("user", clean);
    setThinking(true);
    emit("AI_COMMAND_REQUESTED", {
      prompt: clean,
      configured: health.configured,
      paperArmed: armed,
    }, { source: "USER", category: "dialogue", severity: "info" });

    try {
      if (!health.ok || !health.configured) {
        const local = window.APEX_API?.localResponse?.(clean) || "El runtime de IA todavía no está configurado. Puedo mantener la lectura local básica, pero para inteligencia real necesitás iniciar el backend con OPENAI_API_KEY.";
        const suffix = health.ok
          ? "\n\nRuntime local activo, pero falta OPENAI_API_KEY en .env."
          : "\n\nAbrí APEX con start_apex.bat o start_apex.sh; el archivo abierto directamente no puede acceder al backend seguro.";
        return reply(local + suffix, { severity: "warning" });
      }

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: clean,
          state: window.APEX_API?.getCommandSnapshot?.() || {},
          history: history.slice(0, -1),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || `AI Runtime ${response.status}`);

      reply(data.text || "Procesé la solicitud.");
      emit("AI_RESPONSE_RECEIVED", {
        requestId: data.requestId,
        model: data.model,
        actionCount: data.actions?.length || 0,
      }, { source: "AI_COMMAND", category: "dialogue", severity: "success" });

      for (const action of data.actions || []) {
        action.id ||= crypto.randomUUID();
        emit("AI_ACTION_PROPOSED", action, {
          source: "AI_COMMAND", category: "command",
          severity: action.requiresConfirmation ? "warning" : "info",
          symbol: action.arguments?.symbol,
        });
        if (action.requiresConfirmation || !SAFE_IMMEDIATE.has(action.name)) queueAction(action);
        else await executeAction(action, { confirmed: false });
      }
      return data;
    } catch (error) {
      const local = window.APEX_API?.localResponse?.(clean);
      const message = `No pude conectar con la IA real: ${error.message}.${local ? `\n\nLectura local de respaldo: ${local}` : ""}`;
      return reply(message, { severity: "error" });
    } finally {
      setThinking(false);
    }
  }

  function reply(text, options = {}) {
    const clean = String(text || "").trim();
    appendChat("apex", clean);
    remember("assistant", clean);
    lastResponse = clean;
    setText("aiPaletteResponse", clean);
    setText("cockpitChatAiPreview", clean);
    if (speakEnabled && options.speak !== false) speak(clean);
    if (options.severity) emit("AI_LOCAL_RESPONSE", { text: clean }, { source: "AI_COMMAND", category: "dialogue", severity: options.severity });
    setThinking(false);
    return { text: clean };
  }

  function queueAction(action) {
    pending.set(action.id, action);
    renderPending();
    if (!armed) {
      toast("Acción preparada. Armá PAPER COMMAND para poder confirmarla.");
    }
  }

  async function confirmAction(id) {
    const action = pending.get(id);
    if (!action) return reply("Esa acción ya no está pendiente.", { speak: false });
    if (!armed) {
      openOperations();
      toast("Primero armá PAPER COMMAND. El comando no fue ejecutado.");
      return { ok: false, reason: "not_armed" };
    }
    pending.delete(id);
    renderPending();
    emit("AI_ACTION_CONFIRMED", action, { source: "USER", category: "command", severity: "warning", symbol: action.arguments?.symbol });
    return executeAction(action, { confirmed: true });
  }

  function cancelAction(id) {
    const action = pending.get(id);
    if (!action) return { ok: false };
    pending.delete(id);
    renderPending();
    emit("AI_ACTION_CANCELLED", action, { source: "USER", category: "command", severity: "info", symbol: action.arguments?.symbol });
    return reply(`Cancelado: ${action.summary}.`, { speak: false });
  }

  async function executeAction(action, context = {}) {
    const api = window.APEX_API;
    if (!api) return reply("APEX_API todavía no está disponible.", { severity: "error" });
    const args = action.arguments || {};
    let result;

    try {
      if (action.allowedInMode === false) throw new Error(`La acción ${action.name} no está permitida en el modo cognitivo actual.`);
      switch (action.name) {
        case "navigate_platform": result = navigate(args.workspace, args.target); break;
        case "focus_asset": result = api.commandFocusAsset(args.symbol); break;
        case "refresh_market_reading": result = api.commandRefreshReading(args.symbol); break;
        case "open_evidence": result = api.commandOpenEvidence(args.symbol); break;
        case "create_case": result = api.commandCreateCase(args.symbol, args.objective); break;
        case "prepare_paper_trade": result = api.commandPreparePaperTrade(args); break;
        case "execute_paper_trade": result = api.commandExecutePaperTrade(args); break;
        case "close_paper_position": result = api.commandClosePaperPosition(args); break;
        case "modify_paper_position": result = api.commandModifyPaperPosition(args); break;
        case "set_agent_state": result = api.commandSetAgentState(args.agent_id, args.active); break;
        case "set_watchlist": result = api.commandSetWatchlist(args.symbol, args.watching); break;
        case "run_governance_audit": result = api.commandRunGovernanceAudit(args.reason); break;
        case "export_system_memory": result = api.commandExportMemory(); break;
        default: {
          result = await window.APEX_RUNTIME?.executeCommandAction?.(action);
          if (!result) throw new Error(`Herramienta no registrada: ${action.name}`);
        }
      }
      const normalized = result && typeof result.then === "function" ? await result : result;
      if (normalized?.ok === false) throw new Error(normalized.message || "La validación determinística rechazó la acción.");
      emit("AI_ACTION_EXECUTED", {
        ...action,
        confirmed: Boolean(context.confirmed),
        result: normalized || { ok: true },
        executionMode: "PAPER_ONLY",
      }, { source: "AI_COMMAND", category: "command", severity: "success", symbol: args.symbol, correlationId: normalized?.tradeId || action.id });
      const message = normalized?.message || `Hecho: ${action.summary}.`;
      reply(message, { speak: true });
      return normalized || { ok: true, message };
    } catch (error) {
      emit("AI_ACTION_REJECTED", { ...action, reason: error.message }, { source: "RISK", category: "command", severity: "error", symbol: args.symbol });
      return reply(`No ejecuté la acción: ${error.message}`, { severity: "error" });
    }
  }

  function navigate(workspace, target) {
    if (workspace === "mission") {
      document.querySelector("[data-close-panel]")?.click();
      byId("decision")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return { ok: true, message: "Volví a Mission Control." };
    }
    const panel = workspace === "memory" ? "operations" : workspace;
    document.querySelector(`[data-open-panel="${panel}"]`)?.click();
    setTimeout(() => {
      if (workspace === "memory") byId("eventBusPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (target) byId(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 260);
    return { ok: true, message: `Abrí ${workspace}.` };
  }

  function toggleArmed() {
    if (!armed && (!health.ok || !health.configured)) {
      toast(health.ok ? "Configurá OPENAI_API_KEY antes de armar PAPER COMMAND." : "Iniciá APEX mediante el backend local antes de armar comandos.");
      return;
    }
    armed = !armed;
    sessionStorage.setItem("apex-ai-paper-armed", String(armed));
    refreshStatus();
    emit(armed ? "AI_PAPER_COMMAND_ARMED" : "AI_PAPER_COMMAND_DISARMED", {
      armed,
      executionMode: "PAPER_ONLY",
      pendingActions: pending.size,
    }, { source: "USER", category: "governance", severity: armed ? "warning" : "success" });
    toast(armed ? "PAPER COMMAND armado. Toda acción sensible sigue requiriendo confirmación." : "PAPER COMMAND desarmado.");
  }

  function renderPending() {
    const holder = byId("aiPendingActions");
    if (!holder) return;
    if (!pending.size) {
      holder.innerHTML = '<div class="ai-pending-empty">Sin acciones pendientes.</div>';
      return;
    }
    holder.innerHTML = [...pending.values()].map(action => `
      <article class="ai-action-card">
        <div><span>${escapeHtml(action.riskLevel || "command")}</span><strong>${escapeHtml(action.summary)}</strong><small>La IA propuso esta acción; todavía no fue ejecutada.</small></div>
        <div class="ai-action-buttons">
          <button class="btn primary" data-ai-confirm="${escapeHtml(action.id)}">Confirmar</button>
          <button class="btn secondary" data-ai-cancel="${escapeHtml(action.id)}">Cancelar</button>
        </div>
      </article>`).join("");
  }

  function setupVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    recognition = new Recognition();
    recognition.lang = "es-AR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => { listening = true; refreshStatus(); toast("Escuchando..."); };
    recognition.onend = () => { listening = false; refreshStatus(); };
    recognition.onerror = event => { listening = false; refreshStatus(); toast(`Voz: ${event.error}`); };
    recognition.onresult = event => {
      const transcript = [...event.results].map(result => result[0].transcript).join(" ").trim();
      const final = event.results[event.results.length - 1]?.isFinal;
      ["chatInput", "cockpitChatInput", "aiPaletteInput"].forEach(id => {
        const input = byId(id);
        if (input && (document.activeElement === input || !document.activeElement?.matches?.("input,textarea"))) input.value = transcript;
      });
      setText("voiceTranscript", transcript || "Escuchando...");
      if (final && transcript) {
        openOperations();
        const input = byId("chatInput");
        if (input) input.value = transcript;
        setTimeout(() => byId("sendChatBtn")?.click(), 120);
        closePalette();
      }
    };
  }

  function toggleListening() {
    if (!recognition) {
      toast("El dictado requiere Chrome/Edge con Web Speech API.");
      return;
    }
    if (listening) recognition.stop();
    else recognition.start();
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(stripForSpeech(text));
    utterance.lang = "es-AR";
    utterance.rate = 1.02;
    utterance.pitch = 0.92;
    speechSynthesis.speak(utterance);
  }

  function openPalette() {
    byId("aiCommandPalette")?.classList.remove("hidden");
    setTimeout(() => byId("aiPaletteInput")?.focus(), 60);
  }
  function closePalette() { byId("aiCommandPalette")?.classList.add("hidden"); }
  function sendPalette() {
    const input = byId("aiPaletteInput");
    const prompt = input?.value.trim();
    if (!prompt) return;
    input.value = "";
    openOperations();
    const chat = byId("chatInput");
    if (chat) chat.value = prompt;
    setTimeout(() => byId("sendChatBtn")?.click(), 160);
    closePalette();
  }

  function openOperations() { document.querySelector('[data-open-panel="operations"]')?.click(); }

  function refreshStatus() {
    const online = health.ok && health.configured;
    const label = online ? (armed ? "AI · PAPER ARMED" : "AI · ANALYSIS") : health.ok ? "AI · KEY REQUIRED" : "AI · OFFLINE";
    ["aiCommandPill", "aiRuntimeState"].forEach(id => setText(id, label));
    const pill = byId("aiCommandPill");
    pill?.classList.toggle("armed", online && armed);
    pill?.classList.toggle("offline", !online);
    setText("aiModelName", health.model || "—");
    setText("aiArmBtn", armed ? "Desarmar PAPER" : "Armar PAPER");
    setText("aiSpeakBtn", speakEnabled ? "Voz ON" : "Voz OFF");
    ["aiMicBtn", "cockpitMicBtn", "paletteMicBtn", "chatMicProxy"].forEach(id => byId(id)?.classList.toggle("listening", listening));
  }

  function setThinking(active) {
    setText("chatStatus", active ? "THINKING" : "READY");
    setText("aiRuntimePulse", active ? "RAZONANDO" : health.configured ? "ONLINE" : "LOCAL");
    document.body.classList.toggle("ai-thinking", active);
  }

  function appendChat(role, text) {
    if (window.APEX_API?.appendChat) return window.APEX_API.appendChat(role, text);
    const holder = byId("chatMessages");
    if (!holder) return;
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    bubble.innerHTML = `<strong>${role === "apex" ? "APEX" : "Usuario"}</strong><p>${escapeHtml(text)}</p>`;
    holder.prepend(bubble);
  }

  function remember(role, content) {
    history.push({ role, content });
    if (history.length > 16) history.splice(0, history.length - 16);
  }

  function isConfirmation(value) { return /^(confirmo|confirmar|sí,? confirmo|si,? confirmo|ejecutá|ejecuta|dale)$/i.test(value.trim()); }
  function isCancellation(value) { return /^(cancelar|cancelá|cancela|no,? cancelar|abortá|aborta)$/i.test(value.trim()); }

  function emit(type, payload, meta) { try { return window.APEX_EVENT_BUS?.emit(type, payload, meta); } catch { return null; } }
  function toast(message) {
    const el = byId("apexToast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
  }
  function setText(id, value) { const el = byId(id); if (el) el.textContent = value; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
  function stripForSpeech(text) { return String(text).replace(/[`*_#>]/g, "").replace(/\s+/g, " ").slice(0, 1200); }

  window.APEX_AI = {
    ask,
    confirmAction,
    cancelAction,
    executeAction,
    getStatus: () => ({ health: { ...health }, armed, speakEnabled, pending: [...pending.values()], lastResponse }),
    open: openPalette,
  };
})();
