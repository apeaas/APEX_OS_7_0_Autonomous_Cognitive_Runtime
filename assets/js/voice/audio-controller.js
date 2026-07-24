"use strict";

(function initAudioController(root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) module.exports = exported;
  if (root) root.APEX_AUDIO_CONTROLLER = exported;
})(typeof window !== "undefined" ? window : globalThis, () => {
  class AudioController {
    constructor(options = {}) {
      this.mediaDevices = options.mediaDevices || globalThis.navigator?.mediaDevices;
      this.document = options.document || globalThis.document;
      this.stream = null;
      this.remoteAudio = null;
      this.remoteStream = null;
      this.muted = false;
    }

    async requestMicrophone() {
      if (!this.mediaDevices || typeof this.mediaDevices.getUserMedia !== "function") {
        throw audioError("MICROPHONE_DEVICE_UNAVAILABLE", "No hay API de micrófono disponible.");
      }
      try {
        this.stream = await this.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (error) {
        if (["NotAllowedError", "SecurityError"].includes(error?.name)) {
          throw audioError("MICROPHONE_PERMISSION_DENIED", "Permiso de micrófono denegado.");
        }
        if (["NotFoundError", "DevicesNotFoundError"].includes(error?.name)) {
          throw audioError("MICROPHONE_DEVICE_NOT_FOUND", "No se encontró un dispositivo de micrófono.");
        }
        throw audioError("MICROPHONE_REQUEST_FAILED", error?.message || "No se pudo abrir el micrófono.");
      }
      this.setMuted(this.muted);
      return this.stream;
    }

    addTracks(peerConnection) {
      if (!this.stream) throw audioError("MICROPHONE_NOT_READY", "El micrófono no está listo.");
      for (const track of this.stream.getTracks()) peerConnection.addTrack(track, this.stream);
    }

    attachRemote(event) {
      if (!this.document) return null;
      if (!this.remoteAudio) {
        this.remoteAudio = this.document.createElement("audio");
        this.remoteAudio.autoplay = true;
        this.remoteAudio.hidden = true;
        this.remoteAudio.setAttribute("data-apex-voice-output", "true");
        this.document.body?.appendChild(this.remoteAudio);
      }
      this.remoteStream = event?.streams?.[0] || null;
      this.remoteAudio.srcObject = this.remoteStream;
      return this.remoteAudio;
    }

    setMuted(muted) {
      this.muted = Boolean(muted);
      for (const track of this.stream?.getAudioTracks?.() || []) track.enabled = !this.muted;
      return this.muted;
    }

    stopRemotePlayback() {
      try { this.remoteAudio?.pause?.(); } catch {}
      if (this.remoteAudio) this.remoteAudio.srcObject = null;
    }

    async resumeRemotePlayback() {
      if (!this.remoteAudio || !this.remoteStream) return false;
      if (this.remoteAudio.srcObject !== this.remoteStream) this.remoteAudio.srcObject = this.remoteStream;
      try {
        await this.remoteAudio.play?.();
        return true;
      } catch {
        return false;
      }
    }

    stop() {
      for (const track of this.stream?.getTracks?.() || []) track.stop();
      this.stream = null;
      this.stopRemotePlayback();
      this.remoteStream = null;
      this.remoteAudio?.remove?.();
      this.remoteAudio = null;
    }

    getHealth() {
      return {
        available: Boolean(this.mediaDevices?.getUserMedia),
        active: Boolean(this.stream),
        muted: this.muted,
        rawAudioStored: false,
      };
    }
  }

  function audioError(code, message) {
    return Object.assign(new Error(message), { code });
  }

  return { AudioController, audioError };
});
