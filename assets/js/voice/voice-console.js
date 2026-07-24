"use strict";

(() => {
  const { VoiceState } = window.APEX_VOICE_STATE || {};
  const { AudioController } = window.APEX_AUDIO_CONTROLLER || {};
  const { RealtimeClient } = window.APEX_REALTIME_CLIENT || {};
  const { TranscriptView } = window.APEX_TRANSCRIPT_VIEW || {};
  if (!VoiceState || !AudioController || !RealtimeClient || !TranscriptView) return;

  const state = new VoiceState();
  const audio = new AudioController();
  const client = new RealtimeClient({ state, audio });
  const processedCalls = new Map();
  let health = null;
  let transcript = null;
  let pendingConfirmation = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    injectConsole();
    transcript = new TranscriptView(byId("voiceConsoleTranscript"));
    bindUI();
    bindClient();
    state.subscribe(renderState);
    await refreshHealth();
    transcript.append("system", "Consola lista. Voz real usa WebRTC; sin API key se identifica claramente el mock determinístico.");
    window.APEX_VOICE_CONSOLE = Object.freeze({
      connect,
      disconnect: () => client.disconnect(),
      sendContext: context => client.sendContext(context),
      interrupt: () => client.interrupt(),
      getHealth: () => client.getHealth(),
      state: () => state.snapshot(),
      open,
    });
  }

  function injectConsole() {
    if (byId("voiceConsole")) return;
    const panel = document.createElement("aside");
    panel.id = "voiceConsole";
    panel.className = "voice-console";
    panel.setAttribute("aria-label", "Consola de voz constitucional");
    panel.innerHTML = `
      <header class="voice-console-head">
        <div class="voice-ai-mark" aria-hidden="true">AI</div>
        <div><span>APEX · INTERACCIÓN CON IA</span><strong>Consola de voz constitucional</strong></div>
        <button id="voiceConsoleCollapse" type="button" aria-label="Minimizar consola">—</button>
      </header>
      <div class="voice-status-row">
        <span class="voice-status-dot" id="voiceStatusDot"></span>
        <strong id="voiceStateLabel">Deshabilitada</strong>
        <small id="voiceProviderLabel">Verificando provider…</small>
      </div>
      <div class="voice-console-body">
        <div class="voice-controls">
          <button id="voiceConnectBtn" class="primary" type="button">Conectar</button>
          <button id="voiceDisconnectBtn" type="button" disabled>Desconectar</button>
          <button id="voiceMuteBtn" type="button" disabled>Mute</button>
          <button id="voiceInterruptBtn" class="danger" type="button" disabled>Interrumpir</button>
        </div>
        <p class="voice-privacy" id="voicePrivacy">Audio crudo no almacenado · API key sólo backend · PAPER ONLY</p>
        <div class="voice-transcript-log" id="voiceConsoleTranscript" aria-live="polite" aria-label="Transcript de voz"></div>
        <div class="voice-confirmation-zone" id="voiceConfirmationZone"></div>
        <form class="voice-text-form" id="voiceTextForm">
          <input id="voiceTextInput" type="text" autocomplete="off" placeholder="Escribí dentro de la misma sesión…" aria-label="Mensaje de texto para la sesión de voz">
          <button type="submit">Enviar</button>
        </form>
        <details class="voice-help">
          <summary>Permisos, fallback y límites</summary>
          <p id="voiceHelpText">Permití el micrófono desde el candado del navegador. Si no hay clave o conexión, el texto continúa disponible y el mock nunca se presenta como voz real.</p>
        </details>
      </div>`;
    document.body.appendChild(panel);
  }

  function bindUI() {
    byId("voiceConnectBtn")?.addEventListener("click", connect);
    byId("voiceDisconnectBtn")?.addEventListener("click", () => client.disconnect());
    byId("voiceMuteBtn")?.addEventListener("click", () => {
      const muted = audio.setMuted(!audio.muted);
      byId("voiceMuteBtn").textContent = muted ? "Activar mic" : "Mute";
      byId("voiceMuteBtn").classList.toggle("active", muted);
    });
    byId("voiceInterruptBtn")?.addEventListener("click", () => client.interrupt());
    byId("voiceConsoleCollapse")?.addEventListener("click", () => {
      const collapsed = byId("voiceConsole").classList.toggle("collapsed");
      byId("voiceConsoleCollapse").textContent = collapsed ? "+" : "—";
      byId("voiceConsoleCollapse").setAttribute("aria-label", collapsed ? "Expandir consola" : "Minimizar consola");
    });
    byId("voiceTextForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const input = byId("voiceTextInput");
      const text = input?.value.trim();
      if (!text) return showError(Object.assign(new Error("El transcript está vacío."), { code: "EMPTY_VOICE_TRANSCRIPT" }));
      input.value = "";
      try {
        if (!client.session) await connect();
        if (!client.session) return;
        if (client.session.provider !== "mock") transcript.append("user", text);
        await client.sendText(text);
      } catch (error) {
        showError(error);
      }
    });
    document.addEventListener("click", event => {
      if (event.target.closest("[data-voice-console-open]")) open();
    });
  }

  function bindClient() {
    client.on("connected", session => {
      transcript.append("system", session.provider === "mock"
        ? "Mock determinístico conectado. No hay captura ni reproducción de audio real."
        : `WebRTC conectado con ${health?.providers?.["openai-realtime"]?.model || "modelo configurado"}.`);
      emit("VOICE_CONSOLE_CONNECTED", { provider: session.provider, rawAudioStored: false }, "success");
    });
    client.on("disconnected", () => {
      transcript.append("system", "Sesión de voz cerrada.");
      pendingConfirmation = null;
      byId("voiceConfirmationZone").textContent = "";
    });
    client.on("reconnecting", detail => transcript.append("system", `Reconectando voz · intento ${detail.attempt}.`));
    client.on("reconnected", detail => transcript.append("system", `Voz reconectada en intento ${detail.attempt}.`));
    client.on("interrupted", () => transcript.append("system", "Respuesta interrumpida por el operador."));
    client.on("expired", () => transcript.append("system", "La sesión alcanzó su límite de duración y se cerró."));
    client.on("limit", detail => transcript.append("system", `Límite de sesión: ${detail.code}.`));
    client.on("error", showError);
    client.on("mock.response", event => {
      transcript.append("assistant", event.text);
      state.transition("listening", { provider: "mock" });
    });
    client.on("tool-call", handleToolCall);
    client.on("event", handleRealtimeEvent);
  }

  async function connect() {
    open();
    try {
      health ||= await client.getHealth();
      const preferredProvider = health.defaultProvider || "mock";
      return await client.connect({ preferredProvider });
    } catch (error) {
      if (canFallbackToMock(error) && health?.providers?.mock?.configured) {
        await client.disconnect({ reason: "openai_connection_failed" });
        transcript.append("system", `Realtime no disponible (${error.code || "error"}). Fallback explícito al mock.`);
        return client.connect({ preferredProvider: "mock" });
      }
      showError(error);
      return null;
    }
  }

  async function disconnect() {
    return client.disconnect();
  }

  function handleRealtimeEvent(event) {
    if (!event || typeof event !== "object") return;
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const text = String(event.transcript || "").trim();
      if (!text) return;
      transcript.append("user", text);
      setText("voiceTranscript", text);
      emit("REALTIME_VOICE_TRANSCRIPT", { transcript: text }, "info");
    }
    if (event.type === "input_audio_buffer.speech_started") {
      if (["speaking", "processing"].includes(state.value)) state.transition("interrupted", { reason: "barge_in" });
      if (state.value !== "listening") state.transition("listening", { microphone: true });
    }
    if (event.type === "input_audio_buffer.speech_stopped" && state.value === "listening") state.transition("processing");
    if (event.type === "response.created" && state.value !== "processing") state.transition("processing");
    if (event.type === "response.output_audio.delta" && state.value !== "speaking") {
      audio.resumeRemotePlayback?.();
      state.transition("speaking");
    }
    if (event.type === "response.output_audio_transcript.delta") {
      const id = event.item_id || event.response_id || "realtime-audio";
      transcript.stream(id, event.delta, "assistant");
    }
    if (event.type === "response.output_audio_transcript.done") {
      transcript.complete(event.item_id || event.response_id || "realtime-audio", event.transcript, "assistant");
    }
    if (event.type === "response.output_text.delta") transcript.stream(event.item_id || event.response_id || "realtime-text", event.delta, "assistant");
    if (event.type === "response.output_text.done") transcript.complete(event.item_id || event.response_id || "realtime-text", event.text, "assistant");
    if (event.type === "response.done") {
      for (const item of event.response?.output || []) {
        if (item.type === "function_call") handleToolCall(item);
      }
      if (state.value !== "error" && state.value !== "disabled") state.transition("listening");
    }
    if (event.type === "error") showError(Object.assign(new Error(event.error?.message || "Error Realtime."), { code: event.error?.code || "REALTIME_ERROR" }));
  }

  async function handleToolCall(item) {
    const callId = String(item.call_id || item.callId || "");
    if (!callId || processedCalls.has(callId)) return processedCalls.get(callId);
    const operation = processToolCall({
      callId,
      name: item.name,
      arguments: parseArguments(item.arguments),
    });
    processedCalls.set(callId, operation);
    return operation;
  }

  async function processToolCall(call) {
    try {
      const response = await fetch(`/api/voice/sessions/${encodeURIComponent(client.session.id)}/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(call),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(body.message || body.error || "Tool de voz rechazado."), { code: body.error || "VOICE_TOOL_REJECTED" });
      if (body.kind === "read_only") {
        transcript.append("system", formatReadResult(call.name, body.result));
        await client.sendToolOutput(call.callId, body);
        return body;
      }
      if (body.directive?.type === "COMMAND_DRAFT") return createCommandDraft(call, body.directive);
      if (body.directive?.type === "IMPROVEMENT_PROPOSAL_DRAFT") return showImprovementDraft(call, body.directive);
      if (body.directive?.type === "OPPORTUNITY_INTENT_DRAFT") return showResearchDraft(call, body.directive);
      throw Object.assign(new Error("Directiva de voz desconocida."), { code: "INVALID_VOICE_DIRECTIVE" });
    } catch (error) {
      transcript.append("system", `Bloqueado: ${error.code || "VOICE_TOOL_ERROR"} · ${error.message}`);
      await client.sendToolOutput(call.callId, { ok: false, error: error.code || "VOICE_TOOL_ERROR", message: error.message }).catch(() => {});
      return { ok: false, error };
    }
  }

  async function createCommandDraft(call, directive) {
    const command = {
      ...directive.payload.command,
      expectedVersion: directive.payload.command.expectedVersion
        ?? window.APEX_PAPER_PORTFOLIO?.snapshot?.()?.version,
    };
    const response = await fetch(directive.normalRoute, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw Object.assign(new Error(body.message || "No se pudo crear CommandDraft."), { code: body.error || "COMMAND_DRAFT_FAILED" });
    pendingConfirmation = { call, command, draft: body.draft };
    renderPendingConfirmation({
      title: "Confirmación visual PAPER",
      lines: [
        `Acción: ${body.draft.interpretation?.action || command.type}`,
        `Símbolo: ${body.draft.interpretation?.symbol || command.symbol || "N/A"}`,
        `Tamaño: ${body.draft.interpretation?.requestedSize ?? command.capital ?? "N/A"}`,
        `Feed: ${body.draft.feedEvidence?.status || "unknown"} · trusted=${body.draft.feedEvidence?.trusted === true}`,
        `Expira: ${body.draft.expiresAt}`,
        "Efecto: PAPER únicamente; Risk y Governance conservan veto.",
      ],
      confirmLabel: "Confirmar y enviar a Risk",
      onConfirm: confirmPaperDraft,
      onCancel: () => finishPending(call, { ok: false, status: "CANCELLED_BY_HUMAN" }),
    });
    transcript.append("system", "CommandDraft preparado. APEX espera la confirmación visual; todavía no existe efecto PAPER.");
    return { ok: true, awaitingHuman: true };
  }

  async function confirmPaperDraft() {
    const pending = pendingConfirmation;
    if (!pending) return;
    setPendingDisabled(true);
    try {
      const confirmationResponse = await fetch(`/api/decision/drafts/${encodeURIComponent(pending.draft.id)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });
      const confirmationBody = await confirmationResponse.json().catch(() => ({}));
      if (!confirmationResponse.ok || !confirmationBody.ok) throw new Error(confirmationBody.message || "La confirmación fue rechazada.");
      const commandResponse = await fetch("/api/paper/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pending.command,
          draftId: pending.draft.id,
          confirmationId: confirmationBody.confirmation.id,
        }),
      });
      const commandBody = await commandResponse.json().catch(() => ({}));
      if (!commandResponse.ok || !commandBody.ok) throw new Error(commandBody.message || "Risk, Governance o ledger rechazaron el comando.");
      await window.APEX_PAPER_PORTFOLIO?.refresh?.().catch(() => null);
      transcript.append("system", `Efecto PAPER completado · ledger v${commandBody.projection?.version}.`);
      await finishPending(pending.call, {
        ok: true,
        status: "COMPLETED",
        executionMode: "PAPER_ONLY",
        riskDecision: commandBody.riskDecision,
        governanceDecision: commandBody.governanceDecision,
        ledgerVersion: commandBody.projection?.version,
      });
    } catch (error) {
      transcript.append("system", `No se ejecutó: ${error.message}`);
      await finishPending(pending.call, { ok: false, status: "REJECTED", message: error.message });
    }
  }

  function showImprovementDraft(call, directive) {
    const proposal = directive.payload;
    pendingConfirmation = { call, proposal };
    renderPendingConfirmation({
      title: "Registrar ImprovementProposal",
      lines: [
        proposal.problemStatement || "Problema sin descripción",
        `Cambio propuesto: ${proposal.proposedChange || "N/A"}`,
        `Evidencia: ${Array.isArray(proposal.evidence) ? proposal.evidence.length : 0} elemento(s)`,
        "Registrar no aprueba, aplica, hace merge ni despliega.",
      ],
      confirmLabel: "Registrar propuesta",
      onConfirm: async () => {
        setPendingDisabled(true);
        try {
          const response = await fetch(directive.normalRoute, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(proposal),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || !body.ok) throw new Error(body.message || "Propuesta rechazada.");
          transcript.append("system", `ImprovementProposal ${body.proposal.id} registrada en DRAFT.`);
          await finishPending(call, { ok: true, status: "DRAFT", proposalId: body.proposal.id });
        } catch (error) {
          await finishPending(call, { ok: false, status: "REJECTED", message: error.message });
        }
      },
      onCancel: () => finishPending(call, { ok: false, status: "CANCELLED_BY_HUMAN" }),
    });
  }

  function showResearchDraft(call, directive) {
    const intent = directive.payload;
    pendingConfirmation = { call, intent };
    renderPendingConfirmation({
      title: "OpportunityIntent de investigación",
      lines: [
        intent.thesis || "Intent sin tesis.",
        `Símbolo: ${intent.symbol || "N/A"}`,
        "operable=false · no representa una orden.",
      ],
      confirmLabel: "Conservar como investigación",
      onConfirm: () => finishPending(call, { ok: true, status: "RESEARCH_ONLY", operable: false }),
      onCancel: () => finishPending(call, { ok: false, status: "CANCELLED_BY_HUMAN" }),
    });
  }

  async function finishPending(call, output) {
    byId("voiceConfirmationZone").textContent = "";
    pendingConfirmation = null;
    await client.sendToolOutput(call.callId, output);
  }

  function renderPendingConfirmation(options) {
    const zone = byId("voiceConfirmationZone");
    zone.textContent = "";
    const card = document.createElement("section");
    card.className = "voice-confirm-card";
    const title = document.createElement("strong");
    title.textContent = options.title;
    const list = document.createElement("ul");
    for (const line of options.lines) {
      const item = document.createElement("li");
      item.textContent = line;
      list.appendChild(item);
    }
    const actions = document.createElement("div");
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "confirm";
    confirm.textContent = options.confirmLabel;
    confirm.addEventListener("click", options.onConfirm, { once: true });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    cancel.addEventListener("click", options.onCancel, { once: true });
    actions.append(confirm, cancel);
    card.append(title, list, actions);
    zone.appendChild(card);
  }

  function setPendingDisabled(disabled) {
    byId("voiceConfirmationZone")?.querySelectorAll("button").forEach(button => { button.disabled = disabled; });
  }

  async function refreshHealth() {
    try {
      health = await client.getHealth();
      const provider = health.defaultProvider;
      const providerHealth = health.providers?.[provider] || {};
      setText("voiceProviderLabel", provider === "mock"
        ? "MOCK · sin audio real"
        : `WebRTC · ${providerHealth.model || "modelo configurado"}`);
      setText("voicePrivacy", `Audio crudo no almacenado · API key sólo backend · ${Math.round(health.limits.sessionTtlMs / 60_000)} min máx.`);
    } catch (error) {
      setText("voiceProviderLabel", "Backend no disponible · texto local");
      showError(error);
    }
  }

  function renderState(snapshot) {
    const labels = {
      disabled: "Deshabilitada",
      requesting_permission: "Solicitando permiso",
      connecting: "Conectando",
      listening: "Escuchando",
      processing: "Procesando",
      speaking: "Hablando",
      interrupted: "Interrumpida",
      reconnecting: "Reconectando",
      error: "Error",
    };
    const connected = !["disabled", "error"].includes(snapshot.state);
    setText("voiceStateLabel", labels[snapshot.state] || snapshot.state);
    byId("voiceConsole")?.setAttribute("data-state", snapshot.state);
    byId("voiceConnectBtn").disabled = connected;
    byId("voiceDisconnectBtn").disabled = !connected;
    byId("voiceMuteBtn").disabled = !connected || client.session?.provider === "mock";
    byId("voiceInterruptBtn").disabled = !connected;
    if (snapshot.state === "error" && snapshot.details?.message) setText("voiceHelpText", `${snapshot.details.code}: ${snapshot.details.message} El texto sigue disponible.`);
  }

  function showError(error) {
    const code = error?.code || "VOICE_ERROR";
    const message = error?.message || "Error de voz.";
    if (state.value !== "error") {
      try { state.fail(error); } catch {}
    }
    transcript?.append("system", `${code}: ${message}`);
    setText("voiceHelpText", permissionHelp(code, message));
    emit("VOICE_CONSOLE_ERROR", { code, message }, "error");
  }

  function canFallbackToMock(error) {
    return error?.code !== "VOICE_DOUBLE_CONNECTION";
  }

  function permissionHelp(code, message) {
    if (code === "MICROPHONE_PERMISSION_DENIED") return "Abrí el candado del navegador, habilitá Micrófono para este origen y conectá de nuevo. El texto continúa disponible.";
    if (code === "MICROPHONE_DEVICE_NOT_FOUND") return "Conectá o elegí un micrófono en el sistema. Podés seguir por texto o usar el mock.";
    return `${message} Podés seguir por texto; el mock se identifica siempre como simulación.`;
  }

  function formatReadResult(name, result) {
    if (name === "get_paper_portfolio") {
      const projection = result?.projection || {};
      return `Portfolio PAPER · cash ${money(projection.cash)} · equity ${money(projection.equity)} · ${projection.positions?.length || 0} posiciones.`;
    }
    if (name === "get_market_quality") return `Gateway · ${result?.quality?.status || result?.state || "unknown"} · trusted=${result?.quality?.trusted === true}.`;
    if (name === "get_runtime_status") return `Runtime ${result?.mode || "unknown"} · kill switch ${result?.emergencyStop ? "ACTIVO" : "inactivo"} · PAPER ONLY.`;
    if (name === "get_autonomous_fund") return `Fondo autónomo · ${result?.fund?.status || "sin autorizar"} · PAPER ONLY.`;
    if (name === "get_decision_journal") return `Decision Journal · ${result?.entries?.length || 0} entradas consultadas.`;
    return `${name}: consulta read-only completada.`;
  }

  function parseArguments(value) {
    if (value && typeof value === "object") return value;
    try { return JSON.parse(String(value || "{}")); } catch { return {}; }
  }

  function open() {
    byId("voiceConsole")?.classList.remove("collapsed");
    byId("voiceConsoleCollapse").textContent = "—";
    byId("voiceTextInput")?.focus();
  }

  function emit(type, payload, severity) {
    window.APEX_EVENT_BUS?.emit?.(type, payload, {
      source: "REALTIME_VOICE",
      category: "dialogue",
      severity,
    });
  }

  function money(value) {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = String(value ?? "");
  }

  function byId(id) {
    return document.getElementById(id);
  }
})();
