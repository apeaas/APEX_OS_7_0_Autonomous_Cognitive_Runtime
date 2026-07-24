"use strict";

const {
  contentTypeAllowed,
  findRouteContract,
  isMutableMethod,
} = require("./contracts");

class MutableRequestGuard {
  constructor(options) {
    this.sessions = options.sessions;
    this.rateLimiter = options.rateLimiter;
    this.allowedHosts = new Set((options.allowedHosts || []).map(normalizeHost).filter(Boolean));
    this.allowedOrigins = new Set((options.allowedOrigins || []).map(normalizeOrigin).filter(Boolean));
    this.isKillSwitchActive = options.isKillSwitchActive || (() => false);
  }

  bootstrap(req) {
    const host = this.validateHost(req.headers.host);
    if (!host.ok) return host;
    const origin = this.validateOrigin(req.headers.origin, req.headers["sec-fetch-site"]);
    if (!origin.ok) return origin;
    return {
      ok: true,
      credentials: this.sessions.create({
        remoteAddress: req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      }),
    };
  }

  authorize(req, pathname) {
    const method = String(req.method || "").toUpperCase();
    if (!isMutableMethod(method)) return { ok: true, mutable: false };

    const routeContract = findRouteContract(method, pathname);
    if (!routeContract) return failure(405, "MUTABLE_ROUTE_NOT_ALLOWED", "Ruta mutable no permitida.");

    const host = this.validateHost(req.headers.host);
    if (!host.ok) return host;
    const origin = this.validateOrigin(req.headers.origin, req.headers["sec-fetch-site"], true);
    if (!origin.ok) return origin;
    if (!contentTypeAllowed(routeContract, req.headers["content-type"])) {
      return failure(415, "UNSUPPORTED_CONTENT_TYPE", "Content-Type no permitido para esta ruta.");
    }

    const declaredLength = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > routeContract.maxBytes) {
      return failure(413, "PAYLOAD_TOO_LARGE", "Solicitud demasiado grande.");
    }

    const session = this.sessions.authenticate(
      req.headers["x-apex-session-id"],
      req.headers["x-apex-session-token"],
      { remoteAddress: req.socket.remoteAddress, userAgent: req.headers["user-agent"] },
    );
    if (!session.ok) return failure(401, session.code, session.message);

    const idempotencyKey = String(req.headers["x-idempotency-key"] || "").trim();
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) {
      return failure(400, "IDEMPOTENCY_KEY_REQUIRED", "X-Idempotency-Key válido es obligatorio.");
    }

    const rate = this.rateLimiter.consume(`${session.session.sessionId}:${method}:${pathname}`);
    if (!rate.ok) {
      return {
        ...failure(429, "RATE_LIMITED", "Límite de solicitudes excedido."),
        retryAfterMs: rate.retryAfterMs,
      };
    }
    if (this.isKillSwitchActive() && !routeContract.safeDuringKillSwitch) {
      return failure(423, "KILL_SWITCH_ACTIVE", "El kill switch bloquea esta mutación.");
    }

    return {
      ok: true,
      mutable: true,
      routeContract,
      session: session.session,
      idempotencyKey,
      maxBytes: routeContract.maxBytes,
      rateRemaining: rate.remaining,
    };
  }

  validateHost(value) {
    const normalized = normalizeHost(value);
    if (!normalized || !this.allowedHosts.has(normalized)) {
      return failure(403, "INVALID_HOST", "Host no autorizado.");
    }
    return { ok: true };
  }

  validateOrigin(value, secFetchSite, required = false) {
    if (!value) {
      if (required) return failure(403, "ORIGIN_REQUIRED", "Origin es obligatorio.");
      if (secFetchSite && !["same-origin", "none"].includes(String(secFetchSite))) {
        return failure(403, "INVALID_ORIGIN", "Origen no autorizado.");
      }
      return { ok: true };
    }
    const normalized = normalizeOrigin(value);
    if (!normalized || !this.allowedOrigins.has(normalized)) {
      return failure(403, "INVALID_ORIGIN", "Origen no autorizado.");
    }
    return { ok: true };
  }
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "");
}

function normalizeOrigin(value) {
  try {
    return new URL(String(value)).origin.toLowerCase();
  } catch {
    return "";
  }
}

function failure(statusCode, code, message) {
  return { ok: false, statusCode, code, message };
}

module.exports = { MutableRequestGuard, normalizeHost, normalizeOrigin };
