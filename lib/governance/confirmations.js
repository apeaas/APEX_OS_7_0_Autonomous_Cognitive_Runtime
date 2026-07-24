"use strict";

const crypto = require("node:crypto");
const {
  commandFingerprint,
  sanitizeCommand,
  validateCommandDraft,
  validateHumanConfirmation,
} = require("../decision-contracts/contracts");

class ConfirmationRegistry {
  constructor(options = {}) {
    this.clock = options.clock || (() => Date.now());
    this.draftTtlMs = Number(options.draftTtlMs || 2 * 60 * 1000);
    this.confirmationTtlMs = Number(options.confirmationTtlMs || 60 * 1000);
    this.drafts = new Map();
    this.confirmations = new Map();
  }

  createDraft(command, context = {}) {
    this.prune();
    if (!["open_position", "close_position", "modify_position"].includes(command?.type)) {
      throw confirmationError("UNSUPPORTED_DRAFT_COMMAND", "El draft sólo admite comandos PAPER registrados.");
    }
    const now = this.clock();
    const sanitized = sanitizeCommand(command);
    const draft = {
      id: crypto.randomUUID(),
      schemaVersion: "command-draft.v1",
      sessionId: context.sessionId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.draftTtlMs).toISOString(),
      command: sanitized,
      commandFingerprint: commandFingerprint(sanitized),
      interpretation: disclosure(sanitized),
      feedEvidence: context.feedEvidence || { status: "not_applicable", trusted: true },
      consequences: {
        executionMode: "PAPER_ONLY",
        ledgerMutation: true,
        liveEffect: false,
        summary: consequence(sanitized),
      },
      status: "AWAITING_HUMAN_CONFIRMATION",
    };
    const validation = validateCommandDraft(draft);
    if (!validation.ok) throw confirmationError(validation.code, validation.message);
    this.drafts.set(draft.id, draft);
    return publicCopy(draft);
  }

  confirm(draftId, input, context = {}) {
    this.prune();
    const draft = this.drafts.get(String(draftId || ""));
    if (!draft) throw confirmationError("DRAFT_NOT_FOUND", "Draft inexistente o expirado.", 404);
    if (draft.sessionId !== context.sessionId) throw confirmationError("FOREIGN_DRAFT", "El draft pertenece a otra sesión.", 403);
    if (draft.status !== "AWAITING_HUMAN_CONFIRMATION") throw confirmationError("DRAFT_ALREADY_USED", "El draft ya fue utilizado.", 409);
    if (input?.accepted !== true) throw confirmationError("HUMAN_CONFIRMATION_REQUIRED", "La confirmación humana explícita es obligatoria.", 400);
    const now = this.clock();
    const confirmation = {
      id: crypto.randomUUID(),
      schemaVersion: "human-confirmation.v1",
      draftId: draft.id,
      sessionId: context.sessionId,
      commandFingerprint: draft.commandFingerprint,
      confirmedAt: new Date(now).toISOString(),
      expiresAt: new Date(Math.min(Date.parse(draft.expiresAt), now + this.confirmationTtlMs)).toISOString(),
      consumedAt: null,
      status: "CONFIRMED",
    };
    const validation = validateHumanConfirmation(confirmation);
    if (!validation.ok) throw confirmationError(validation.code, validation.message);
    draft.status = "CONFIRMED";
    this.confirmations.set(confirmation.id, confirmation);
    return publicCopy(confirmation);
  }

  consume(draftId, confirmationId, command, context = {}) {
    this.prune();
    const draft = this.drafts.get(String(draftId || ""));
    const confirmation = this.confirmations.get(String(confirmationId || ""));
    if (!draft || !confirmation) throw confirmationError("CONFIRMATION_NOT_FOUND", "Confirmación inexistente o expirada.", 404);
    if (draft.sessionId !== context.sessionId || confirmation.sessionId !== context.sessionId) {
      throw confirmationError("FOREIGN_CONFIRMATION", "La confirmación pertenece a otra sesión.", 403);
    }
    if (confirmation.consumedAt || confirmation.status !== "CONFIRMED") {
      if (confirmation.consumedBy === context.idempotencyKey) {
        return { draft: publicCopy(draft), confirmation: publicCopy(confirmation), duplicate: true };
      }
      throw confirmationError("CONFIRMATION_REUSED", "La confirmación ya fue consumida.", 409);
    }
    if (Date.parse(confirmation.expiresAt) <= this.clock()) throw confirmationError("CONFIRMATION_EXPIRED", "La confirmación expiró.", 409);
    const fingerprint = commandFingerprint(command);
    if (fingerprint !== draft.commandFingerprint || fingerprint !== confirmation.commandFingerprint) {
      throw confirmationError("CONFIRMATION_COMMAND_MISMATCH", "El comando no coincide con lo confirmado.", 409);
    }
    confirmation.consumedAt = new Date(this.clock()).toISOString();
    confirmation.consumedBy = context.idempotencyKey || null;
    confirmation.status = "CONSUMED";
    draft.status = "CONSUMED";
    return { draft: publicCopy(draft), confirmation: publicCopy(confirmation) };
  }

  getDraft(id, sessionId) {
    this.prune();
    const draft = this.drafts.get(String(id || ""));
    if (!draft || draft.sessionId !== sessionId) return null;
    return publicCopy(draft);
  }

  prune() {
    const now = this.clock();
    for (const [id, draft] of this.drafts) {
      if (Date.parse(draft.expiresAt) <= now && draft.status !== "CONSUMED") this.drafts.delete(id);
    }
    for (const [id, confirmation] of this.confirmations) {
      if (Date.parse(confirmation.expiresAt) <= now && confirmation.status !== "CONSUMED") this.confirmations.delete(id);
    }
  }
}

function disclosure(command) {
  return {
    action: command.type,
    symbol: command.symbol || null,
    positionId: command.positionId || command.tradeId || null,
    requestedSize: command.capital || null,
    fraction: command.fraction || null,
    entry: command.entry || null,
    stop: command.stop || null,
    target: command.target || null,
    exit: command.exit || null,
  };
}

function consequence(command) {
  if (command.type === "open_position") return `Abrirá una posición simulada ${command.symbol || ""} en el ledger PAPER.`;
  if (command.type === "close_position") return "Realizará PnL simulado y reducirá/cerrará una posición PAPER.";
  if (command.type === "modify_position") return "Modificará la protección de una posición PAPER.";
  return "Aplicará una mutación auditada al ledger PAPER.";
}

function confirmationError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function publicCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { ConfirmationRegistry };
