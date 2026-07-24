"use strict";

(() => {
  let projection = null;
  let migration = { imported: false };
  const subscribers = new Set();

  function normalize(value) {
    const source = value || {};
    return {
      ...source,
      cash: Number(source.cash || 0),
      equity: Number(source.equity || 0),
      realized: Number(source.realizedPnL || 0),
      realizedPnL: Number(source.realizedPnL || 0),
      unrealizedPnL: Number(source.unrealizedPnL || 0),
      positions: Array.isArray(source.positions) ? source.positions : [],
      closedTrades: Array.isArray(source.closedTrades) ? source.closedTrades : [],
      version: Number(source.version || 0),
    };
  }

  function publish(next) {
    projection = normalize(next);
    for (const subscriber of subscribers) {
      try { subscriber(snapshot()); } catch (error) { console.warn("APEX portfolio subscriber failed", error); }
    }
    window.dispatchEvent(new CustomEvent("apex:portfolio-projection", { detail: snapshot() }));
    return snapshot();
  }

  function snapshot() {
    return projection ? JSON.parse(JSON.stringify(projection)) : null;
  }

  async function start() {
    const response = await fetch("/api/portfolio", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.message || "No se pudo cargar el portfolio PAPER.");
    migration = body.migration || migration;
    publish(body.projection);
    await offerLegacyMigration();
    return snapshot();
  }

  async function refresh() {
    return start();
  }

  async function offerLegacyMigration() {
    const raw = localStorage.getItem("apex-portfolio");
    if (!raw || migration.imported) return;
    let legacy;
    try { legacy = JSON.parse(raw); } catch {
      localStorage.setItem("apex-portfolio-backup-v7.0", JSON.stringify({ archivedAt: new Date().toISOString(), operational: false, parseError: true, raw }));
      localStorage.removeItem("apex-portfolio");
      return;
    }
    const accepted = window.confirm("APEX 7.1 detectó un portfolio PAPER heredado. ¿Importarlo una única vez al ledger canónico del backend?");
    if (!accepted) return;
    const response = await fetch("/api/portfolio/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolio: legacy, expectedVersion: projection?.version }),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.message || "La migración PAPER fue rechazada.");
    localStorage.setItem("apex-portfolio-backup-v7.0", JSON.stringify({
      archivedAt: new Date().toISOString(),
      operational: false,
      checksum: body.checksum,
      fingerprint: body.fingerprint,
      portfolio: legacy,
    }));
    localStorage.removeItem("apex-portfolio");
    migration = { imported: true, fingerprint: body.fingerprint };
    publish(body.projection);
  }

  async function command(input) {
    if (!projection) await start();
    const paperCommand = { ...input, expectedVersion: projection.version };
    if (String(input.source || "").toUpperCase() !== "AUTONOMOUS_RUNTIME") {
      const draftResponse = await fetch("/api/decision/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: paperCommand }),
      });
      const draftBody = await draftResponse.json();
      if (!draftResponse.ok || !draftBody.ok) throw new Error(draftBody.message || "No se pudo preparar la confirmación.");
      const accepted = window.confirm(formatConfirmation(draftBody.draft));
      if (!accepted) throw new Error("Comando PAPER cancelado por el operador.");
      const confirmationResponse = await fetch(`/api/decision/drafts/${encodeURIComponent(draftBody.draft.id)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });
      const confirmationBody = await confirmationResponse.json();
      if (!confirmationResponse.ok || !confirmationBody.ok) throw new Error(confirmationBody.message || "No se pudo confirmar el draft.");
      paperCommand.draftId = draftBody.draft.id;
      paperCommand.confirmationId = confirmationBody.confirmation.id;
    }
    const response = await fetch("/api/paper/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paperCommand),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) {
      if (response.status === 409) await refresh().catch(() => {});
      throw new Error(body.message || "El ledger PAPER rechazó el comando.");
    }
    publish(body.projection);
    return body;
  }

  function formatConfirmation(draft) {
    const view = draft.interpretation || {};
    const feed = draft.feedEvidence || {};
    return [
      "Confirmación constitucional PAPER",
      `Acción: ${view.action || "desconocida"}`,
      `Símbolo: ${view.symbol || "N/A"}`,
      `Tamaño solicitado: ${view.requestedSize ?? "N/A"}`,
      `Posición: ${view.positionId || "N/A"}`,
      `Feed: ${feed.status || "unknown"} · trusted=${feed.trusted === true}`,
      `Expira: ${draft.expiresAt}`,
      draft.consequences?.summary || "Mutación PAPER auditada.",
      "No existe efecto live.",
    ].join("\n");
  }

  function subscribe(callback) {
    subscribers.add(callback);
    if (projection) callback(snapshot());
    return () => subscribers.delete(callback);
  }

  window.APEX_PAPER_PORTFOLIO = Object.freeze({
    start,
    refresh,
    snapshot,
    subscribe,
    open: input => command({ ...input, type: "open_position" }),
    modify: input => command({ ...input, type: "modify_position" }),
    close: input => command({ ...input, type: "close_position" }),
    migrationStatus: () => ({ ...migration }),
  });
})();
