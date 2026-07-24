"use strict";

const crypto = require("node:crypto");

class ActionClaims {
  constructor(options = {}) {
    this.claimTtlMs = positive(options.claimTtlMs, 60_000);
    this.clock = options.clock || (() => Date.now());
    this.randomBytes = options.randomBytes || crypto.randomBytes;
  }

  claim(action, context = {}) {
    if (!action || action.status !== "queued") return failure("INVALID_TRANSITION", `No se puede reclamar una acción en estado ${action?.status || "unknown"}.`);
    if (context.killSwitch) return failure("KILL_SWITCH_ACTIVE", "El kill switch impide nuevos claims.");
    const now = this.clock();
    if (Date.parse(action.expiresAt || 0) <= now) {
      action.status = "cancelled";
      action.cancelledAt = new Date(now).toISOString();
      action.cancelReason = "ACTION_EXPIRED";
      return failure("ACTION_EXPIRED", "La acción expiró.");
    }
    const attempt = Number(action.claimAttempt || 0) + 1;
    const claim = {
      actionId: action.id,
      claimId: crypto.randomUUID(),
      sessionId: context.sessionId,
      claimant: String(context.claimant || "browser").slice(0, 120),
      attempt,
      claimedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.claimTtlMs).toISOString(),
      nonce: this.randomBytes(24).toString("base64url"),
    };
    action.status = "claimed";
    action.claimAttempt = attempt;
    action.claim = claim;
    return { ok: true, action, claim: { ...claim } };
  }

  complete(action, payload = {}, context = {}) {
    if (!action || action.status !== "claimed") return failure("INVALID_TRANSITION", `No se puede completar una acción en estado ${action?.status || "unknown"}.`);
    if (context.killSwitch) return failure("KILL_SWITCH_ACTIVE", "El kill switch impide completar acciones pendientes.");
    const claim = action.claim;
    if (!claim) return failure("CLAIM_REQUIRED", "La acción no tiene un claim válido.");
    if (Date.parse(claim.expiresAt) <= this.clock()) return failure("CLAIM_EXPIRED", "El claim expiró.");
    if (claim.sessionId !== context.sessionId) return failure("FOREIGN_CLAIM", "El claim pertenece a otra sesión.");
    if (claim.claimId !== payload.claimId || !safeEqual(claim.nonce, payload.nonce)) {
      return failure("INVALID_CLAIM", "Claim o nonce inválido.");
    }
    if (claim.consumedAt) return failure("CLAIM_REUSED", "El claim ya fue utilizado.");

    claim.consumedAt = new Date(this.clock()).toISOString();
    action.status = payload.ok === false ? "failed" : "completed";
    action.completedAt = claim.consumedAt;
    action.result = payload.result ?? payload;
    return { ok: true, action };
  }

  cancel(action, reason, context = {}) {
    if (!action || !["queued", "claimed"].includes(action.status)) {
      return failure("INVALID_TRANSITION", `No se puede cancelar una acción en estado ${action?.status || "unknown"}.`);
    }
    if (action.status === "claimed" && action.claim?.sessionId && !context.system && action.claim.sessionId !== context.sessionId) {
      return failure("FOREIGN_CLAIM", "La acción fue reclamada por otra sesión.");
    }
    action.status = "cancelled";
    action.cancelledAt = new Date(this.clock()).toISOString();
    action.cancelReason = String(reason || "CANCELLED").slice(0, 500);
    return { ok: true, action };
  }
}

function safeEqual(expected, received) {
  const left = Buffer.from(String(expected || ""));
  const right = Buffer.from(String(received || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function failure(code, message) {
  return { ok: false, code, message };
}

module.exports = { ActionClaims };
