"use strict";

const crypto = require("node:crypto");
const { VoiceProvider } = require("./voice-provider");
const { voiceError } = require("../contracts");

class OpenAIRealtimeProvider extends VoiceProvider {
  constructor(options = {}) {
    super();
    this.apiKey = String(options.apiKey || "");
    this.baseUrl = String(options.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    this.model = String(options.model || "gpt-realtime");
    this.fetch = options.fetch || globalThis.fetch;
    this.sessionConfig = options.sessionConfig || (() => ({}));
    this.timeoutMs = Number(options.timeoutMs || 20_000);
    this.controllers = new Map();
  }

  async connect(options = {}) {
    if (!this.apiKey) throw voiceError("AI_RUNTIME_NOT_CONFIGURED", "OPENAI_API_KEY no está configurada.", 503);
    if (typeof this.fetch !== "function") throw voiceError("VOICE_PROVIDER_UNAVAILABLE", "fetch no está disponible.", 503);
    const controller = new AbortController();
    this.controllers.set(options.sessionId, controller);
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const form = new FormData();
      form.set("sdp", new Blob([options.sdp], { type: "application/sdp" }), "offer.sdp");
      form.set("session", new Blob([JSON.stringify(this.sessionConfig(options))], { type: "application/json" }), "session.json");
      const response = await this.fetch(`${this.baseUrl}/realtime/calls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "OpenAI-Safety-Identifier": safetyIdentifier(options.ownerSessionId),
        },
        body: form,
        signal: controller.signal,
      });
      const answerSdp = await response.text();
      if (!response.ok) {
        throw voiceError("VOICE_PROVIDER_CONNECTION_FAILED", answerSdp.slice(0, 500) || `OpenAI Realtime ${response.status}.`, 502);
      }
      return {
        ok: true,
        provider: "openai-realtime",
        model: this.model,
        answerSdp,
        callId: response.headers.get("location")?.split("/").pop() || null,
      };
    } catch (error) {
      if (error?.name === "AbortError") throw voiceError("VOICE_PROVIDER_TIMEOUT", "La conexión Realtime superó el timeout.", 504);
      throw error;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(options.sessionId);
    }
  }

  async disconnect(sessionId) {
    this.controllers.get(sessionId)?.abort();
    this.controllers.delete(sessionId);
    return { ok: true };
  }

  async interrupt(sessionId) {
    this.controllers.get(sessionId)?.abort();
    return { ok: true, interrupted: true };
  }

  getHealth() {
    return {
      ok: true,
      configured: Boolean(this.apiKey),
      provider: "openai-realtime",
      model: this.model,
      transport: "webrtc-unified",
      apiKeyExposed: false,
    };
  }
}

function safetyIdentifier(sessionId) {
  return crypto.createHash("sha256").update(String(sessionId || "local-operator")).digest("hex");
}

module.exports = { OpenAIRealtimeProvider, safetyIdentifier };
