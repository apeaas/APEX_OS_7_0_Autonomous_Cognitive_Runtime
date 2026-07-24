"use strict";

/* APEX OS 6.1 · Event Bus / Persistent Memory UI */
document.addEventListener("DOMContentLoaded", () => {
  const bus = window.APEX_EVENT_BUS;
  if (!bus) return;

  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
  const time = value => new Date(value).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateTime = value => new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const compactType = type => String(type || "EVENT").replaceAll("_", " ");
  const categoryLabel = value => ({
    decision: "decisión", objection: "objeción", audit: "auditoría", outcome: "resultado", observation: "observación"
  })[value] || value;

  const elements = {
    eventCount: byId("eventBusCount"),
    memoryCount: byId("persistentMemoryCount"),
    integrity: byId("eventIntegrityState"),
    lastEvent: byId("lastEventId"),
    decisionCount: byId("memoryDecisionCount"),
    objectionCount: byId("memoryObjectionCount"),
    auditCount: byId("memoryAuditCount"),
    outcomeCount: byId("memoryOutcomeCount"),
    stream: byId("eventStreamList"),
    memory: byId("memoryRecordList"),
    typeFilter: byId("eventTypeFilter"),
    sourceFilter: byId("eventSourceFilter"),
    search: byId("eventSearchInput"),
    replay: byId("replayResult"),
    statusPill: byId("memoryModePill")
  };

  function eventDetail(event) {
    const payload = event.payload || {};
    return payload.message || payload.summary || payload.decision || payload.reason || payload.title ||
      (event.symbol ? `${event.symbol}${event.caseId ? ` · ${event.caseId}` : ""}` : event.category);
  }

  function severityClass(value) {
    if (["error", "danger", "critical"].includes(value)) return "danger";
    if (["warn", "warning"].includes(value)) return "warning";
    if (["success", "good"].includes(value)) return "success";
    return "info";
  }

  function renderStats() {
    const stats = bus.stats();
    if (elements.eventCount) elements.eventCount.textContent = stats.count.toLocaleString("es-AR");
    if (elements.memoryCount) elements.memoryCount.textContent = stats.memoryCount.toLocaleString("es-AR");
    if (elements.lastEvent) elements.lastEvent.textContent = stats.lastEventId || "—";
    if (elements.decisionCount) elements.decisionCount.textContent = stats.decisionCount;
    if (elements.objectionCount) elements.objectionCount.textContent = stats.objectionCount;
    if (elements.auditCount) elements.auditCount.textContent = stats.auditCount;
    if (elements.outcomeCount) elements.outcomeCount.textContent = stats.outcomeCount;
    if (elements.integrity) {
      elements.integrity.textContent = stats.integrity.ok && stats.integrity.storageOnline ? "ÍNTEGRA" : "REVISAR";
      elements.integrity.classList.toggle("bad-state", !(stats.integrity.ok && stats.integrity.storageOnline));
    }
    if (elements.statusPill) elements.statusPill.textContent = stats.integrity.storageOnline ? "MEMORY ONLINE" : "MEMORY DEGRADED";
  }

  function renderEvents() {
    if (!elements.stream) return;
    const filters = {
      type: elements.typeFilter?.value || undefined,
      source: elements.sourceFilter?.value || undefined,
      text: elements.search?.value?.trim() || undefined,
      limit: 80
    };
    const events = bus.query(filters);
    if (!events.length) {
      elements.stream.innerHTML = '<div class="memory-empty">No hay eventos que coincidan con el filtro.</div>';
      return;
    }
    elements.stream.innerHTML = events.map(event => `
      <button class="event-stream-row ${severityClass(event.severity)}" data-event-id="${escapeHtml(event.id)}" type="button">
        <span class="event-severity"></span>
        <time>${time(event.recordedAt)}</time>
        <div><strong>${escapeHtml(compactType(event.type))}</strong><small>${escapeHtml(eventDetail(event))}</small></div>
        <em>${escapeHtml(event.source)}</em>
        <b>#${event.sequence}</b>
      </button>`).join("");
    elements.stream.querySelectorAll("[data-event-id]").forEach(row => row.addEventListener("click", () => showEvent(row.dataset.eventId)));
  }

  function renderMemory() {
    if (!elements.memory) return;
    const memory = bus.getMemory();
    const records = memory.records.slice(0, 50);
    if (!records.length) {
      elements.memory.innerHTML = '<div class="memory-empty">La memoria se construirá con casos, auditorías y resultados paper.</div>';
      return;
    }
    elements.memory.innerHTML = records.map(record => `
      <div class="memory-record-row">
        <span class="memory-category">${escapeHtml(categoryLabel(record.category))}</span>
        <div><strong>${escapeHtml(record.key)}</strong><small>${escapeHtml(record.value)}</small></div>
        <em>${Math.round(Number(record.confidence || 0))}%</em>
        <time>${dateTime(record.lastSeenAt)}</time>
      </div>`).join("");
  }

  function populateFilters() {
    const events = bus.query({ limit: 1000 });
    const types = [...new Set(events.map(event => event.type))].sort();
    const sources = [...new Set(events.map(event => event.source))].sort();
    if (elements.typeFilter) {
      const selected = elements.typeFilter.value;
      elements.typeFilter.innerHTML = '<option value="">Todos los eventos</option>' + types.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(compactType(value))}</option>`).join("");
      elements.typeFilter.value = types.includes(selected) ? selected : "";
    }
    if (elements.sourceFilter) {
      const selected = elements.sourceFilter.value;
      elements.sourceFilter.innerHTML = '<option value="">Todos los agentes</option>' + sources.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
      elements.sourceFilter.value = sources.includes(selected) ? selected : "";
    }
  }

  function showEvent(eventId) {
    const event = bus.query({ limit: 1000 }).find(item => item.id === eventId);
    const holder = byId("eventInspector");
    if (!event || !holder) return;
    holder.innerHTML = `
      <div class="event-inspector-head"><strong>${escapeHtml(compactType(event.type))}</strong><span>${escapeHtml(event.id)}</span></div>
      <div class="event-inspector-grid">
        <span>Origen <b>${escapeHtml(event.source)}</b></span>
        <span>Categoría <b>${escapeHtml(event.category)}</b></span>
        <span>Hora <b>${escapeHtml(dateTime(event.recordedAt))}</b></span>
        <span>Integridad <b>${escapeHtml(event.checksum)}</b></span>
      </div>
      <pre>${escapeHtml(JSON.stringify(event.payload, null, 2))}</pre>`;
  }


  function hydrateActivityFromBus() {
    const activity = byId("activityLog");
    if (!activity || activity.children.length) return;
    bus.query({ limit: 12 }).slice().reverse().forEach(detail => {
      const row = document.createElement("div");
      row.className = "log-entry event-backed-log";
      row.dataset.eventId = detail.id;
      row.innerHTML = `
        <span class="log-time">${time(detail.recordedAt).slice(0, 5)}</span>
        <div class="log-body"><strong>${escapeHtml(detail.source)}</strong><span>${escapeHtml(eventDetail(detail))}</span></div>
        <span class="log-tag">${escapeHtml(detail.type.split("_")[0])}</span>`;
      activity.appendChild(row);
    });
  }

  function renderAll({ filters = false } = {}) {
    renderStats();
    if (filters) populateFilters();
    renderEvents();
    renderMemory();
    const stats = bus.stats();
    const corePackets = byId("corePackets");
    if (corePackets) corePackets.textContent = stats.count.toLocaleString("es-AR");
  }

  byId("exportEventSnapshotBtn")?.addEventListener("click", () => bus.downloadSnapshot());
  byId("exportMemoryBtn")?.addEventListener("click", () => bus.downloadSnapshot("APEX_6_1_Persistent_Memory.json"));
  byId("verifyIntegrityBtn")?.addEventListener("click", () => {
    const result = bus.verifyIntegrity(1000);
    const holder = byId("integrityDetail");
    if (holder) holder.textContent = result.ok
      ? `${result.checked} eventos verificados. Checksums consistentes y almacenamiento disponible.`
      : `${result.invalidIds.length} eventos requieren revisión.`;
    bus.emit("EVENT_STORE_INTEGRITY_VERIFIED", result, { source: "EVENT_BUS", category: "audit", severity: result.ok ? "success" : "error" });
  });
  byId("replayLastCaseBtn")?.addEventListener("click", () => {
    const caseEvent = bus.query({ type: "CASE_DECIDED", limit: 1 })[0];
    const events = caseEvent?.correlationId ? bus.replayCorrelation(caseEvent.correlationId) : [];
    if (elements.replay) elements.replay.textContent = events.length
      ? `${events.length} eventos reconstruidos sin ejecutar efectos secundarios.`
      : "Todavía no existe un caso persistido para reproducir.";
  });

  [elements.typeFilter, elements.sourceFilter].filter(Boolean).forEach(input => input.addEventListener("change", renderEvents));
  elements.search?.addEventListener("input", renderEvents);

  window.addEventListener("apex:event", event => {
    renderAll({ filters: true });
    const detail = event.detail;
    const activity = byId("activityLog");
    if (activity && detail) {
      const row = document.createElement("div");
      row.className = "log-entry event-backed-log";
      row.dataset.eventId = detail.id;
      row.innerHTML = `
        <span class="log-time">${time(detail.recordedAt).slice(0, 5)}</span>
        <div class="log-body"><strong>${escapeHtml(detail.source)}</strong><span>${escapeHtml(eventDetail(detail))}</span></div>
        <span class="log-tag">${escapeHtml(detail.type.split("_")[0])}</span>`;
      activity.prepend(row);
      while (activity.children.length > 80) activity.lastElementChild?.remove();
    }
  });

  hydrateActivityFromBus();
  renderAll({ filters: true });
  const first = bus.query({ limit: 1 })[0];
  if (first) showEvent(first.id);
});
