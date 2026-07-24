"use strict";
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const mockPort = 8820;
const apexPort = 8819;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex7-runtime-"));
let calls = 0;

const mock = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/responses") return res.writeHead(404).end();
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    calls += 1;
    const parsed = JSON.parse(body || "{}");
    if (parsed.tool_choice !== "required") return res.writeHead(400).end(JSON.stringify({ error: { message: "tool_choice required ausente" } }));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      id: `resp_auto_${calls}`,
      output: [{ type: "function_call", call_id: `auto_${calls}`, name: "autonomous_open_paper_trade", arguments: JSON.stringify({ symbol: "ETHUSDT", capital: 500, entry: 100, stop: 99, target: 103, confidence: 91, rationale: "Tendencia, volumen y R/R compatibles.", case_id: "CASE-TEST" }) }]
    }));
  });
});

mock.listen(mockPort, "127.0.0.1", () => {
  const apex = spawn(process.execPath, ["server.js"], { cwd: __dirname, env: { ...process.env, APEX_PORT: String(apexPort), APEX_DATA_DIR: dataDir, APEX_MARKET_GATEWAY_DISABLED: "1", OPENAI_API_KEY: "test-key-not-real", OPENAI_BASE_URL: `http://127.0.0.1:${mockPort}/v1`, OPENAI_MODEL: "mock-model" }, stdio: ["ignore", "pipe", "pipe"] });
  const timeout = setTimeout(() => finish(new Error("Runtime test timeout")), 18000);
  let finished = false;
  apex.stdout.on("data", async chunk => {
    if (!String(chunk).includes("disponible")) return;
    try {
      const base = `http://127.0.0.1:${apexPort}`;
      const snapshot = { version: "7.0.0", executionMode: "PAPER_ONLY", feedStatus: "LIVE · GATEWAY", feedQuality: { status: "healthy", trusted: true, source: "gateway", reason: "test_fixture", lastDataAt: new Date().toISOString(), ageMs: 0, latencyMs: 1 }, decision: { confidence: 91 }, portfolio: { equity: 10000, cash: 10000, realized: 0, positions: [], recentClosedTrades: [] }, symbols: { ETHUSDT: { price: 100, analysis: { confidence: 91, trend: "Alcista", risk: "Bajo", volumeRatio: 1.4 } } }, governance: { autonomyCapPct: 5, trustScore: "92/100", liveTrading: false } };
      let response = await fetch(`${base}/api/runtime/snapshot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot }) });
      if (!response.ok) throw new Error("Snapshot rechazado");

      response = await fetch(`${base}/api/runtime/mode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "paper_autonomous" }) });
      if (response.status !== 400) throw new Error("Autonomía se habilitó sin frase");

      response = await fetch(`${base}/api/runtime/mode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "paper_autonomous", activationPhrase: "HABILITAR PAPER AUTO" }) });
      if (!response.ok) throw new Error("No se habilitó autonomía con frase");

      response = await fetch(`${base}/api/runtime/snapshot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: { ...snapshot, feedQuality: { status: "degraded", trusted: false, source: "gateway", reason: "test_degraded" } } }) });
      if (!response.ok) throw new Error("Snapshot degradado rechazado");
      response = await fetch(`${base}/api/runtime/cycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "feed-degraded-test" }) });
      const blockedCycle = await response.json();
      if (!response.ok || !blockedCycle.ok || !blockedCycle.noop || calls !== 0) throw new Error("El runtime no bloqueó el ciclo con feed degradado");

      response = await fetch(`${base}/api/runtime/snapshot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot }) });
      if (!response.ok) throw new Error("Snapshot saludable rechazado");

      response = await fetch(`${base}/api/runtime/config`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autonomyCapPct: 99, maxPositionPct: 99, riskPerTradePct: 99 }) });
      const configResult = await response.json();
      if (!configResult.ok || configResult.config.autonomyCapPct !== 5 || configResult.config.maxPositionPct !== 2 || configResult.config.riskPerTradePct !== 0.5) throw new Error("Locks de configuración fallaron");

      response = await fetch(`${base}/api/runtime/cycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "test" }) });
      const cycle = await response.json();
      if (!response.ok || !cycle.ok || cycle.noop) throw new Error(`Ciclo falló: ${JSON.stringify(cycle)}`);
      const action = cycle.action;
      if (action.name !== "execute_paper_trade") throw new Error("Mapeo autónomo incorrecto");
      if (action.arguments.capital > 200.01) throw new Error("Tamaño no fue limitado por maxPositionPct");

      response = await fetch(`${base}/api/runtime/actions/${action.id}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: "test-browser" }) });
      const claim = await response.json();
      if (!claim.ok || claim.action.status !== "claimed") throw new Error("Claim falló");

      response = await fetch(`${base}/api/runtime/actions/${action.id}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, tradeId: "TEST-1", message: "Paper ejecutado" }) });
      const result = await response.json();
      if (!result.ok || result.action.status !== "executed") throw new Error("Resultado no persistido");

      const state = await fetch(`${base}/api/runtime/state`).then(r => r.json());
      if (state.history[0]?.status !== "executed" || state.config.autonomyCapPct > 5) throw new Error("Estado final inválido");

      response = await fetch(`${base}/api/runtime/emergency`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true, reason: "test" }) });
      const emergency = await response.json();
      if (!emergency.ok) throw new Error("Kill switch falló");
      const stopped = await fetch(`${base}/api/runtime/state`).then(r => r.json());
      if (!stopped.emergencyStop || stopped.mode !== "suspended") throw new Error("Kill switch no suspendió runtime");

      console.log("APEX 7.0 autonomous runtime test: OK");
      finish();
    } catch (error) { finish(error); }
  });
  function finish(error) { if (finished) return; finished = true; clearTimeout(timeout); apex.kill("SIGTERM"); mock.close(); fs.rmSync(dataDir, { recursive: true, force: true }); if (error) { console.error(error); process.exitCode = 1; } }
});
