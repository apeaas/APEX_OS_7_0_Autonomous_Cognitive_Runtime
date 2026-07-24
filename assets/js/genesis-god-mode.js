"use strict";

/* APEX OS Genesis · UI bridge.
   Reads the existing APEX_API; it does not alter trading or governance logic. */
document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);
  const q = (selector, root = document) => root.querySelector(selector);

  function state() {
    try { return window.APEX_API?.getState?.() || null; }
    catch { return null; }
  }

  function syncMeta() {
    const snapshot = state();
    const watch = Number(byId("watchCount")?.textContent || 0);
    const navCount = byId("navAlertCount");
    if (navCount) navCount.textContent = String(watch);

    const connected = String(snapshot?.feedStatus || "").toUpperCase().includes("LIVE");
    const latency = byId("latencyReadout");
    if (latency) latency.textContent = connected ? "óptima" : "reconectando";

    const bots = snapshot?.bots || [];
    const holder = byId("genesisBots");
    if (holder && bots.length) {
      holder.innerHTML = bots.slice(0, 3).map(bot => `
        <div class="${bot.active ? "" : "paused"}">
          <i></i>
          <span><b>${escapeHtml(bot.name)}</b><small>${escapeHtml(bot.last || bot.desc || "Sin actividad")}</small></span>
          <em>${bot.active ? "Activo" : "Pausado"}</em>
        </div>`).join("");
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[char]);
  }

  byId("cockpitChatInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") byId("cockpitChatSend")?.click();
  });

  byId("newChatShortcut")?.addEventListener("click", () => {
    setTimeout(() => byId("chatInput")?.focus(), 260);
  });

  // Poll instead of observing the whole cockpit. Observing a subtree that we also
  // rewrite can create a self-triggering MutationObserver loop.
  setInterval(syncMeta, 1500);
  setTimeout(syncMeta, 300);
});
