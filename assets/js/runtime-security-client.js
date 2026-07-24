"use strict";

(() => {
  const nativeFetch = window.fetch.bind(window);
  let credentials = null;
  let bootstrapPromise = null;

  async function bootstrap(force = false) {
    if (!force && credentials && Date.parse(credentials.expiresAt) > Date.now() + 5_000) return credentials;
    if (!force && bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = nativeFetch("/api/session/bootstrap", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.sessionId || !body.token) throw new Error(body.message || "No se pudo iniciar la sesión local.");
      credentials = body;
      return credentials;
    }).finally(() => {
      bootstrapPromise = null;
    });
    return bootstrapPromise;
  }

  async function securedFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url || String(input), window.location.href);
    const method = String(init.method || request?.method || "GET").toUpperCase();
    const mutable = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
    const sameOriginApi = url.origin === window.location.origin && url.pathname.startsWith("/api/");
    if (!mutable || !sameOriginApi) return nativeFetch(input, init);

    const session = await bootstrap();
    const headers = new Headers(request?.headers || undefined);
    new Headers(init.headers || undefined).forEach((value, key) => headers.set(key, value));
    headers.set("X-APEX-Session-Id", session.sessionId);
    headers.set("X-APEX-Session-Token", session.token);
    if (!headers.has("X-Idempotency-Key")) headers.set("X-Idempotency-Key", crypto.randomUUID());

    const nextInit = { ...init, method, headers, credentials: "same-origin" };
    let response = await nativeFetch(input, nextInit);
    if (response.status === 401) {
      credentials = null;
      const renewed = await bootstrap(true);
      headers.set("X-APEX-Session-Id", renewed.sessionId);
      headers.set("X-APEX-Session-Token", renewed.token);
      response = await nativeFetch(input, nextInit);
    }
    return response;
  }

  window.fetch = securedFetch;
  window.APEX_RUNTIME_SECURITY = Object.freeze({
    bootstrap,
    health: () => ({
      active: Boolean(credentials),
      expiresAt: credentials?.expiresAt || null,
      persisted: false,
    }),
  });
})();
