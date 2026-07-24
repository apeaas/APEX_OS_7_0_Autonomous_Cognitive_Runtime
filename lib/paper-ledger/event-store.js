"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  EVENT_SCHEMA_VERSION,
  checksumFor,
  validateEvent,
} = require("./contracts");

class LedgerIntegrityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "LedgerIntegrityError";
    this.code = "LEDGER_INTEGRITY_FAILURE";
    this.details = details;
  }
}

class EventStore {
  constructor(options) {
    this.filePath = options.filePath;
    this.clock = options.clock || (() => new Date());
    this.fs = options.fs || fs;
    this.events = [];
    this.idempotency = new Map();
    this.recovery = null;
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.load();
  }

  load() {
    this.events = [];
    this.idempotency.clear();
    if (!this.fs.existsSync(this.filePath)) return [];
    const text = this.fs.readFileSync(this.filePath, "utf8");
    if (!text) return [];
    const terminated = text.endsWith("\n");
    const fragments = text.split(/\r?\n/);
    if (terminated) fragments.pop();
    let previousChecksum = null;
    const validLines = [];

    for (let index = 0; index < fragments.length; index += 1) {
      const line = fragments[index];
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        if (!terminated && index === fragments.length - 1) {
          this.recoverTruncatedTail(text, validLines, index);
          break;
        }
        throw new LedgerIntegrityError("El ledger contiene JSON inválido.", { line: index + 1 });
      }
      const validation = validateEvent(event);
      const expected = checksumFor(event, previousChecksum);
      if (!validation.ok || event.integrity.previousChecksum !== previousChecksum || event.integrity.checksum !== expected) {
        throw new LedgerIntegrityError("Falló la cadena de integridad del ledger.", {
          line: index + 1,
          validation,
          eventId: event?.id,
        });
      }
      if (this.idempotency.has(event.idempotencyKey)) {
        throw new LedgerIntegrityError("Idempotency key duplicada en el ledger.", {
          line: index + 1,
          idempotencyKey: event.idempotencyKey,
        });
      }
      this.events.push(Object.freeze(event));
      this.idempotency.set(event.idempotencyKey, event);
      previousChecksum = event.integrity.checksum;
      validLines.push(line);
    }
    if (!terminated && validLines.length === fragments.length) {
      this.fs.appendFileSync(this.filePath, "\n", "utf8");
    }
    return this.all();
  }

  append(input) {
    return this.appendMany([input])[0];
  }

  appendMany(inputs) {
    if (!Array.isArray(inputs) || !inputs.length) throw new TypeError("Se requiere al menos un evento.");
    const requestedKeys = inputs.map(item => String(item.idempotencyKey || ""));
    if (new Set(requestedKeys).size !== requestedKeys.length) throw new Error("Idempotency keys repetidas en el batch.");
    const existing = requestedKeys.map(key => this.idempotency.get(key)).filter(Boolean);
    if (existing.length) {
      if (existing.length === inputs.length) return existing.map(event => ({ event, duplicate: true }));
      throw new Error("El batch tiene idempotencia parcial; se rechaza para evitar efectos incompletos.");
    }

    const recordedAt = this.clock().toISOString();
    let previousChecksum = this.events.at(-1)?.integrity?.checksum || null;
    const events = inputs.map(input => {
      const event = {
        id: input.id || crypto.randomUUID(),
        type: input.type,
        occurredAt: input.occurredAt || recordedAt,
        recordedAt,
        aggregateId: input.aggregateId || "PAPER-PORTFOLIO",
        idempotencyKey: input.idempotencyKey,
        causationId: input.causationId || input.idempotencyKey,
        correlationId: input.correlationId || input.causationId || input.idempotencyKey,
        sessionId: input.sessionId || "SYSTEM",
        actor: normalizeActor(input.actor),
        payload: input.payload || {},
        policyVersion: input.policyVersion || "paper-ledger.v1",
        schemaVersion: input.schemaVersion || EVENT_SCHEMA_VERSION,
      };
      event.integrity = {
        algorithm: "sha256",
        previousChecksum,
        checksum: checksumFor(event, previousChecksum),
      };
      const validation = validateEvent(event);
      if (!validation.ok) throw Object.assign(new Error(validation.message), { code: validation.code });
      previousChecksum = event.integrity.checksum;
      return event;
    });

    const handle = this.fs.openSync(this.filePath, "a");
    try {
      this.fs.writeFileSync(handle, events.map(event => `${JSON.stringify(event)}\n`).join(""), "utf8");
      this.fs.fsyncSync(handle);
    } finally {
      this.fs.closeSync(handle);
    }
    for (const event of events) {
      const frozen = Object.freeze(event);
      this.events.push(frozen);
      this.idempotency.set(event.idempotencyKey, frozen);
    }
    return events.map(event => ({ event, duplicate: false }));
  }

  findByIdempotencyKey(key) {
    return this.idempotency.get(String(key || "")) || null;
  }

  all() {
    return this.events.slice();
  }

  last() {
    return this.events.at(-1) || null;
  }

  recoverTruncatedTail(original, validLines, lineIndex) {
    const backupPath = `${this.filePath}.truncated-${Date.now()}.bak`;
    this.fs.copyFileSync(this.filePath, backupPath);
    const temporary = `${this.filePath}.recovery-${process.pid}.tmp`;
    const recovered = validLines.length ? `${validLines.join("\n")}\n` : "";
    this.fs.writeFileSync(temporary, recovered, "utf8");
    this.fs.renameSync(temporary, this.filePath);
    this.recovery = {
      code: "TRUNCATED_TAIL_RECOVERED",
      line: lineIndex + 1,
      discardedBytes: Buffer.byteLength(original) - Buffer.byteLength(recovered),
      backupPath,
    };
  }
}

function normalizeActor(actor) {
  if (actor && typeof actor === "object") {
    return {
      type: String(actor.type || "unknown").slice(0, 80),
      id: String(actor.id || "unknown").slice(0, 160),
    };
  }
  return { type: "system", id: String(actor || "APEX").slice(0, 160) };
}

module.exports = { EventStore, LedgerIntegrityError };
