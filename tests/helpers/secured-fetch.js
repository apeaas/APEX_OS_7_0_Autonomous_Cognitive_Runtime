"use strict";

const crypto = require("node:crypto");

function createSecuredFetch(baseUrl) {
  let session = null;

  async function bootstrap(force = false) {
    if (!force && session) return session;
    const response = await fetch(`${baseUrl}/api/session/bootstrap`, {
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`Bootstrap falló: ${JSON.stringify(body)}`);
    session = body;
    return session;
  }

  return async function securedFetch(pathname, options = {}) {
    const credentials = await bootstrap();
    const headers = new Headers(options.headers || {});
    headers.set("Origin", baseUrl);
    headers.set("X-APEX-Session-Id", credentials.sessionId);
    headers.set("X-APEX-Session-Token", credentials.token);
    headers.set("X-Idempotency-Key", options.idempotencyKey || crypto.randomUUID());
    const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
    if (response.status !== 401) return response;
    session = null;
    return securedFetch(pathname, options);
  };
}

module.exports = { createSecuredFetch };
