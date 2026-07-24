"use strict";

(() => {
  const byId = id => document.getElementById(id);
  const qs = selector => document.querySelector(selector);
  const clientId = localStorage.getItem("apex.runtime.clientId") || crypto.randomUUID();
  localStorage.setItem("apex.runtime.clientId", clientId);

  let runtime = null;
  let commands = null;
  let integrations = null;
  let syncing = false;
  let actionWorkerBusy = false;
  let lastMirroredEventId = sessionStorage.getItem("apex.runtime.lastMirroredEventId") || "";
  let protocolResolve = null;
  let realtime = { pc: null, dc: null, stream: null, connected: false };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    document.body.classList.add("apex-v7");
    injectTopbar();
    injectAutonomyRail();
    injectRuntimeWorkspace();
    injectProtocolModal();
    bindUI();
    bindEventMirror();
    await Promise.all([loadRuntime(), loadCommands(), loadIntegrations()]);
    renderAll();
    await syncSnapshot();
    setInterval(syncSnapshot, 10_000);
    setInterval(pollRuntime, 4_000);
    setInterval(processAutonomousQueue, 3_000);
    emit("COGNITIVE_RUNTIME_CLIENT_READY", { clientId, version: "7.0.0", executionMode: "PAPER_ONLY" }, { source: "COGNITIVE_RUNTIME", category: "system", severity: "success" });
  }

  function injectTopbar() {
    const center = qs(".topbar-center");
    if (!center || byId("runtimeTopPill")) return;
    const button = document.createElement("button");
    button.id = "runtimeTopPill";
    button.className = "pill runtime-top-pill";
    button.type = "button";
    button.textContent = "RUNTIME · OBSERVE";
    button.addEventListener("click", openRuntimeWorkspace);
    center.appendChild(button);

    const nav = qs(".genesis-nav");
    if (nav && !byId("runtimeNavBtn")) {
      const navButton = document.createElement("button");
      navButton.id = "runtimeNavBtn";
      navButton.className = "nav-btn";
      navButton.innerHTML = '<span class="nav-icon">✦</span><b>Runtime</b><em id="runtimeNavQueue">0</em>';
      navButton.addEventListener("click", openRuntimeWorkspace);
      const memoryButton = [...nav.querySelectorAll("button")].find(item => item.textContent.includes("Memoria"));
      nav.insertBefore(navButton, memoryButton || null);
    }
  }

  function injectAutonomyRail() {
    const statusbar = qs(".genesis-statusbar");
    if (!statusbar || byId("autonomyCommandRail")) return;
    const rail = document.createElement("section");
    rail.id = "autonomyCommandRail";
    rail.className = "autonomy-command-rail";
    rail.innerHTML = `
      <div class="runtime-identity"><span class="runtime-orb">A</span><div><span>COGNITIVE RUNTIME</span><strong id="railRuntimeMode">OBSERVE</strong><small id="railRuntimeDetail">Cargando sistema nervioso...</small></div></div>
      <div class="runtime-budget"><div><span>PRESUPUESTO AUTÓNOMO</span><strong id="railBudget">US$ 0 / 0</strong><small id="railBudgetDetail">Techo humano 5%</small></div><span class="runtime-budget-meter"><i id="railBudgetMeter"></i></span></div>
      <div class="runtime-cycle"><div><span>CICLO COGNITIVO</span><strong id="railCycle">IDLE</strong><small id="railNextCycle">Sin ciclo programado</small></div></div>
      <div class="runtime-queue-mini"><div><span>COLA + PLANES</span><strong><b id="railQueue">0</b> acciones · <b id="railPlans">0</b> planes</strong><small id="railSnapshot">Esperando snapshot</small></div></div>
      <div class="runtime-mode-buttons" aria-label="Modo cognitivo">
        <button data-runtime-mode="observe">OBSERVE</button><button data-runtime-mode="copilot">COPILOT</button><button data-runtime-mode="paper_autonomous">PAPER AUTO</button><button data-runtime-mode="suspended">PAUSA</button>
      </div>
      <button class="runtime-kill" id="runtimeKillBtn" type="button">KILL SWITCH</button>`;
    statusbar.insertAdjacentElement("afterend", rail);
  }

  function injectRuntimeWorkspace() {
    const operationsGrid = qs("#operationsWorkspace .operations-grid");
    if (!operationsGrid || byId("autonomousRuntimePanel")) return;
    const section = document.createElement("section");
    section.id = "autonomousRuntimePanel";
    section.className = "autonomous-runtime-foundation";
    section.innerHTML = `
      <div class="runtime-mode-banner" id="runtimeEmergencyBanner">KILL SWITCH ACTIVO · APEX está suspendido y ninguna acción autónoma puede ejecutarse.</div>
      <div class="runtime-foundation-head">
        <div><p class="eyebrow">APEX OS 7.0 · MASTER RUNTIME</p><h3>Autonomous Cognitive Runtime</h3><p>La IA dejó de ser un chat agregado: observa el cockpit, conserva planes, propone decisiones y puede operar autónomamente en PAPER bajo Risk, Governance, presupuesto y kill switch.</p></div>
        <div class="runtime-head-actions"><button id="runtimeRunCycle" class="primary">Ejecutar ciclo</button><button id="runtimeSettingsFocus">Configuración</button><button id="runtimeExport">Exportar runtime</button><button id="runtimeHeadKill" class="danger">KILL SWITCH</button></div>
      </div>
      <div class="runtime-kpis">
        <div class="runtime-kpi" id="kpiModeCard"><span>MODO</span><strong id="runtimeModeValue">OBSERVE</strong><small id="runtimeModeDetail">Solo lectura</small></div>
        <div class="runtime-kpi"><span>MODELO</span><strong id="runtimeModelValue">—</strong><small id="runtimeAiState">Sin verificar</small></div>
        <div class="runtime-kpi"><span>SNAPSHOT</span><strong id="runtimeSnapshotValue">—</strong><small id="runtimeSnapshotAge">Sin datos</small></div>
        <div class="runtime-kpi"><span>COLA</span><strong id="runtimeQueueValue">0</strong><small id="runtimeQueueDetail">Sin acciones</small></div>
        <div class="runtime-kpi"><span>PLANES ACTIVOS</span><strong id="runtimePlansValue">0</strong><small id="runtimePlansDetail">Sin planes</small></div>
        <div class="runtime-kpi"><span>AUDITORÍA</span><strong id="runtimeIntegrityValue">LOCAL</strong><small>JSON + NDJSON</small></div>
      </div>
      <div class="runtime-master-grid">
        <article class="runtime-card wide"><div class="runtime-card-head"><div><span>AUTONOMOUS ACTION BUS</span><strong>Cola gobernada</strong></div><button id="runtimeRefreshQueue">Actualizar</button></div><div class="runtime-card-body"><div class="runtime-queue-list" id="runtimeQueueList"></div></div></article>
        <article class="runtime-card"><div class="runtime-card-head"><div><span>CAPITAL GOVERNANCE</span><strong>Presupuesto autónomo</strong></div><button data-runtime-mode-open="paper_autonomous">Configurar</button></div><div class="runtime-card-body runtime-budget-box"><div class="runtime-budget-ring" id="runtimeBudgetRing"><div><strong id="runtimeBudgetRemaining">US$ 0</strong><span>DISPONIBLE</span></div></div><div class="runtime-budget-lines"><div class="runtime-budget-line"><span>Equity paper</span><b id="runtimeEquity">US$ 0</b></div><div class="runtime-budget-line"><span>Techo humano</span><b>5%</b></div><div class="runtime-budget-line"><span>Exposición actual</span><b id="runtimeExposure">US$ 0</b></div><div class="runtime-budget-line"><span>Máximo por posición</span><b id="runtimePositionLimit">—</b></div><div class="runtime-budget-line"><span>Riesgo por trade</span><b id="runtimeRiskLimit">—</b></div></div></div></article>
        <article class="runtime-card"><div class="runtime-card-head"><div><span>MISSION PLANNING</span><strong>Planes cognitivos</strong></div><button id="runtimeCreatePlan">Nuevo plan</button></div><div class="runtime-card-body"><div class="runtime-plan-list" id="runtimePlanList"></div></div></article>
        <article class="runtime-card"><div class="runtime-card-head"><div><span>CONSTITUTIONAL MATRIX</span><strong>Permisos y locks</strong></div><button id="runtimeOpenGovernance">Governance</button></div><div class="runtime-card-body"><div class="runtime-permissions" id="runtimePermissions"></div></div></article>
        <article class="runtime-card wide"><div class="runtime-card-head"><div><span>AUDIT TELEMETRY</span><strong>Actividad del Cognitive Runtime</strong></div><button id="runtimeRefreshEvents">Actualizar</button></div><div class="runtime-card-body"><div class="runtime-event-list" id="runtimeEventList"></div></div></article>
        <article class="runtime-card"><div class="runtime-card-head"><div><span>ADAPTER PORT</span><strong>Compatibilidad e integraciones</strong></div><button id="runtimeRefreshIntegrations">Health</button></div><div class="runtime-card-body"><div class="runtime-integration-list" id="runtimeIntegrationList"></div></div></article>
        <article class="runtime-card wide" id="runtimeSettingsCard"><div class="runtime-card-head"><div><span>POLICY CONFIGURATION</span><strong>Configuración gobernada</strong></div><button id="runtimeLoadDefaults">Recargar</button></div><div class="runtime-card-body"><div class="runtime-settings-grid">
          <label>Ciclo (segundos)<input id="cfgCycleSeconds" type="number" min="30" max="3600"></label>
          <label>Autonomía % (máx. 5)<input id="cfgAutonomyCap" type="number" min="0" max="5" step="0.1"></label>
          <label>Máx. posición %<input id="cfgMaxPosition" type="number" min="0.1" max="2" step="0.1"></label>
          <label>Riesgo/trade %<input id="cfgRiskTrade" type="number" min="0.05" max="0.5" step="0.05"></label>
          <label>Pérdida diaria %<input id="cfgDailyLoss" type="number" min="0.25" max="2" step="0.25"></label>
          <label>Confianza mínima<input id="cfgMinConfidence" type="number" min="70" max="98"></label>
          <label>R/R mínimo<input id="cfgMinRR" type="number" min="1" max="5" step="0.1"></label>
          <label>Posiciones máximas<input id="cfgMaxPositions" type="number" min="1" max="5"></label>
          <label>Cooldown (min)<input id="cfgCooldown" type="number" min="1" max="240"></label>
          <label class="checkbox"><input id="cfgAllowOpen" type="checkbox">Abrir PAPER</label>
          <label class="checkbox"><input id="cfgAllowClose" type="checkbox">Cerrar PAPER</label>
          <label class="checkbox"><input id="cfgAllowModify" type="checkbox">Ajustar protección</label>
          <label class="checkbox"><input id="cfgAllowAudit" type="checkbox">Autoauditar</label>
          <label class="checkbox"><input id="cfgNotify" type="checkbox">Notificaciones</label>
        </div><div class="runtime-settings-actions"><button id="runtimeDiscardConfig">Descartar</button><button id="runtimeSaveConfig" class="save">Guardar configuración</button></div></div></article>
        <article class="runtime-card"><div class="runtime-card-head"><div><span>REALTIME VOICE BRIDGE</span><strong>Voz natural beta</strong></div></div><div class="runtime-card-body"><div class="runtime-voice-chip"><button id="runtimeRealtimeVoice">Conectar voz realtime</button><small id="runtimeRealtimeState">Opcional · requiere micrófono y API configurada</small></div><p style="font-size:12px;color:#8197b7;line-height:1.45;margin:10px 0 0">El puente WebRTC es independiente del push-to-talk clásico. Las órdenes operativas siguen pasando por Command Runtime, Risk y Governance.</p></div></article>
      </div>`;
    operationsGrid.prepend(section);
  }

  function injectProtocolModal() {
    if (byId("runtimeProtocolModal")) return;
    const modal = document.createElement("div");
    modal.id = "runtimeProtocolModal";
    modal.className = "runtime-protocol-modal hidden";
    modal.innerHTML = `<div class="runtime-protocol-card"><h3 id="runtimeProtocolTitle">Protocolo de autorización</h3><p id="runtimeProtocolText"></p><code id="runtimeProtocolPhrase"></code><input id="runtimeProtocolInput" autocomplete="off" placeholder="Escribí la frase exacta"><div class="runtime-protocol-actions"><button id="runtimeProtocolCancel">Cancelar</button><button id="runtimeProtocolConfirm" class="confirm">Autorizar</button></div></div>`;
    document.body.appendChild(modal);
  }

  function bindUI() {
    document.addEventListener("click", event => {
      const modeButton = event.target.closest("[data-runtime-mode]");
      if (modeButton) requestMode(modeButton.dataset.runtimeMode);
      const cancel = event.target.closest("[data-runtime-cancel]");
      if (cancel) cancelQueuedAction(cancel.dataset.runtimeCancel);
      const planButton = event.target.closest("[data-runtime-plan-status]");
      if (planButton) setPlanStatus(planButton.dataset.planId, planButton.dataset.runtimePlanStatus);
    });
    byId("runtimeKillBtn")?.addEventListener("click", emergencyStop);
    byId("runtimeHeadKill")?.addEventListener("click", emergencyStop);
    byId("runtimeRunCycle")?.addEventListener("click", runCycle);
    byId("runtimeRefreshQueue")?.addEventListener("click", pollRuntime);
    byId("runtimeRefreshEvents")?.addEventListener("click", loadRuntimeEvents);
    byId("runtimeRefreshIntegrations")?.addEventListener("click", loadIntegrations);
    byId("runtimeSettingsFocus")?.addEventListener("click", () => byId("runtimeSettingsCard")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    byId("runtimeExport")?.addEventListener("click", exportRuntime);
    byId("runtimeCreatePlan")?.addEventListener("click", createPlanFromUI);
    byId("runtimeOpenGovernance")?.addEventListener("click", () => qs('[data-open-panel="governance"]')?.click());
    byId("runtimeSaveConfig")?.addEventListener("click", saveConfig);
    byId("runtimeDiscardConfig")?.addEventListener("click", fillConfig);
    byId("runtimeLoadDefaults")?.addEventListener("click", fillConfig);
    byId("runtimeRealtimeVoice")?.addEventListener("click", toggleRealtimeVoice);
    byId("runtimeProtocolCancel")?.addEventListener("click", () => finishProtocol(null));
    byId("runtimeProtocolConfirm")?.addEventListener("click", () => finishProtocol(byId("runtimeProtocolInput")?.value || ""));
    byId("runtimeProtocolInput")?.addEventListener("keydown", event => { if (event.key === "Enter") finishProtocol(event.target.value); if (event.key === "Escape") finishProtocol(null); });
  }

  function bindEventMirror() {
    window.addEventListener("apex:event", event => {
      const detail = event.detail;
      if (!detail?.id || detail.id === lastMirroredEventId) return;
      lastMirroredEventId = detail.id;
      sessionStorage.setItem("apex.runtime.lastMirroredEventId", lastMirroredEventId);
      fetch("/api/runtime/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: detail }) }).catch(() => {});
    });
  }

  async function loadRuntime() {
    try {
      const response = await fetch("/api/runtime/state", { cache: "no-store" });
      runtime = await response.json();
    } catch {
      runtime = { ok: false, mode: "observe", configured: false, emergencyStop: false, config: {}, queue: [], plans: [], history: [], stats: {}, integrations: [] };
    }
    return runtime;
  }

  async function loadCommands() {
    try { commands = await fetch("/api/commands", { cache: "no-store" }).then(response => response.json()); } catch { commands = null; }
  }

  async function loadIntegrations() {
    try { integrations = await fetch("/api/integrations", { cache: "no-store" }).then(response => response.json()); } catch { integrations = { adapters: [] }; }
    renderIntegrations();
    return integrations;
  }

  async function loadRuntimeEvents() {
    try {
      const data = await fetch("/api/runtime/events?limit=80", { cache: "no-store" }).then(response => response.json());
      renderEvents(data.events || []);
    } catch { renderEvents([]); }
  }

  async function pollRuntime() {
    if (syncing) return;
    syncing = true;
    try { await loadRuntime(); renderAll(); await loadRuntimeEvents(); } finally { syncing = false; }
  }

  async function syncSnapshot() {
    const snapshot = window.APEX_API?.getCommandSnapshot?.();
    if (!snapshot) return;
    snapshot.version = "7.0.0";
    snapshot.runtimeClient = { clientId, href: location.href, timestamp: new Date().toISOString() };
    try {
      await fetch("/api/runtime/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot, client: { clientId, userAgent: navigator.userAgent.slice(0, 300) } }) });
    } catch { /* backend may be offline */ }
  }

  async function processAutonomousQueue() {
    if (actionWorkerBusy || !runtime || runtime.mode !== "paper_autonomous" || runtime.emergencyStop) return;
    const queued = (runtime.queue || []).find(action => action.status === "queued");
    if (!queued) return;
    actionWorkerBusy = true;
    try {
      const claimResponse = await fetch(`/api/runtime/actions/${encodeURIComponent(queued.id)}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) });
      const claim = await claimResponse.json();
      if (!claimResponse.ok || !claim.ok) return;
      const result = await executeAutonomousAction(claim.action);
      await fetch(`/api/runtime/actions/${encodeURIComponent(queued.id)}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) });
      if (result.ok) notify("APEX PAPER AUTO", result.message || queued.summary);
      emit(result.ok ? "AUTONOMOUS_CLIENT_EXECUTION_SUCCEEDED" : "AUTONOMOUS_CLIENT_EXECUTION_FAILED", { action: queued, result }, { source: "COGNITIVE_RUNTIME", category: "execution", severity: result.ok ? "success" : "error", symbol: queued.arguments?.symbol, correlationId: queued.id });
    } catch (error) {
      try { await fetch(`/api/runtime/actions/${encodeURIComponent(queued.id)}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, message: error.message }) }); } catch {}
    } finally {
      actionWorkerBusy = false;
      await pollRuntime();
    }
  }

  async function executeAutonomousAction(action) {
    const api = window.APEX_API;
    if (!api) return { ok: false, message: "APEX_API no disponible." };
    const args = action.arguments || {};
    try {
      let result;
      switch (action.name) {
        case "execute_paper_trade": result = api.commandExecutePaperTrade(args); break;
        case "close_paper_position": result = api.commandClosePaperPosition(args); break;
        case "modify_paper_position": result = api.commandModifyPaperPosition(args); break;
        case "run_governance_audit": result = api.commandRunGovernanceAudit(args.reason || "Auditoría autónoma"); break;
        default: throw new Error(`Acción autónoma no soportada: ${action.name}`);
      }
      if (result && typeof result.then === "function") result = await result;
      if (result?.ok === false) throw new Error(result.message || "Acción rechazada.");
      return { ok: true, ...(result || {}), message: result?.message || `Ejecutado: ${action.summary}` };
    } catch (error) { return { ok: false, message: error.message }; }
  }

  async function requestMode(mode) {
    if (mode === runtime?.mode) return;
    if (runtime?.emergencyStop && mode !== "suspended") return resumeRuntime(mode);
    let activationPhrase = "";
    if (mode === "paper_autonomous") {
      activationPhrase = await requestProtocol({ title: "Habilitar autonomía PAPER", text: "APEX podrá ejecutar operaciones simuladas sin confirmación individual, exclusivamente dentro del 5%, Risk y Governance. Las cuentas externas siguen bloqueadas.", phrase: "HABILITAR PAPER AUTO" });
      if (!activationPhrase) return;
    }
    try {
      const response = await fetch("/api/runtime/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, activationPhrase, reason: "Cambio desde Mission Control", actor: "USER" }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "No se pudo cambiar el modo.");
      toast(data.message); await pollRuntime();
    } catch (error) { toast(error.message); }
  }

  async function emergencyStop() {
    if (runtime?.emergencyStop) return resumeRuntime("observe");
    const confirmed = await requestProtocol({ title: "Activar KILL SWITCH", text: "Esto suspende el runtime, cancela la cola y bloquea nuevas acciones autónomas. Es una acción de seguridad inmediata.", phrase: "DETENER APEX", exactRequired: false });
    if (confirmed == null) return;
    try {
      const response = await fetch("/api/runtime/emergency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true, reason: "Kill switch desde cockpit" }) });
      const data = await response.json();
      toast(data.message || "Kill switch activado.");
      pauseAllLocalAgents();
      await pollRuntime();
    } catch (error) { toast(error.message); }
  }

  async function resumeRuntime(targetMode = "observe") {
    const activationPhrase = await requestProtocol({ title: "Reanudar APEX", text: "Reanudar no restaura autonomía paper. El sistema volverá en OBSERVE o COPILOT.", phrase: "REANUDAR APEX" });
    if (!activationPhrase) return;
    try {
      const response = await fetch("/api/runtime/emergency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false, targetMode: targetMode === "copilot" ? "copilot" : "observe", activationPhrase, reason: "Reanudación humana" }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "No se pudo reanudar.");
      toast(data.message); await pollRuntime();
    } catch (error) { toast(error.message); }
  }

  async function runCycle() {
    byId("runtimeRunCycle").disabled = true;
    try {
      await syncSnapshot();
      const response = await fetch("/api/runtime/cycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Ciclo manual desde Runtime" }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || data.error || "Ciclo rechazado.");
      toast(data.message || "Ciclo completado.");
      await pollRuntime();
    } catch (error) { toast(error.message); }
    finally { byId("runtimeRunCycle").disabled = false; }
  }

  async function saveConfig() {
    const config = {
      cycleSeconds: numberValue("cfgCycleSeconds"), autonomyCapPct: numberValue("cfgAutonomyCap"), maxPositionPct: numberValue("cfgMaxPosition"), riskPerTradePct: numberValue("cfgRiskTrade"), dailyLossLimitPct: numberValue("cfgDailyLoss"), minConfidence: numberValue("cfgMinConfidence"), minRiskReward: numberValue("cfgMinRR"), maxConcurrentPositions: numberValue("cfgMaxPositions"), cooldownMinutes: numberValue("cfgCooldown"),
      allowOpen: checked("cfgAllowOpen"), allowClose: checked("cfgAllowClose"), allowModifyProtection: checked("cfgAllowModify"), allowGovernanceAudit: checked("cfgAllowAudit"), browserNotifications: checked("cfgNotify")
    };
    try {
      const response = await fetch("/api/runtime/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Configuración rechazada.");
      toast(data.message); await pollRuntime();
    } catch (error) { toast(error.message); }
  }

  async function createPlanFromUI() {
    const title = prompt("Nombre del plan cognitivo:", "Research de oportunidad");
    if (!title) return;
    const objective = prompt("Objetivo del plan:", "Investigar el activo con evidencia, contraevidencia y condiciones de invalidación.");
    if (!objective) return;
    const symbol = window.APEX_API?.getFocusSymbol?.() || "ETHUSDT";
    try {
      const response = await fetch("/api/runtime/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, objective, symbol, horizon: "research" }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "No se creó el plan.");
      toast(data.message); await pollRuntime();
    } catch (error) { toast(error.message); }
  }

  async function setPlanStatus(id, status) {
    try {
      const response = await fetch(`/api/runtime/plans/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "No se actualizó el plan.");
      await pollRuntime();
    } catch (error) { toast(error.message); }
  }

  async function cancelQueuedAction(id) {
    try { await fetch(`/api/runtime/actions/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Cancelación humana" }) }); await pollRuntime(); } catch {}
  }

  async function exportRuntime() {
    try {
      const data = await fetch("/api/runtime/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(response => response.json());
      downloadJson(data, `APEX_OS_7_Runtime_${new Date().toISOString().slice(0,10)}.json`);
      toast("Runtime exportado.");
    } catch (error) { toast(error.message); }
  }

  async function executeCommandAction(action) {
    const args = action.arguments || {};
    switch (action.name) {
      case "inspect_runtime": return { ok: true, message: runtimeDescription(args.section) };
      case "query_system_memory": return { ok: true, message: queryMemory(args) };
      case "create_plan": {
        const response = await fetch("/api/runtime/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message); await pollRuntime(); return data;
      }
      case "manage_plan": {
        const response = await fetch(`/api/runtime/plans/${encodeURIComponent(args.plan_id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: args.status, reason: args.reason }) }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message); await pollRuntime(); return data;
      }
      case "change_runtime_mode": await requestMode(args.mode); return { ok: true, message: `Protocolo de cambio a ${args.mode} procesado.` };
      case "update_runtime_config": {
        const response = await fetch("/api/runtime/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message); await pollRuntime(); return data;
      }
      case "run_autonomous_cycle": await runCycle(); return { ok: true, message: "Ciclo cognitivo solicitado." };
      case "emergency_stop": await emergencyStop(); return { ok: true, message: "Kill switch procesado." };
      case "resume_after_emergency": await resumeRuntime(args.target_mode); return { ok: true, message: "Protocolo de reanudación procesado." };
      case "export_runtime_state": await exportRuntime(); return { ok: true, message: "Runtime exportado." };
      default: return null;
    }
  }

  function runtimeDescription(section = "summary") {
    if (!runtime) return "Runtime no disponible.";
    const summary = runtimeSummaryClient();
    if (section === "budget") return `Equity PAPER ${money(summary.equity)}. Presupuesto autónomo ${money(summary.budget)} (${runtime.config.autonomyCapPct}%). Exposición actual ${money(summary.exposure)}. Disponible ${money(summary.remaining)}.`;
    if (section === "queue") return `${summary.queueCount} acciones pendientes. ${runtime.history?.length || 0} resultados registrados por el backend.`;
    if (section === "plans") return `${summary.activePlans} planes activos y ${runtime.plans?.length || 0} totales.`;
    if (section === "permissions") return `PAPER ONLY. Techo 5%. Live, brokers, wallets, retiros y firmas están bloqueados. Aperturas ${runtime.config.allowOpen ? "habilitadas" : "deshabilitadas"}; cierres ${runtime.config.allowClose ? "habilitados" : "deshabilitados"}.`;
    if (section === "integrations") return (integrations?.adapters || []).map(item => `${item.label}: ${item.status}`).join(" · ");
    return `Runtime ${runtime.mode}. IA ${runtime.configured ? "online" : "sin clave"}. Snapshot ${runtime.snapshotFresh ? "fresco" : "no disponible/viejo"}. ${summary.queueCount} acciones pendientes, ${summary.activePlans} planes activos, kill switch ${runtime.emergencyStop ? "ACTIVO" : "inactivo"}.`;
  }

  function queryMemory(args) {
    const memory = window.APEX_EVENT_BUS?.getMemory?.() || {};
    const events = window.APEX_EVENT_BUS?.query?.({ text: args.query || "", limit: args.limit || 8 }) || [];
    const domain = args.domain || "all";
    const buckets = domain === "all" ? ["decisions", "objections", "audits", "outcomes"] : domain === "events" ? [] : [domain];
    const records = buckets.flatMap(bucket => (memory[bucket] || []).filter(item => JSON.stringify(item).toLowerCase().includes(String(args.query || "").toLowerCase())).slice(0, args.limit || 8));
    if (!records.length && !events.length) return `No encontré coincidencias persistidas para “${args.query}”.`;
    return [...records.slice(0, 6).map(item => `${item.timestamp || ""} · ${item.decision || item.title || item.eventType || item.autonomyState || "memoria"}`), ...events.slice(0, 6).map(item => `${item.type} · ${item.symbol || item.source}`)].join("\n");
  }

  async function toggleRealtimeVoice() {
    if (realtime.connected) return disconnectRealtimeVoice();
    const button = byId("runtimeRealtimeVoice");
    try {
      button.disabled = true; setText("runtimeRealtimeState", "Solicitando micrófono...");
      const pc = new RTCPeerConnection();
      const audio = document.createElement("audio"); audio.autoplay = true; audio.hidden = true; document.body.appendChild(audio);
      pc.ontrack = event => { audio.srcObject = event.streams[0]; };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const dc = pc.createDataChannel("oai-events");
      dc.onopen = () => { realtime.connected = true; button.classList.add("connected"); setText("runtimeRealtimeState", "Conectada · voz natural online"); button.textContent = "Desconectar voz"; };
      dc.onmessage = event => handleRealtimeEvent(event.data);
      dc.onclose = () => disconnectRealtimeVoice();
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const response = await fetch("/api/realtime/call", { method: "POST", headers: { "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!response.ok) throw new Error((await response.text()).slice(0, 300) || "No se creó la llamada realtime.");
      await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
      realtime = { pc, dc, stream, connected: true, audio };
    } catch (error) { setText("runtimeRealtimeState", error.message); disconnectRealtimeVoice(); }
    finally { button.disabled = false; }
  }

  function handleRealtimeEvent(raw) {
    try {
      const event = JSON.parse(raw);
      if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
        setText("voiceTranscript", event.transcript);
        emit("REALTIME_VOICE_TRANSCRIPT", { transcript: event.transcript }, { source: "REALTIME_VOICE", category: "dialogue", severity: "info" });
      }
      if (event.type === "error") setText("runtimeRealtimeState", event.error?.message || "Error realtime");
    } catch { /* ignore */ }
  }

  function disconnectRealtimeVoice() {
    realtime.stream?.getTracks?.().forEach(track => track.stop());
    try { realtime.dc?.close(); } catch {}
    try { realtime.pc?.close(); } catch {}
    realtime.audio?.remove?.();
    realtime = { pc: null, dc: null, stream: null, connected: false };
    const button = byId("runtimeRealtimeVoice");
    if (button) { button.classList.remove("connected"); button.textContent = "Conectar voz realtime"; }
    setText("runtimeRealtimeState", "Desconectada");
  }

  function renderAll() {
    if (!runtime) return;
    const summary = runtimeSummaryClient();
    document.body.classList.toggle("runtime-emergency", Boolean(runtime.emergencyStop));
    setText("runtimeTopPill", runtime.emergencyStop ? "RUNTIME · EMERGENCY" : `RUNTIME · ${modeLabel(runtime.mode)}`);
    byId("runtimeTopPill")?.classList.toggle("auto", runtime.mode === "paper_autonomous" && !runtime.emergencyStop);
    byId("runtimeTopPill")?.classList.toggle("emergency", Boolean(runtime.emergencyStop));
    setText("runtimeNavQueue", String(summary.queueCount));
    setText("railRuntimeMode", modeLabel(runtime.mode));
    setText("railRuntimeDetail", runtime.emergencyStop ? "Kill switch activo" : runtime.configured ? `${runtime.model} · ${runtime.cycleStatus}` : "Backend local · falta OPENAI_API_KEY");
    setText("railBudget", `${money(summary.remaining)} / ${money(summary.budget)}`);
    setText("railBudgetDetail", `${runtime.config.autonomyCapPct}% del equity · exposición ${money(summary.exposure)}`);
    if (byId("railBudgetMeter")) byId("railBudgetMeter").style.width = `${summary.budget ? Math.min(100, summary.exposure / summary.budget * 100) : 0}%`;
    setText("railCycle", String(runtime.cycleStatus || "idle").toUpperCase());
    setText("railNextCycle", runtime.nextCycleAt ? `Próximo ${relativeTime(runtime.nextCycleAt)}` : "Sin ciclo programado");
    setText("railQueue", summary.queueCount); setText("railPlans", summary.activePlans);
    setText("railSnapshot", runtime.snapshotReceivedAt ? `Snapshot ${relativeTime(runtime.snapshotReceivedAt)}` : "Esperando snapshot");
    document.querySelectorAll("[data-runtime-mode]").forEach(button => button.classList.toggle("active", button.dataset.runtimeMode === runtime.mode));
    setText("runtimeKillBtn", runtime.emergencyStop ? "REANUDAR" : "KILL SWITCH");
    setText("runtimeHeadKill", runtime.emergencyStop ? "REANUDAR APEX" : "KILL SWITCH");
    byId("runtimeEmergencyBanner")?.classList.toggle("show", Boolean(runtime.emergencyStop));

    setText("runtimeModeValue", modeLabel(runtime.mode));
    setText("runtimeModeDetail", modeDescription(runtime.mode));
    setText("runtimeModelValue", runtime.model || "—"); setText("runtimeAiState", runtime.configured ? "IA online" : "Falta API key");
    setText("runtimeSnapshotValue", runtime.snapshotFresh ? "FRESCO" : runtime.snapshotReceivedAt ? "VIEJO" : "SIN DATOS");
    setText("runtimeSnapshotAge", runtime.snapshotReceivedAt ? relativeTime(runtime.snapshotReceivedAt) : "Sin snapshot");
    setText("runtimeQueueValue", summary.queueCount); setText("runtimeQueueDetail", summary.queueCount ? "Esperando browser worker" : "Sin acciones");
    setText("runtimePlansValue", summary.activePlans); setText("runtimePlansDetail", `${runtime.plans?.length || 0} planes totales`);
    setText("runtimeIntegrityValue", runtime.ok ? "ONLINE" : "OFFLINE");
    setText("runtimeBudgetRemaining", money(summary.remaining)); setText("runtimeEquity", money(summary.equity)); setText("runtimeExposure", money(summary.exposure));
    setText("runtimePositionLimit", `${runtime.config.maxPositionPct}% · ${money(summary.equity * runtime.config.maxPositionPct / 100)}`);
    setText("runtimeRiskLimit", `${runtime.config.riskPerTradePct}% · ${money(summary.equity * runtime.config.riskPerTradePct / 100)}`);
    if (byId("runtimeBudgetRing")) byId("runtimeBudgetRing").style.setProperty("--budget-angle", `${summary.budget ? Math.min(360, summary.exposure / summary.budget * 360) : 0}deg`);
    renderQueue(); renderPlans(); renderPermissions(); renderIntegrations(); fillConfig();
    loadRuntimeEvents();
  }

  function renderQueue() {
    const holder = byId("runtimeQueueList"); if (!holder) return;
    const items = [...(runtime.queue || [])].reverse().slice(0, 18);
    if (!items.length) { holder.innerHTML = '<div class="runtime-empty">Sin acciones autónomas. En APEX, no actuar también es una decisión.</div>'; return; }
    holder.innerHTML = items.map(action => `<article class="runtime-action" data-status="${escapeHtml(action.status)}"><div class="runtime-action-top"><strong>${escapeHtml(action.summary || action.name)}</strong><span>${escapeHtml(action.status)}</span></div><p>${escapeHtml(action.arguments?.rationale || action.result?.message || action.policy?.validation?.reason || "Acción trazable del Cognitive Runtime.")}</p><small>${formatDate(action.createdAt)} · ${escapeHtml(action.source || "runtime")}</small>${["queued","claimed"].includes(action.status) ? `<div class="runtime-action-buttons"><button class="cancel" data-runtime-cancel="${escapeHtml(action.id)}">Cancelar</button></div>` : ""}</article>`).join("");
  }

  function renderPlans() {
    const holder = byId("runtimePlanList"); if (!holder) return;
    const items = runtime.plans || [];
    if (!items.length) { holder.innerHTML = '<div class="runtime-empty">Sin planes. Creá una misión de research, intradía o swing.</div>'; return; }
    holder.innerHTML = items.slice(0, 16).map(plan => `<article class="runtime-plan"><div class="runtime-plan-top"><strong>${escapeHtml(plan.title)}</strong><span>${escapeHtml(plan.status)}</span></div><p>${escapeHtml(plan.objective)}</p><small>${escapeHtml(plan.symbol || "GLOBAL")} · ${escapeHtml(plan.horizon || "research")} · ${formatDate(plan.updatedAt)}</small><div class="runtime-action-buttons">${plan.status === "active" ? `<button data-plan-id="${escapeHtml(plan.id)}" data-runtime-plan-status="paused">Pausar</button><button data-plan-id="${escapeHtml(plan.id)}" data-runtime-plan-status="completed">Completar</button>` : plan.status === "paused" ? `<button data-plan-id="${escapeHtml(plan.id)}" data-runtime-plan-status="active">Reactivar</button>` : ""}<button class="cancel" data-plan-id="${escapeHtml(plan.id)}" data-runtime-plan-status="cancelled">Cancelar</button></div></article>`).join("");
  }

  function renderEvents(events = []) {
    const holder = byId("runtimeEventList"); if (!holder) return;
    if (!events.length) { holder.innerHTML = '<div class="runtime-empty">Sin telemetría backend todavía.</div>'; return; }
    holder.innerHTML = events.slice(0, 40).map(event => `<article class="runtime-event"><div class="runtime-event-top"><strong>${escapeHtml(event.type)}</strong><span>${escapeHtml(event.severity || "info")}</span></div><p>${escapeHtml(event.payload?.message || event.payload?.reason || event.payload?.tool || event.payload?.actionId || event.mode || "Evento auditado")}</p><small>${formatDate(event.occurredAt)} · ${escapeHtml(event.mode || "runtime")}</small></article>`).join("");
  }

  function renderPermissions() {
    const holder = byId("runtimePermissions"); if (!holder || !runtime) return;
    const rows = [
      ["Lectura y explicación", true], ["Casos y planes", runtime.mode !== "observe" && runtime.mode !== "suspended"], ["Aperturas PAPER", runtime.mode === "paper_autonomous" && runtime.config.allowOpen && !runtime.emergencyStop], ["Cierres PAPER", runtime.mode === "paper_autonomous" && runtime.config.allowClose && !runtime.emergencyStop], ["Modificar protección", runtime.mode === "paper_autonomous" && runtime.config.allowModifyProtection && !runtime.emergencyStop], ["Autoauditoría", runtime.config.allowGovernanceAudit && !runtime.emergencyStop], ["Live trading", false], ["Cuentas externas", false], ["Elevar techo 5%", false], ["Retiros / firmas", false]
    ];
    holder.innerHTML = rows.map(([label, allowed]) => `<div class="runtime-permission ${allowed ? "allowed" : "locked"}"><span>${escapeHtml(label)}</span><i></i><b>${allowed ? "HABILITADO" : "BLOQUEADO"}</b></div>`).join("");
  }

  function renderIntegrations() {
    const holder = byId("runtimeIntegrationList"); if (!holder) return;
    const items = integrations?.adapters || runtime?.integrations || [];
    if (!items.length) { holder.innerHTML = '<div class="runtime-empty">Sin registry disponible.</div>'; return; }
    holder.innerHTML = items.map(item => `<article class="runtime-integration"><div class="runtime-integration-top"><strong>${escapeHtml(item.label || item.id)}</strong><span>${escapeHtml(item.status)}</span></div><p>${escapeHtml(item.kind)} · ${escapeHtml(item.mode)}${item.locked ? " · diferido por diseño" : ""}</p><small>${item.enabled ? "ONLINE / READY" : item.locked ? "LOCKED" : "CONFIGURABLE"}</small></article>`).join("");
  }

  function fillConfig() {
    if (!runtime?.config || document.activeElement?.closest?.("#runtimeSettingsCard")) return;
    setValue("cfgCycleSeconds", runtime.config.cycleSeconds); setValue("cfgAutonomyCap", runtime.config.autonomyCapPct); setValue("cfgMaxPosition", runtime.config.maxPositionPct); setValue("cfgRiskTrade", runtime.config.riskPerTradePct); setValue("cfgDailyLoss", runtime.config.dailyLossLimitPct); setValue("cfgMinConfidence", runtime.config.minConfidence); setValue("cfgMinRR", runtime.config.minRiskReward); setValue("cfgMaxPositions", runtime.config.maxConcurrentPositions); setValue("cfgCooldown", runtime.config.cooldownMinutes);
    setChecked("cfgAllowOpen", runtime.config.allowOpen); setChecked("cfgAllowClose", runtime.config.allowClose); setChecked("cfgAllowModify", runtime.config.allowModifyProtection); setChecked("cfgAllowAudit", runtime.config.allowGovernanceAudit); setChecked("cfgNotify", runtime.config.browserNotifications);
  }

  function runtimeSummaryClient() {
    const snapshot = window.APEX_API?.getCommandSnapshot?.() || {};
    const equity = Number(snapshot?.portfolio?.equity || 0);
    const positions = snapshot?.portfolio?.positions || [];
    const exposure = positions.reduce((sum, item) => sum + Number(item.capital || 0), 0);
    const budget = equity * Number(runtime?.config?.autonomyCapPct || 0) / 100;
    return { equity, exposure, budget, remaining: Math.max(0, budget - exposure), queueCount: (runtime?.queue || []).filter(item => ["queued","claimed"].includes(item.status)).length, activePlans: (runtime?.plans || []).filter(item => item.status === "active").length };
  }

  function openRuntimeWorkspace() {
    qs('[data-open-panel="operations"]')?.click();
    setTimeout(() => byId("autonomousRuntimePanel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 260);
  }

  function requestProtocol({ title, text, phrase, exactRequired = true }) {
    return new Promise(resolve => {
      protocolResolve = value => {
        if (value == null) return resolve(null);
        if (exactRequired && String(value).trim().toUpperCase() !== phrase.toUpperCase()) { toast(`La frase exacta es: ${phrase}`); return resolve(null); }
        resolve(value || phrase);
      };
      setText("runtimeProtocolTitle", title); setText("runtimeProtocolText", text); setText("runtimeProtocolPhrase", phrase);
      const input = byId("runtimeProtocolInput"); if (input) input.value = "";
      byId("runtimeProtocolModal")?.classList.remove("hidden"); setTimeout(() => input?.focus(), 80);
    });
  }

  function finishProtocol(value) {
    byId("runtimeProtocolModal")?.classList.add("hidden");
    const resolve = protocolResolve; protocolResolve = null; resolve?.(value);
  }

  function pauseAllLocalAgents() {
    ["sentinel", "spot-hunter", "sandbox"].forEach(id => { try { window.APEX_API?.commandSetAgentState?.(id, false); } catch {} });
  }

  function notify(title, body) {
    if (!runtime?.config?.browserNotifications || !("Notification" in window)) return;
    if (Notification.permission === "granted") new Notification(title, { body });
    else if (Notification.permission === "default") Notification.requestPermission().then(permission => { if (permission === "granted") new Notification(title, { body }); });
  }

  function modeLabel(mode) { return ({ observe: "OBSERVE", copilot: "COPILOT", paper_autonomous: "PAPER AUTO", suspended: "SUSPENDED" })[mode] || String(mode || "UNKNOWN").toUpperCase(); }
  function modeDescription(mode) { return ({ observe: "Lectura y explicación", copilot: "Planifica y propone", paper_autonomous: "Ejecuta PAPER gobernado", suspended: "Sin ciclos ni acciones" })[mode] || ""; }
  function relativeTime(value) { const seconds = Math.round((Date.parse(value) - Date.now()) / 1000); const abs = Math.abs(seconds); if (abs < 10) return "ahora"; if (abs < 60) return seconds > 0 ? `en ${abs}s` : `hace ${abs}s`; const minutes = Math.round(abs / 60); if (minutes < 60) return seconds > 0 ? `en ${minutes}m` : `hace ${minutes}m`; const hours = Math.round(minutes / 60); return seconds > 0 ? `en ${hours}h` : `hace ${hours}h`; }
  function formatDate(value) { try { return new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return "—"; } }
  function money(value) { return `US$ ${Number(value || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`; }
  function numberValue(id) { return Number(byId(id)?.value || 0); }
  function checked(id) { return Boolean(byId(id)?.checked); }
  function setValue(id, value) { const el = byId(id); if (el) el.value = value; }
  function setChecked(id, value) { const el = byId(id); if (el) el.checked = Boolean(value); }
  function setText(id, value) { const el = byId(id); if (el) el.textContent = String(value ?? ""); }
  function toast(message) { const el = byId("apexToast"); if (!el) return; el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3500); }
  function downloadJson(value, filename) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]); }
  function emit(type, payload, meta) { try { return window.APEX_EVENT_BUS?.emit(type, payload, meta); } catch { return null; } }

  window.APEX_RUNTIME = { getState: () => runtime, refresh: pollRuntime, open: openRuntimeWorkspace, requestMode, emergencyStop, runCycle, executeCommandAction, executeAutonomousAction, exportRuntime, getCommands: () => commands, getIntegrations: () => integrations };
})();
