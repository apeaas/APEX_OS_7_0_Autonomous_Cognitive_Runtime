"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { sha256, stableStringify } = require("../paper-ledger/contracts");

class DecisionJournal {
  constructor(options) {
    this.filePath = options.filePath;
    this.fs = options.fs || fs;
    this.entries = [];
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.load();
  }

  append(input) {
    validateEntry(input);
    const previousChecksum = this.entries.at(-1)?.checksum || null;
    const unsigned = {
      id: input.id || crypto.randomUUID(),
      occurredAt: input.occurredAt || new Date().toISOString(),
      context: clone(input.context),
      evidence: clone(input.evidence),
      intent: clone(input.intent),
      risk: clone(input.risk),
      governance: clone(input.governance),
      decision: input.decision,
      latencyMs: Number(input.latencyMs),
      outcome: clone(input.outcome ?? null),
      interpretationError: clone(input.interpretationError ?? null),
      timingError: clone(input.timingError ?? null),
      executionError: clone(input.executionError ?? null),
      previousChecksum,
    };
    const entry = deepFreeze({ ...unsigned, checksum: sha256(stableStringify(unsigned)) });
    const handle = this.fs.openSync(this.filePath, "a");
    try {
      this.fs.writeFileSync(handle, `${JSON.stringify(entry)}\n`, "utf8");
      this.fs.fsyncSync(handle);
    } finally {
      this.fs.closeSync(handle);
    }
    this.entries.push(entry);
    return clone(entry);
  }

  list(limit = 100) {
    return this.entries.slice(-Math.max(1, Math.min(500, Number(limit) || 100))).reverse().map(clone);
  }

  load() {
    if (!this.fs.existsSync(this.filePath)) return;
    const lines = this.fs.readFileSync(this.filePath, "utf8").split(/\r?\n/).filter(Boolean);
    let previousChecksum = null;
    for (const [index, line] of lines.entries()) {
      const entry = JSON.parse(line);
      const unsigned = { ...entry };
      delete unsigned.checksum;
      if (entry.previousChecksum !== previousChecksum || entry.checksum !== sha256(stableStringify(unsigned))) {
        throw Object.assign(new Error(`Decision Journal corrupto en línea ${index + 1}.`), { code: "DECISION_JOURNAL_INTEGRITY_FAILURE" });
      }
      this.entries.push(deepFreeze(clone(entry)));
      previousChecksum = entry.checksum;
    }
  }
}

function validateEntry(input) {
  for (const field of ["context", "evidence", "intent", "risk", "governance", "decision"]) {
    if (input?.[field] == null) throw Object.assign(new Error(`${field} es obligatorio en Decision Journal.`), { code: "INVALID_DECISION_JOURNAL_ENTRY" });
  }
  if (!Number.isFinite(Number(input.latencyMs)) || Number(input.latencyMs) < 0) {
    throw Object.assign(new Error("latencyMs inválido."), { code: "INVALID_DECISION_JOURNAL_ENTRY" });
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = { DecisionJournal };
