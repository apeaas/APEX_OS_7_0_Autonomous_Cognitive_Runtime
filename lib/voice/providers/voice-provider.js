"use strict";

class VoiceProvider {
  async connect() {
    throw new Error("VoiceProvider.connect no implementado.");
  }

  async disconnect() {
    return { ok: true };
  }

  async sendContext() {
    return { ok: true };
  }

  async interrupt() {
    return { ok: true };
  }

  getHealth() {
    return { ok: false, configured: false, provider: "abstract" };
  }
}

module.exports = { VoiceProvider };
