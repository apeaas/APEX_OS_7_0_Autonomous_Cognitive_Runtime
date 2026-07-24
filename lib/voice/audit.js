"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { sha256, stableStringify } = require("../paper-ledger/contracts");
const { voiceError } = require("./contracts");

const SENSITIVE_KEY = /(api.?key|authorization|token|secret|raw.?audio|audio.?bytes|sdp)/i;

class VoiceAudit {
  constructor(options) {
    this.filePath = options.filePath;
    this.fs = options.fs || fs;
    this.records = [];
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.load();
  }

  append(type, details = {}) {
    const previousChecksum = this.records.at(-1)?.checksum || null;
    const unsigned = {
      id: crypto.randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      details: redact(details),
      rawAudioStored: false,
      previousChecksum,
    };
    const record = deepFreeze({ ...unsigned, checksum: sha256(stableStringify(unsigned)) });
    const handle = this.fs.openSync(this.filePath, "a");
    try {
      this.fs.writeFileSync(handle, `${JSON.stringify(record)}\n`, "utf8");
      this.fs.fsyncSync(handle);
    } finally {
      this.fs.closeSync(handle);
    }
    this.records.push(record);
    return clone(record);
  }

  list(limit = 100) {
    return this.records.slice(-Math.max(1, Math.min(500, Number(limit) || 100))).reverse().map(clone);
  }

  load() {
    if (!this.fs.existsSync(this.filePath)) return;
    let previousChecksum = null;
    const lines = this.fs.readFileSync(this.filePath, "utf8").split(/\r?\n/).filter(Boolean);
    for (const [index, line] of lines.entries()) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        throw voiceError("VOICE_AUDIT_INTEGRITY_FAILURE", `Voice Audit inválido en línea ${index + 1}.`, 500);
      }
      const unsigned = { ...record };
      delete unsigned.checksum;
      if (record.previousChecksum !== previousChecksum || record.checksum !== sha256(stableStringify(unsigned))) {
        throw voiceError("VOICE_AUDIT_INTEGRITY_FAILURE", `Voice Audit corrupto en línea ${index + 1}.`, 500);
      }
      this.records.push(deepFreeze(clone(record)));
      previousChecksum = record.checksum;
    }
  }
}

function redact(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = { VoiceAudit, redact };
