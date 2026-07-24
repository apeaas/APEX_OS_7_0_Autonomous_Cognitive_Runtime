"use strict";

const crypto = require("node:crypto");

class SessionManager {
  constructor(options = {}) {
    this.ttlMs = finitePositive(options.ttlMs, 20 * 60 * 1000);
    this.maxSessions = finitePositive(options.maxSessions, 32);
    this.clock = options.clock || (() => Date.now());
    this.randomBytes = options.randomBytes || crypto.randomBytes;
    this.sessions = new Map();
    this.bootId = crypto.randomUUID();
  }

  create(context = {}) {
    this.prune();
    if (this.sessions.size >= this.maxSessions) {
      const oldest = [...this.sessions.values()].sort((a, b) => a.createdAtMs - b.createdAtMs)[0];
      if (oldest) this.sessions.delete(oldest.sessionId);
    }
    const now = this.clock();
    const session = {
      sessionId: crypto.randomUUID(),
      token: this.randomBytes(32).toString("base64url"),
      createdAtMs: now,
      expiresAtMs: now + this.ttlMs,
      remoteAddress: String(context.remoteAddress || ""),
      userAgentHash: hash(String(context.userAgent || "")),
      bootId: this.bootId,
    };
    this.sessions.set(session.sessionId, session);
    return this.publicCredentials(session);
  }

  authenticate(sessionId, token, context = {}) {
    const session = this.sessions.get(String(sessionId || ""));
    if (!session) return failure("INVALID_SESSION", "Sesión inválida o rotada.");
    if (session.expiresAtMs <= this.clock()) {
      this.sessions.delete(session.sessionId);
      return failure("EXPIRED_SESSION", "La sesión expiró.");
    }
    if (!safeEqual(session.token, String(token || ""))) return failure("INVALID_TOKEN", "Token de sesión inválido.");
    if (session.remoteAddress && context.remoteAddress && session.remoteAddress !== String(context.remoteAddress)) {
      return failure("SESSION_CONTEXT_MISMATCH", "La sesión no pertenece a este cliente.");
    }
    const userAgentHash = hash(String(context.userAgent || ""));
    if (session.userAgentHash !== userAgentHash) return failure("SESSION_CONTEXT_MISMATCH", "La sesión no pertenece a este cliente.");
    return {
      ok: true,
      session: {
        sessionId: session.sessionId,
        expiresAt: new Date(session.expiresAtMs).toISOString(),
        bootId: session.bootId,
      },
    };
  }

  revoke(sessionId) {
    return this.sessions.delete(String(sessionId || ""));
  }

  prune() {
    const now = this.clock();
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAtMs <= now) this.sessions.delete(sessionId);
    }
  }

  publicCredentials(session) {
    return {
      sessionId: session.sessionId,
      token: session.token,
      expiresAt: new Date(session.expiresAtMs).toISOString(),
      bootId: session.bootId,
    };
  }
}

function safeEqual(expected, received) {
  const left = Buffer.from(String(expected || ""));
  const right = Buffer.from(String(received || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function finitePositive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function failure(code, message) {
  return { ok: false, code, message };
}

module.exports = { SessionManager };
