"use strict";

(function initVoiceState(root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) module.exports = exported;
  if (root) root.APEX_VOICE_STATE = exported;
})(typeof window !== "undefined" ? window : globalThis, () => {
  const STATES = Object.freeze([
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

  const TRANSITIONS = Object.freeze({
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

  class VoiceState {
    constructor(initial = "disabled") {
      if (!STATES.includes(initial)) throw stateError("INVALID_VOICE_STATE", `Estado inválido: ${initial}.`);
      this.value = initial;
      this.details = {};
      this.listeners = new Set();
    }

    transition(next, details = {}) {
      if (!STATES.includes(next)) throw stateError("INVALID_VOICE_STATE", `Estado inválido: ${next}.`);
      if (next !== this.value && !TRANSITIONS[this.value]?.includes(next)) {
        throw stateError("INVALID_VOICE_TRANSITION", `No se permite ${this.value} → ${next}.`);
      }
      const previous = this.value;
      this.value = next;
      this.details = { ...details };
      const snapshot = this.snapshot();
      for (const listener of this.listeners) listener(snapshot, previous);
      return snapshot;
    }

    fail(error) {
      return this.transition("error", {
        code: error?.code || "VOICE_ERROR",
        message: String(error?.message || error || "Error de voz."),
      });
    }

    subscribe(listener) {
      this.listeners.add(listener);
      listener(this.snapshot(), null);
      return () => this.listeners.delete(listener);
    }

    snapshot() {
      return { state: this.value, details: { ...this.details } };
    }
  }

  function stateError(code, message) {
    return Object.assign(new Error(message), { code });
  }

  return { STATES, TRANSITIONS, VoiceState };
});
