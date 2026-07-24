"use strict";

/*
  APEX OS 7.0 · Core Event Bus, Persistent Memory & Runtime Mirror
  Static/local implementation designed for PAPER ONLY operation.
  Events are append-only inside the normal application flow and persisted in localStorage.
*/
(() => {
  const EVENT_KEY = "apex.eventbus.v1.events";
  const MEMORY_KEY = "apex.eventbus.v1.memory";
  const META_KEY = "apex.eventbus.v1.meta";
  const MAX_EVENTS = 1800;
  const MAX_MEMORY_ITEMS = 500;
  const SCHEMA_VERSION = "1.0.0";

  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? clone(fallback);
    } catch {
      return clone(fallback);
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("APEX Event Bus persistence unavailable", error);
      return false;
    }
  };

  const stableStringify = value => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  };

  const checksum = value => {
    const text = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  };

  const deepFreeze = value => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  };

  const uid = (prefix, sequence) => {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    return `${prefix}-${stamp}-${String(sequence).padStart(6, "0")}`;
  };

  const defaultMemory = () => ({
    schemaVersion: SCHEMA_VERSION,
    records: [],
    decisions: [],
    objections: [],
    audits: [],
    outcomes: [],
    lastHydratedAt: null
  });

  class ApexEventBus {
    constructor() {
      this.events = read(EVENT_KEY, []).map(deepFreeze);
      this.memory = read(MEMORY_KEY, defaultMemory());
      this.meta = read(META_KEY, { sequence: this.events.length, createdAt: new Date().toISOString(), lastSignatures: {} });
      this.subscribers = new Map();
      this.storageOnline = true;
      this.seedIfEmpty();
      this.emit("SYSTEM_BOOT", {
        message: "APEX OS 7.0 iniciado con Event Bus, memoria persistente y Autonomous Cognitive Runtime.",
        mode: "PAPER_ONLY",
        restoredEvents: this.events.length,
        restoredMemories: this.memory.records.length
      }, { source: "APEX_CORE", category: "system", severity: "info" });
    }

    seedIfEmpty() {
      if (this.events.length) return;
      this.emit("EVENT_BUS_INITIALIZED", {
        schemaVersion: SCHEMA_VERSION,
        persistence: "localStorage",
        appendOnly: true
      }, { source: "EVENT_BUS", category: "system", severity: "success" });
      this.emit("GOVERNANCE_POLICY_LOADED", {
        autonomyCapPct: 5,
        liveTrading: false,
        executionMode: "PAPER_ONLY"
      }, { source: "GOVERNANCE", category: "governance", severity: "success" });
      this.emit("MEMORY_STORE_INITIALIZED", {
        domains: ["decisions", "objections", "audits", "outcomes", "observations"]
      }, { source: "MEMORY", category: "memory", severity: "success" });
    }

    emit(type, payload = {}, meta = {}) {
      if (!type || typeof type !== "string") throw new Error("APEX event type is required");
      this.meta.sequence = Number(this.meta.sequence || 0) + 1;
      const core = {
        schemaVersion: SCHEMA_VERSION,
        id: uid("EVT", this.meta.sequence),
        sequence: this.meta.sequence,
        type: type.toUpperCase(),
        category: String(meta.category || "activity").toLowerCase(),
        source: String(meta.source || payload.source || "APEX_CORE").toUpperCase(),
        severity: String(meta.severity || "info").toLowerCase(),
        occurredAt: meta.occurredAt || new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        correlationId: meta.correlationId || payload.correlationId || null,
        caseId: meta.caseId || payload.caseId || null,
        symbol: meta.symbol || payload.symbol || null,
        immutable: true,
        payload: clone(payload)
      };
      const event = deepFreeze({ ...core, checksum: checksum(core) });
      this.events.push(event);
      if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
      this.ingestMemory(event);
      this.persist();
      this.notify(event);
      return clone(event);
    }

    emitIfChanged(key, signature, type, payload = {}, meta = {}) {
      const value = String(signature ?? "");
      if (this.meta.lastSignatures?.[key] === value) return null;
      this.meta.lastSignatures = this.meta.lastSignatures || {};
      this.meta.lastSignatures[key] = value;
      return this.emit(type, payload, meta);
    }

    emitDedupe(key, minIntervalMs, type, payload = {}, meta = {}) {
      const now = Date.now();
      const lastKey = `time:${key}`;
      const last = Number(this.meta.lastSignatures?.[lastKey] || 0);
      if (now - last < minIntervalMs) return null;
      this.meta.lastSignatures = this.meta.lastSignatures || {};
      this.meta.lastSignatures[lastKey] = now;
      return this.emit(type, payload, meta);
    }

    ingestMemory(event) {
      const p = event.payload || {};
      const common = {
        eventId: event.id,
        timestamp: event.occurredAt,
        source: event.source,
        caseId: event.caseId,
        symbol: event.symbol,
        correlationId: event.correlationId
      };

      if (event.type === "CASE_DECIDED") {
        this.pushMemory("decisions", { ...common, decision: p.decision, consensus: p.consensus, autonomous: p.autonomous, hypothesis: p.hypothesis });
        this.upsertRecord("decision", event.caseId || event.id, p.decision || "Sin decisión", p.consensus || 0, common);
      }
      if (event.type === "PROSECUTOR_OBJECTION" || event.type === "RISK_VETO") {
        this.pushMemory("objections", { ...common, title: p.title || p.reason || "Objeción", detail: p.detail || p.message || "" });
        this.upsertRecord("objection", `${event.caseId || event.id}:${p.title || p.reason || "obj"}`, p.detail || p.message || p.title, p.confidence || 70, common);
      }
      if (event.type === "GOVERNANCE_AUDIT_COMPLETED") {
        this.pushMemory("audits", { ...common, trustScore: p.trustScore, autonomyState: p.autonomyState, autonomyCapPct: p.autonomyCapPct });
        this.upsertRecord("audit", event.id, `${p.autonomyState} · Trust ${p.trustScore}`, p.trustScore || 0, common);
      }
      if (["PAPER_TRADE_OPENED", "PAPER_TRADE_CLOSED", "PAPER_PORTFOLIO_RESET"].includes(event.type)) {
        this.pushMemory("outcomes", { ...common, eventType: event.type, ...clone(p) });
        this.upsertRecord("outcome", p.tradeId || event.id, p.reason || event.type, p.pnl >= 0 ? 80 : 60, common);
      }
      if (["DECISION_SYNTHESIZED", "MARKET_REGIME_OBSERVED", "DATA_FEED_CONNECTED"].includes(event.type)) {
        this.upsertRecord("observation", `${event.type}:${event.symbol || "GLOBAL"}`, p.summary || p.message || event.type, p.confidence || 65, common);
      }
      this.memory.lastHydratedAt = new Date().toISOString();
    }

    pushMemory(bucket, record) {
      if (!Array.isArray(this.memory[bucket])) this.memory[bucket] = [];
      this.memory[bucket].unshift(clone(record));
      if (this.memory[bucket].length > MAX_MEMORY_ITEMS) this.memory[bucket].length = MAX_MEMORY_ITEMS;
    }

    upsertRecord(category, key, value, confidence, common = {}) {
      const id = `${category}:${key}`;
      const existing = this.memory.records.find(item => item.id === id);
      if (existing) {
        existing.value = value;
        existing.confidence = Number(confidence || existing.confidence || 0);
        existing.lastSeenAt = common.timestamp || new Date().toISOString();
        existing.lastEventId = common.eventId || existing.lastEventId;
        existing.occurrences = Number(existing.occurrences || 1) + 1;
        return;
      }
      this.memory.records.unshift({
        id,
        category,
        key,
        value,
        confidence: Number(confidence || 0),
        firstSeenAt: common.timestamp || new Date().toISOString(),
        lastSeenAt: common.timestamp || new Date().toISOString(),
        lastEventId: common.eventId || null,
        source: common.source || "APEX_CORE",
        caseId: common.caseId || null,
        symbol: common.symbol || null,
        occurrences: 1
      });
      if (this.memory.records.length > MAX_MEMORY_ITEMS) this.memory.records.length = MAX_MEMORY_ITEMS;
    }

    persist() {
      const eventsOk = write(EVENT_KEY, this.events);
      const memoryOk = write(MEMORY_KEY, this.memory);
      const metaOk = write(META_KEY, this.meta);
      this.storageOnline = eventsOk && memoryOk && metaOk;
    }

    subscribe(type, handler) {
      const key = String(type || "*").toUpperCase();
      if (!this.subscribers.has(key)) this.subscribers.set(key, new Set());
      this.subscribers.get(key).add(handler);
      return () => this.subscribers.get(key)?.delete(handler);
    }

    notify(event) {
      ["*", event.type].forEach(key => {
        this.subscribers.get(key)?.forEach(handler => {
          try { handler(clone(event)); } catch (error) { console.error("APEX subscriber error", error); }
        });
      });
      window.dispatchEvent(new CustomEvent("apex:event", { detail: clone(event) }));
    }

    query(filters = {}) {
      const types = filters.type ? [filters.type].flat().map(value => String(value).toUpperCase()) : null;
      const source = filters.source ? String(filters.source).toUpperCase() : null;
      const category = filters.category ? String(filters.category).toLowerCase() : null;
      const caseId = filters.caseId || null;
      const symbol = filters.symbol || null;
      const text = String(filters.text || "").toLowerCase();
      const limit = Math.max(1, Math.min(Number(filters.limit || 100), 1000));
      return this.events.slice().reverse().filter(event => {
        if (types && !types.includes(event.type)) return false;
        if (source && event.source !== source) return false;
        if (category && event.category !== category) return false;
        if (caseId && event.caseId !== caseId) return false;
        if (symbol && event.symbol !== symbol) return false;
        if (text && !stableStringify(event).toLowerCase().includes(text)) return false;
        return true;
      }).slice(0, limit).map(clone);
    }

    getMemory() { return clone(this.memory); }

    verifyIntegrity(limit = 250) {
      const sample = this.events.slice(-Math.max(1, limit));
      const invalid = sample.filter(event => {
        const { checksum: stored, ...core } = event;
        return checksum(core) !== stored;
      });
      return {
        ok: invalid.length === 0,
        checked: sample.length,
        invalidIds: invalid.map(event => event.id),
        storageOnline: this.storageOnline
      };
    }

    stats() {
      const integrity = this.verifyIntegrity(150);
      const byCategory = this.events.reduce((acc, event) => {
        acc[event.category] = (acc[event.category] || 0) + 1;
        return acc;
      }, {});
      return {
        count: this.events.length,
        firstEventAt: this.events[0]?.recordedAt || null,
        lastEventAt: this.events.at(-1)?.recordedAt || null,
        lastEventId: this.events.at(-1)?.id || null,
        memoryCount: this.memory.records.length,
        decisionCount: this.memory.decisions.length,
        objectionCount: this.memory.objections.length,
        auditCount: this.memory.audits.length,
        outcomeCount: this.memory.outcomes.length,
        byCategory,
        integrity
      };
    }

    replayCorrelation(correlationId) {
      const id = correlationId || this.events.slice().reverse().find(event => event.correlationId)?.correlationId;
      if (!id) return [];
      const events = this.events.filter(event => event.correlationId === id).map(clone);
      this.emit("EVENT_REPLAY_REQUESTED", {
        correlationId: id,
        replayedEventIds: events.map(event => event.id),
        eventCount: events.length,
        sideEffects: false
      }, { source: "EVENT_BUS", category: "audit", severity: "info", correlationId: id });
      return events;
    }

    exportSnapshot() {
      return {
        exportedAt: new Date().toISOString(),
        mode: "PAPER_ONLY",
        schemaVersion: SCHEMA_VERSION,
        stats: this.stats(),
        events: clone(this.events),
        memory: clone(this.memory)
      };
    }

    downloadSnapshot(filename = "APEX_7_0_Event_Bus_Memory.json") {
      const blob = new Blob([JSON.stringify(this.exportSnapshot(), null, 2)], { type: "application/json;charset=utf-8" });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
      this.emit("AUDIT_SNAPSHOT_EXPORTED", { filename }, { source: "EVENT_BUS", category: "audit", severity: "success" });
    }
  }

  window.ApexEventBus = ApexEventBus;
  window.APEX_EVENT_BUS = new ApexEventBus();
})();
