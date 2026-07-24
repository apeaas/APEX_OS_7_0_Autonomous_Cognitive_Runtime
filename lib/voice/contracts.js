"use strict";

const VOICE_STATES = Object.freeze([
  "disabled",
  "requesting_permission",
  "connecting",
  "listening",
  "processing",
  "speaking",
  "interrupted",
  "reconnecting",
  "error",
]);

const VOICE_TRANSITIONS = Object.freeze({
  disabled: ["requesting_permission", "connecting"],
  requesting_permission: ["connecting", "disabled", "error"],
  connecting: ["listening", "reconnecting", "disabled", "error"],
  listening: ["processing", "speaking", "interrupted", "reconnecting", "disabled", "error"],
  processing: ["listening", "speaking", "interrupted", "reconnecting", "disabled", "error"],
  speaking: ["listening", "processing", "interrupted", "reconnecting", "disabled", "error"],
  interrupted: ["listening", "processing", "reconnecting", "disabled", "error"],
  reconnecting: ["connecting", "listening", "disabled", "error"],
  error: ["requesting_permission", "connecting", "reconnecting", "disabled"],
});

const DEFAULT_VOICE_LIMITS = Object.freeze({
  sessionTtlMs: 15 * 60 * 1000,
  maxReconnects: 3,
  maxToolCalls: 40,
  maxResponses: 48,
  connectTimeoutMs: 20_000,
});

function voiceLimits(input = {}) {
  return Object.freeze({
    sessionTtlMs: clamp(input.sessionTtlMs, 60_000, 60 * 60 * 1000, DEFAULT_VOICE_LIMITS.sessionTtlMs),
    maxReconnects: clamp(input.maxReconnects, 0, 10, DEFAULT_VOICE_LIMITS.maxReconnects),
    maxToolCalls: clamp(input.maxToolCalls, 1, 200, DEFAULT_VOICE_LIMITS.maxToolCalls),
    maxResponses: clamp(input.maxResponses, 1, 200, DEFAULT_VOICE_LIMITS.maxResponses),
    connectTimeoutMs: clamp(input.connectTimeoutMs, 2_000, 60_000, DEFAULT_VOICE_LIMITS.connectTimeoutMs),
  });
}

function validateSdp(value) {
  const sdp = String(value || "");
  if (!sdp.startsWith("v=0") || !sdp.includes("\nm=audio ") || sdp.length > 256_000) {
    throw voiceError("INVALID_VOICE_SDP", "La oferta SDP de voz no es válida.", 400);
  }
  return sdp;
}

function validateToolCall(input) {
  const callId = String(input?.callId || "").trim();
  const name = String(input?.name || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(callId)) throw voiceError("INVALID_VOICE_TOOL_CALL", "callId inválido.", 400);
  if (!/^[a-z][a-z0-9_]{1,80}$/.test(name)) throw voiceError("INVALID_VOICE_TOOL_CALL", "name inválido.", 400);
  if (!input.arguments || typeof input.arguments !== "object" || Array.isArray(input.arguments)) {
    throw voiceError("INVALID_VOICE_TOOL_CALL", "arguments debe ser un objeto.", 400);
  }
  return { callId, name, arguments: clone(input.arguments) };
}

function voiceError(code, message, statusCode = 400, details) {
  return Object.assign(new Error(message), { code, statusCode, details });
}

function publicVoiceSession(session) {
  return {
    id: session.id,
    provider: session.provider,
    state: session.state,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    connectedAt: session.connectedAt || null,
    reconnects: session.reconnects,
    toolCalls: session.toolCalls,
    fallbackReason: session.fallbackReason || null,
    limits: session.limits,
    rawAudioStored: false,
    apiKeyExposed: false,
  };
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  DEFAULT_VOICE_LIMITS,
  VOICE_STATES,
  VOICE_TRANSITIONS,
  publicVoiceSession,
  validateSdp,
  validateToolCall,
  voiceError,
  voiceLimits,
};
