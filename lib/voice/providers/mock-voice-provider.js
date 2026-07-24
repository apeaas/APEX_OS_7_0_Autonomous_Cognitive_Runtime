"use strict";

const { VoiceProvider } = require("./voice-provider");
const { voiceError } = require("../contracts");

class MockVoiceProvider extends VoiceProvider {
  constructor(options = {}) {
    super();
    this.failConnect = Boolean(options.failConnect);
    this.sessions = new Map();
  }

  async connect(options = {}) {
    if (this.failConnect) throw voiceError("MOCK_VOICE_CONNECTION_FAILED", "Fallo determinístico del mock.", 503);
    this.sessions.set(options.sessionId, { connected: true, context: null, interrupted: false });
    return { ok: true, provider: "mock", model: "deterministic-mock", answerSdp: null };
  }

  async disconnect(sessionId) {
    this.sessions.delete(sessionId);
    return { ok: true };
  }

  async sendContext(sessionId, context) {
    const session = this.sessions.get(sessionId);
    if (!session) throw voiceError("VOICE_SESSION_NOT_FOUND", "Sesión mock no encontrada.", 404);
    session.context = clone(context);
    return { ok: true };
  }

  async interrupt(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) session.interrupted = true;
    return { ok: true, interrupted: Boolean(session) };
  }

  simulate(input) {
    const transcript = String(input || "").trim();
    if (!transcript) throw voiceError("EMPTY_VOICE_TRANSCRIPT", "El transcript está vacío.", 400);
    const normalized = transcript.toLowerCase();
    if (normalized.includes("portfolio")) {
      return { transcript, toolCall: { name: "get_paper_portfolio", arguments: {} } };
    }
    if (normalized.includes("ejecut") || normalized.includes("retir")) {
      return { transcript, toolCall: { name: "execute_trade", arguments: {} } };
    }
    return { transcript, response: `Mock de voz: recibí “${transcript}”. No se utilizó audio real.` };
  }

  getHealth() {
    return {
      ok: true,
      configured: true,
      provider: "mock",
      model: "deterministic-mock",
      transport: "none",
      realVoice: false,
      apiKeyExposed: false,
    };
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { MockVoiceProvider };
