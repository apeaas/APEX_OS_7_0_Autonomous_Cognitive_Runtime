"use strict";

(function initRealtimeClient(root, factory) {
  const exported = factory(root);
  if (typeof module === "object" && module.exports) module.exports = exported;
  if (root) root.APEX_REALTIME_CLIENT = exported;
})(typeof window !== "undefined" ? window : globalThis, root => {
  class RealtimeClient {
    constructor(options = {}) {
      this.fetch = options.fetch || root.fetch?.bind(root);
      this.PeerConnection = options.PeerConnection || root.RTCPeerConnection;
      this.state = options.state;
      this.audio = options.audio;
      this.clock = options.clock || Date.now;
      this.setTimer = options.setTimer || root.setTimeout?.bind(root) || setTimeout;
      this.clearTimer = options.clearTimer || root.clearTimeout?.bind(root) || clearTimeout;
      this.listeners = new Map();
      this.session = null;
      this.peer = null;
      this.channel = null;
      this.manualClose = false;
      this.expiryTimer = null;
      this.reconnectTimer = null;
      this.reconnectInFlight = false;
      this.responseCount = 0;
    }

    on(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
      return () => this.listeners.get(type)?.delete(listener);
    }

    emit(type, detail) {
      for (const listener of this.listeners.get(type) || []) listener(detail);
      for (const listener of this.listeners.get("*") || []) listener({ type, detail });
    }

    async connect(options = {}) {
      if (this.session && this.state?.value !== "disabled" && this.state?.value !== "error") {
        throw clientError("VOICE_DOUBLE_CONNECTION", "Ya existe una conexión de voz.");
      }
      this.manualClose = false;
      const health = await this.getHealth();
      const preferredProvider = options.preferredProvider || health.defaultProvider || "mock";
      try {
        if (preferredProvider === "openai-realtime") {
          this.state?.transition("requesting_permission");
          await this.audio.requestMicrophone();
        }
        this.state?.transition("connecting", { preferredProvider });
        const response = await this.fetch("/api/voice/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredProvider }),
        });
        const body = await jsonResponse(response);
        if (!response.ok || !body.ok) throw responseError(body, response.status);
        this.session = body.session;
        if (this.session.provider === "mock") {
          this.state?.transition("listening", { provider: "mock" });
          this.armExpiry();
          this.emit("connected", this.session);
          return this.session;
        }
        await this.establishPeer();
        this.armExpiry();
        this.emit("connected", this.session);
        return this.session;
      } catch (error) {
        this.audio.stop();
        this.state?.fail(error);
        throw error;
      }
    }

    async establishPeer() {
      if (!this.PeerConnection) throw clientError("WEBRTC_UNAVAILABLE", "WebRTC no está disponible en este navegador.");
      this.closePeer();
      this.state?.transition("connecting", { provider: this.session.provider });
      const peer = new this.PeerConnection();
      this.peer = peer;
      peer.ontrack = event => this.audio.attachRemote(event);
      peer.onconnectionstatechange = () => {
        if (!this.manualClose && ["failed", "disconnected"].includes(peer.connectionState)) this.scheduleReconnect();
      };
      this.audio.addTracks(peer);
      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.onmessage = event => this.handleMessage(event.data);
      channel.onclose = () => {
        if (!this.manualClose) this.scheduleReconnect();
      };
      const opened = waitForOpen(channel, this.session.limits.connectTimeoutMs);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await this.fetch(`/api/voice/sessions/${encodeURIComponent(this.session.id)}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      const answerSdp = await response.text();
      if (!response.ok) throw clientError("VOICE_CONNECTION_FAILED", parseErrorText(answerSdp, response.status));
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
      await opened;
      this.state?.transition("listening", { provider: this.session.provider });
    }

    async sendContext(context = {}) {
      if (this.session?.provider === "mock") {
        this.emit("context", clone(context));
        return { ok: true };
      }
      this.sendEvent({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: String(context.instructions || ""),
        },
      });
      return { ok: true };
    }

    async sendText(text) {
      const transcript = String(text || "").trim();
      if (!transcript) throw clientError("EMPTY_VOICE_TRANSCRIPT", "Escribí o decí algo antes de enviar.");
      if (!this.session) throw clientError("VOICE_SESSION_REQUIRED", "Conectá la sesión de voz primero.");
      if (this.session.provider === "mock") return this.sendMockText(transcript);
      this.enforceResponseLimit();
      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: transcript }],
        },
      });
      this.sendEvent({ type: "response.create" });
      this.state?.transition("processing");
      return { ok: true };
    }

    async sendToolOutput(callId, output) {
      if (this.session?.provider === "mock") {
        this.emit("mock.response", { text: summarizeMockOutput(output) });
        this.state?.transition("listening");
        return;
      }
      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      });
      this.enforceResponseLimit();
      this.sendEvent({ type: "response.create" });
      this.state?.transition("processing");
    }

    async interrupt() {
      if (!this.session) return { ok: true };
      this.state?.transition("interrupted");
      if (this.session.provider !== "mock" && this.channel?.readyState === "open") {
        this.sendEvent({ type: "response.cancel" });
        this.sendEvent({ type: "output_audio_buffer.clear" });
      }
      this.audio.stopRemotePlayback();
      await this.fetch(`/api/voice/sessions/${encodeURIComponent(this.session.id)}/interrupt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => null);
      this.state?.transition("listening");
      this.emit("interrupted", { sessionId: this.session.id });
      return { ok: true };
    }

    async disconnect(options = {}) {
      this.manualClose = true;
      this.clearTimer(this.expiryTimer);
      this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
      this.reconnectInFlight = false;
      const session = this.session;
      this.closePeer();
      this.audio.stop();
      this.session = null;
      this.responseCount = 0;
      if (session && options.notifyServer !== false) {
        await this.fetch(`/api/voice/sessions/${encodeURIComponent(session.id)}/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: options.reason || "client_disconnect" }),
        }).catch(() => null);
      }
      if (this.state?.value !== "disabled") this.state?.transition("disabled", { reason: options.reason || "client_disconnect" });
      this.emit("disconnected", session);
      return { ok: true };
    }

    async getHealth() {
      if (typeof this.fetch !== "function") throw clientError("VOICE_BACKEND_UNAVAILABLE", "fetch no está disponible.");
      const response = await this.fetch("/api/voice/health", { cache: "no-store" });
      const body = await jsonResponse(response);
      if (!response.ok || !body.ok) throw responseError(body, response.status);
      return body;
    }

    sendEvent(event) {
      if (!this.channel || this.channel.readyState !== "open") throw clientError("VOICE_CHANNEL_NOT_OPEN", "El canal Realtime no está abierto.");
      this.channel.send(JSON.stringify(event));
    }

    handleMessage(raw) {
      try {
        const event = JSON.parse(raw);
        if (event.type === "response.done") {
          this.responseCount += 1;
          if (this.responseCount >= Number(this.session?.limits?.maxResponses || 48)) {
            this.emit("limit", { code: "VOICE_RESPONSE_LIMIT" });
            this.disconnect({ reason: "response_limit" });
          }
        }
        this.emit("event", event);
      } catch (error) {
        this.emit("error", clientError("INVALID_REALTIME_EVENT", error.message));
      }
    }

    async sendMockText(transcript) {
      this.emit("event", {
        type: "conversation.item.input_audio_transcription.completed",
        transcript,
        mock: true,
      });
      this.state?.transition("processing", { provider: "mock" });
      await Promise.resolve();
      const lower = transcript.toLowerCase();
      if (lower.includes("portfolio")) {
        this.emit("tool-call", { call_id: uniqueId(), name: "get_paper_portfolio", arguments: "{}" });
      } else if (lower.includes("retir") || lower.includes("live") || lower.includes("ejecut")) {
        this.emit("tool-call", { call_id: uniqueId(), name: "execute_trade", arguments: "{}" });
      } else {
        this.emit("mock.response", { text: `Mock de voz: recibí “${transcript}”. No se utilizó audio real.` });
        this.state?.transition("listening", { provider: "mock" });
      }
      return { ok: true };
    }

    scheduleReconnect() {
      if (!this.session || this.manualClose || this.reconnectTimer || this.reconnectInFlight) return;
      const attempt = Number(this.session.reconnects || 0) + 1;
      if (attempt > Number(this.session.limits.maxReconnects || 3)) {
        const error = clientError("VOICE_RECONNECT_LIMIT", "No fue posible reconectar la voz.");
        this.state?.fail(error);
        this.emit("error", error);
        return;
      }
      this.session.reconnects = attempt;
      this.state?.transition("reconnecting", { attempt });
      this.emit("reconnecting", { attempt });
      this.reconnectTimer = this.setTimer(async () => {
        this.reconnectTimer = null;
        this.reconnectInFlight = true;
        try {
          await this.establishPeer();
          this.reconnectInFlight = false;
          this.emit("reconnected", { attempt });
        } catch (error) {
          this.reconnectInFlight = false;
          if (attempt >= Number(this.session?.limits?.maxReconnects || 3)) {
            this.state?.fail(error);
            this.emit("error", error);
          } else {
            if (this.state?.value !== "reconnecting") this.state?.transition("reconnecting", { attempt });
            this.scheduleReconnect();
          }
        }
      }, Math.min(4_000, 500 * (2 ** (attempt - 1))));
    }

    armExpiry() {
      const delay = Math.max(1, Date.parse(this.session.expiresAt) - this.clock());
      this.expiryTimer = this.setTimer(() => {
        this.emit("expired", { sessionId: this.session?.id });
        this.disconnect({ reason: "session_expired" });
      }, delay);
    }

    enforceResponseLimit() {
      if (this.responseCount >= Number(this.session?.limits?.maxResponses || 48)) {
        throw clientError("VOICE_RESPONSE_LIMIT", "Se alcanzó el límite de respuestas de voz.");
      }
    }

    closePeer() {
      try { this.channel?.close?.(); } catch {}
      try { this.peer?.close?.(); } catch {}
      this.channel = null;
      this.peer = null;
    }
  }

  function waitForOpen(channel, timeoutMs) {
    if (channel.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(clientError("VOICE_CHANNEL_TIMEOUT", "El canal Realtime no abrió a tiempo.")), timeoutMs);
      channel.addEventListener?.("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      channel.addEventListener?.("error", () => {
        clearTimeout(timer);
        reject(clientError("VOICE_CHANNEL_FAILED", "Falló el canal Realtime."));
      }, { once: true });
    });
  }

  async function jsonResponse(response) {
    return response.json().catch(() => ({}));
  }

  function responseError(body, status) {
    return clientError(body.error || "VOICE_REQUEST_FAILED", body.message || `Voice API ${status}.`);
  }

  function parseErrorText(text, status) {
    try {
      const parsed = JSON.parse(text);
      return parsed.message || parsed.error || `Voice API ${status}.`;
    } catch {
      return text.slice(0, 300) || `Voice API ${status}.`;
    }
  }

  function summarizeMockOutput(output) {
    if (output?.kind === "read_only") return "Mock: consulta read-only completada y mostrada en pantalla.";
    if (output?.status) return `Mock: ${output.status}.`;
    return "Mock: resultado recibido sin audio real.";
  }

  function uniqueId() {
    return root.crypto?.randomUUID?.() || `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clientError(code, message) {
    return Object.assign(new Error(message), { code });
  }

  return { RealtimeClient, clientError };
});
