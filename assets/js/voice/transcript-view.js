"use strict";

(function initTranscriptView(root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) module.exports = exported;
  if (root) root.APEX_TRANSCRIPT_VIEW = exported;
})(typeof window !== "undefined" ? window : globalThis, () => {
  class TranscriptView {
    constructor(element, options = {}) {
      this.element = element;
      this.maxEntries = Number(options.maxEntries || 80);
      this.entries = [];
      this.streaming = new Map();
    }

    append(role, text, options = {}) {
      const clean = String(text || "").trim();
      if (!clean || !this.element) return null;
      const article = this.element.ownerDocument.createElement("article");
      article.className = `voice-turn ${role}`;
      article.dataset.turnId = options.id || "";
      const label = this.element.ownerDocument.createElement("strong");
      label.textContent = role === "assistant" ? "APEX" : role === "system" ? "Sistema" : "Vos";
      const content = this.element.ownerDocument.createElement("p");
      content.textContent = clean;
      article.append(label, content);
      this.element.appendChild(article);
      this.entries.push({ role, text: clean, at: new Date().toISOString() });
      while (this.element.children.length > this.maxEntries) this.element.firstElementChild?.remove();
      if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
      this.element.scrollTop = this.element.scrollHeight;
      return article;
    }

    stream(id, delta, role = "assistant") {
      if (!this.element) return;
      let article = this.streaming.get(id);
      if (!article) {
        article = this.append(role, "…", { id });
        this.streaming.set(id, article);
      }
      const paragraph = article?.querySelector("p");
      const current = paragraph?.textContent === "…" ? "" : paragraph?.textContent || "";
      if (paragraph) paragraph.textContent = `${current}${String(delta || "")}`;
      this.element.scrollTop = this.element.scrollHeight;
    }

    complete(id, text, role = "assistant") {
      const article = this.streaming.get(id);
      const clean = String(text || "").trim();
      if (article) {
        const paragraph = article.querySelector("p");
        if (paragraph && clean) paragraph.textContent = clean;
        this.streaming.delete(id);
        return article;
      }
      return this.append(role, clean, { id });
    }

    clear() {
      if (this.element) this.element.textContent = "";
      this.entries = [];
      this.streaming.clear();
    }

    snapshot() {
      return this.entries.map(entry => ({ ...entry }));
    }
  }

  return { TranscriptView };
});
