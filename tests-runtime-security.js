"use strict";

const assert = require("node:assert/strict");
const { ActionClaims } = require("./lib/runtime-security/action-claims");
const { parseJsonBody, validatePayload } = require("./lib/runtime-security/contracts");
const { MutableRequestGuard } = require("./lib/runtime-security/mutable-request-guard");
const { SlidingWindowRateLimiter } = require("./lib/runtime-security/rate-limiter");
const { SessionManager } = require("./lib/runtime-security/session-manager");

let now = Date.parse("2026-07-24T12:00:00.000Z");
const clock = () => now;
const context = { remoteAddress: "127.0.0.1", userAgent: "APEX-test" };

const sessions = new SessionManager({ ttlMs: 1_000, clock });
const credentials = sessions.create(context);
assert.equal(sessions.authenticate(credentials.sessionId, credentials.token, context).ok, true);
assert.equal(sessions.authenticate(credentials.sessionId, "invalid", context).code, "INVALID_TOKEN");
assert.equal(sessions.authenticate("missing", credentials.token, context).code, "INVALID_SESSION");
assert.equal(sessions.authenticate(credentials.sessionId, credentials.token, { ...context, userAgent: "other" }).code, "SESSION_CONTEXT_MISMATCH");
now += 1_001;
assert.equal(sessions.authenticate(credentials.sessionId, credentials.token, context).code, "EXPIRED_SESSION");

now = Date.parse("2026-07-24T12:00:00.000Z");
const guardSessions = new SessionManager({ ttlMs: 60_000, clock });
const guardCredentials = guardSessions.create(context);
const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxRequests: 2, clock });
let killSwitch = false;
const guard = new MutableRequestGuard({
  sessions: guardSessions,
  rateLimiter: limiter,
  allowedHosts: ["127.0.0.1:5500"],
  allowedOrigins: ["http://127.0.0.1:5500"],
  isKillSwitchActive: () => killSwitch,
});

function request(overrides = {}) {
  const { headers: headerOverrides = {}, ...requestOverrides } = overrides;
  return {
    method: "PATCH",
    headers: {
      host: "127.0.0.1:5500",
      origin: "http://127.0.0.1:5500",
      "content-type": "application/json",
      "content-length": "2",
      "user-agent": context.userAgent,
      "x-apex-session-id": guardCredentials.sessionId,
      "x-apex-session-token": guardCredentials.token,
      "x-idempotency-key": "test-key-0001",
      ...headerOverrides,
    },
    socket: { remoteAddress: context.remoteAddress },
    ...requestOverrides,
  };
}

assert.equal(guard.authorize(request({ headers: { host: "evil.example" } }), "/api/runtime/config").code, "INVALID_HOST");
assert.equal(guard.authorize(request({ headers: { origin: "https://evil.example" } }), "/api/runtime/config").code, "INVALID_ORIGIN");
assert.equal(guard.authorize(request({ headers: { "x-apex-session-token": "" } }), "/api/runtime/config").code, "INVALID_TOKEN");
assert.equal(guard.authorize(request({ headers: { "content-type": "text/plain" } }), "/api/runtime/config").code, "UNSUPPORTED_CONTENT_TYPE");
assert.equal(guard.authorize(request({ headers: { "x-idempotency-key": "" } }), "/api/runtime/config").code, "IDEMPOTENCY_KEY_REQUIRED");
assert.equal(guard.authorize(request({ headers: { "content-length": "999999" } }), "/api/runtime/config").code, "PAYLOAD_TOO_LARGE");
assert.equal(guard.authorize(request(), "/api/runtime/config").ok, true);
assert.equal(guard.authorize(request({ headers: { "x-idempotency-key": "test-key-0002" } }), "/api/runtime/config").ok, true);
assert.equal(guard.authorize(request({ headers: { "x-idempotency-key": "test-key-0003" } }), "/api/runtime/config").code, "RATE_LIMITED");

const killLimiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxRequests: 10, clock });
const killGuard = new MutableRequestGuard({
  sessions: guardSessions,
  rateLimiter: killLimiter,
  allowedHosts: ["127.0.0.1:5500"],
  allowedOrigins: ["http://127.0.0.1:5500"],
  isKillSwitchActive: () => killSwitch,
});
killSwitch = true;
assert.equal(killGuard.authorize(request(), "/api/runtime/config").code, "KILL_SWITCH_ACTIVE");
const emergencyRequest = request({ method: "POST", headers: { "x-idempotency-key": "emergency-0001" } });
assert.equal(killGuard.authorize(emergencyRequest, "/api/runtime/emergency").ok, true);
killSwitch = false;

assert.equal(validatePayload("POST", "/api/runtime/mode", { mode: "live" }).ok, false);
assert.equal(validatePayload("POST", "/api/runtime/actions/a/result", { ok: true }).ok, false);
assert.equal(validatePayload("POST", "/api/runtime/actions/a/result", { claimId: "claim", nonce: "nonce" }).ok, true);
assert.throws(() => parseJsonBody("{"), error => error.code === "INVALID_JSON" && error.statusCode === 400);

now = Date.parse("2026-07-24T12:00:00.000Z");
const claims = new ActionClaims({ claimTtlMs: 1_000, clock });
const queued = { id: "A-1", status: "queued", expiresAt: new Date(now + 10_000).toISOString() };
assert.equal(claims.complete(queued, {}, { sessionId: "S-1" }).code, "INVALID_TRANSITION");
const claimed = claims.claim(queued, { sessionId: "S-1", claimant: "browser" });
assert.equal(claimed.ok, true);
assert.equal(claimed.claim.actionId, "A-1");
assert.equal(claimed.claim.sessionId, "S-1");
assert.equal(claimed.claim.attempt, 1);
assert.ok(claimed.claim.nonce);
assert.equal(claims.complete(queued, claimed.claim, { sessionId: "S-2" }).code, "FOREIGN_CLAIM");
assert.equal(claims.complete(queued, { ...claimed.claim, nonce: "wrong" }, { sessionId: "S-1" }).code, "INVALID_CLAIM");
assert.equal(claims.complete(queued, { ...claimed.claim, ok: true }, { sessionId: "S-1" }).ok, true);
assert.equal(queued.status, "completed");
assert.equal(claims.complete(queued, claimed.claim, { sessionId: "S-1" }).code, "INVALID_TRANSITION");

const expires = { id: "A-2", status: "queued", expiresAt: new Date(now + 10_000).toISOString() };
const expiringClaim = claims.claim(expires, { sessionId: "S-1" });
now += 1_001;
assert.equal(claims.complete(expires, expiringClaim.claim, { sessionId: "S-1" }).code, "CLAIM_EXPIRED");
const killDuringLifecycle = { id: "A-2B", status: "queued", expiresAt: new Date(now + 10_000).toISOString() };
const activeClaim = claims.claim(killDuringLifecycle, { sessionId: "S-1" });
assert.equal(claims.complete(killDuringLifecycle, activeClaim.claim, { sessionId: "S-1", killSwitch: true }).code, "KILL_SWITCH_ACTIVE");

const cancelled = { id: "A-3", status: "queued", expiresAt: new Date(now + 10_000).toISOString() };
assert.equal(claims.cancel(cancelled, "test", { sessionId: "S-1" }).ok, true);
assert.equal(claims.complete(cancelled, {}, { sessionId: "S-1" }).code, "INVALID_TRANSITION");
const killed = { id: "A-4", status: "queued", expiresAt: new Date(now + 10_000).toISOString() };
assert.equal(claims.claim(killed, { sessionId: "S-1", killSwitch: true }).code, "KILL_SWITCH_ACTIVE");

console.log("APEX 7.1 runtime security negative tests: OK · 35 assertions");
