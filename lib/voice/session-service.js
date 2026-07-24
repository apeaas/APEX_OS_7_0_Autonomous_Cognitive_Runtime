"use strict";

const crypto = require("node:crypto");
const {
  publicVoiceSession,
  validateSdp,
  validateToolCall,
  voiceError,
  voiceLimits,
} = require("./contracts");

class VoiceSessionService {
  constructor(options = {}) {
    this.providers = options.providers || {};
    this.interpreter = options.interpreter;
    this.audit = options.audit;
    this.clock = options.clock || Date.now;
    this.limits = voiceLimits(options.limits);
    this.sessions = new Map();
  }

  create(input = {}, context = {}) {
    this.cleanup();
    const ownerSessionId = requireOwner(context);
    const active = [...this.sessions.values()].find(session => session.ownerSessionId === ownerSessionId && !["disabled", "error"].includes(session.state));
    if (active) throw voiceError("VOICE_SESSION_ALREADY_ACTIVE", "Ya existe una sesión de voz activa.", 409, { sessionId: active.id });
    const requested = input.preferredProvider === "mock" ? "mock" : "openai-realtime";
    const openaiHealth = this.providers["openai-realtime"]?.getHealth?.() || { configured: false };
    const provider = requested === "openai-realtime" && openaiHealth.configured ? "openai-realtime" : "mock";
    const createdAtMs = this.clock();
    const session = {
      id: crypto.randomUUID(),
      ownerSessionId,
      provider,
      state: provider === "mock" ? "listening" : "connecting",
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.limits.sessionTtlMs).toISOString(),
      connectedAt: provider === "mock" ? new Date(createdAtMs).toISOString() : null,
      reconnects: 0,
      toolCalls: 0,
      calls: new Map(),
      fallbackReason: requested !== provider ? "OPENAI_NOT_CONFIGURED" : null,
      limits: this.limits,
    };
    this.sessions.set(session.id, session);
    this.audit?.append("VOICE_SESSION_CREATED", {
      voiceSessionId: session.id,
      ownerSessionId,
      provider,
      fallbackReason: session.fallbackReason,
    });
    return publicVoiceSession(session);
  }

  async connect(id, sdp, context = {}) {
    const session = this.requireSession(id, context);
    if (session.provider !== "openai-realtime") throw voiceError("MOCK_VOICE_HAS_NO_WEBRTC", "El provider mock no crea una llamada WebRTC.", 409);
    if (session.connectedAt) {
      session.reconnects += 1;
      if (session.reconnects > session.limits.maxReconnects) throw voiceError("VOICE_RECONNECT_LIMIT", "Se agotó el límite de reconexiones.", 429);
      session.state = "reconnecting";
    }
    const provider = this.providers[session.provider];
    session.state = "connecting";
    try {
      const result = await provider.connect({
        sessionId: session.id,
        ownerSessionId: session.ownerSessionId,
        sdp: validateSdp(sdp),
      });
      session.state = "listening";
      session.connectedAt = new Date(this.clock()).toISOString();
      session.callId = result.callId || null;
      this.audit?.append("VOICE_SESSION_CONNECTED", {
        voiceSessionId: session.id,
        provider: session.provider,
        model: result.model,
        reconnects: session.reconnects,
      });
      return { session: publicVoiceSession(session), answerSdp: result.answerSdp };
    } catch (error) {
      session.state = "error";
      this.audit?.append("VOICE_SESSION_CONNECTION_FAILED", {
        voiceSessionId: session.id,
        provider: session.provider,
        code: error.code || "VOICE_PROVIDER_CONNECTION_FAILED",
      });
      throw error;
    }
  }

  async executeTool(id, input, context = {}) {
    const session = this.requireSession(id, context);
    const call = validateToolCall(input);
    if (session.calls.has(call.callId)) return { ...clone(session.calls.get(call.callId)), duplicate: true };
    if (session.toolCalls >= session.limits.maxToolCalls) throw voiceError("VOICE_TOOL_LIMIT", "Se alcanzó el límite de herramientas de la sesión.", 429);
    session.toolCalls += 1;
    try {
      const result = await this.interpreter.interpret(call, context);
      const response = { callId: call.callId, ...result, duplicate: false };
      session.calls.set(call.callId, clone(response));
      this.audit?.append("VOICE_TOOL_CALL_COMPLETED", {
        voiceSessionId: session.id,
        callId: call.callId,
        tool: call.name,
        kind: result.kind,
        argumentsHash: hash(call.arguments),
      });
      return response;
    } catch (error) {
      this.audit?.append("VOICE_TOOL_CALL_BLOCKED", {
        voiceSessionId: session.id,
        callId: call.callId,
        tool: call.name,
        code: error.code || "VOICE_TOOL_ERROR",
        argumentsHash: hash(call.arguments),
      });
      throw error;
    }
  }

  async interrupt(id, context = {}) {
    const session = this.requireSession(id, context);
    await this.providers[session.provider]?.interrupt?.(session.id);
    session.state = "interrupted";
    this.audit?.append("VOICE_SESSION_INTERRUPTED", { voiceSessionId: session.id, provider: session.provider });
    return publicVoiceSession(session);
  }

  async disconnect(id, context = {}) {
    const session = this.requireSession(id, context, { allowExpired: true });
    await this.providers[session.provider]?.disconnect?.(session.id);
    session.state = "disabled";
    session.disconnectedAt = new Date(this.clock()).toISOString();
    this.audit?.append("VOICE_SESSION_DISCONNECTED", { voiceSessionId: session.id, provider: session.provider });
    return publicVoiceSession(session);
  }

  getHealth() {
    return {
      ok: true,
      providers: Object.fromEntries(Object.entries(this.providers).map(([name, provider]) => [name, provider.getHealth()])),
      defaultProvider: this.providers["openai-realtime"]?.getHealth?.().configured ? "openai-realtime" : "mock",
      limits: this.limits,
      rawAudioStored: false,
      apiKeyExposed: false,
      toolPolicyVersion: "voice-tool-policy.v1",
    };
  }

  requireSession(id, context, options = {}) {
    const session = this.sessions.get(String(id || ""));
    if (!session) throw voiceError("VOICE_SESSION_NOT_FOUND", "Sesión de voz no encontrada.", 404);
    if (session.ownerSessionId !== requireOwner(context)) throw voiceError("FOREIGN_VOICE_SESSION", "La sesión de voz pertenece a otra sesión local.", 403);
    if (!options.allowExpired && this.clock() >= Date.parse(session.expiresAt)) {
      session.state = "error";
      throw voiceError("VOICE_SESSION_EXPIRED", "La sesión de voz expiró.", 410);
    }
    if (session.state === "disabled" && !options.allowExpired) throw voiceError("VOICE_SESSION_CLOSED", "La sesión de voz está cerrada.", 409);
    return session;
  }

  cleanup() {
    const cutoff = this.clock() - 60 * 60 * 1000;
    for (const [id, session] of this.sessions) {
      if (Date.parse(session.expiresAt) < cutoff || (session.state === "disabled" && Date.parse(session.disconnectedAt || session.createdAt) < cutoff)) {
        this.sessions.delete(id);
      }
    }
  }
}

function requireOwner(context) {
  const owner = String(context?.ownerSessionId || "").trim();
  if (!owner) throw voiceError("VOICE_SESSION_OWNER_REQUIRED", "Falta ownerSessionId.", 401);
  return owner;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { VoiceSessionService };
