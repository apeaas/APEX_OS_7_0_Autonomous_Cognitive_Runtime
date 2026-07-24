"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createSecuredFetch } = require("./tests/helpers/secured-fetch");

const port = 8799;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex7-smoke-"));
const child = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env: { ...process.env, APEX_PORT: String(port), OPENAI_API_KEY: "", APEX_DATA_DIR: dataDir, APEX_MARKET_GATEWAY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

const timeout = setTimeout(() => finish(new Error("Smoke test timeout")), 15000);
let finished = false;
child.stdout.on("data", async chunk => {
  if (!String(chunk).includes("disponible")) return;
  try {
    const base = `http://127.0.0.1:${port}`;
    const securedFetch = createSecuredFetch(base);
    const healthRes = await fetch(`${base}/api/health`);
    const health = await healthRes.json();
    if (!health.ok || health.version !== "7.1.0" || health.executionMode !== "PAPER_ONLY") throw new Error("Health inválido");
    if (health.externalAccounts !== false || health.liveTrading !== false) throw new Error("Locks de seguridad inválidos");

    const state = await fetch(`http://127.0.0.1:${port}/api/runtime/state`).then(r => r.json());
    if (state.mode !== "observe" || state.config.autonomyCapPct > 5) throw new Error("Runtime inicial inválido");

    const indexRes = await fetch(`http://127.0.0.1:${port}/`);
    const html = await indexRes.text();
    if (!indexRes.ok || !html.includes("APEX AI Commander") || !html.includes("apex-7-runtime.js")) throw new Error("Frontend v7 no servido");

    const adapterRes = await fetch(`http://127.0.0.1:${port}/api/integrations`);
    const adapters = await adapterRes.json();
    if (adapters.externalAccountsEnabled !== false) throw new Error("Integraciones externas habilitadas por error");

    const marketStatus = await fetch(`http://127.0.0.1:${port}/api/market/status`).then(r => r.json());
    if (!marketStatus.readOnly || marketStatus.hardLocks?.liveTrading !== false || marketStatus.hardLocks?.externalAccounts !== false) throw new Error("Gateway sin locks read-only");

    const initialPortfolio = await fetch(`${base}/api/portfolio`).then(r => r.json());
    if (!initialPortfolio.ok || initialPortfolio.projection.cash !== 25000 || initialPortfolio.integrity.eventCount !== 1) throw new Error("Ledger PAPER inicial inválido");
    const paperCommand = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      idempotencyKey: "smoke-import-0001",
      body: JSON.stringify({ portfolio: { equity: 25000, cash: 25000, realized: 0, positions: [], closedTrades: [] }, expectedVersion: 1 }),
    };
    const paperResponse = await securedFetch("/api/portfolio/import", paperCommand);
    const paperResult = await paperResponse.json();
    if (!paperResponse.ok || !paperResult.projection.legacyImported) throw new Error("Migración PAPER inválida");
    const duplicateResponse = await securedFetch("/api/portfolio/import", paperCommand);
    const duplicateResult = await duplicateResponse.json();
    if (!duplicateResponse.ok || !duplicateResult.duplicate || duplicateResult.projection.positions.length !== 0) throw new Error("Idempotencia PAPER inválida");

    const blockedPaper = await securedFetch("/api/paper/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "open_position", symbol: "ETHUSDT", capital: 100, entry: 100, stop: 95, target: 110, expectedVersion: paperResult.projection.version }),
    });
    const blockedPaperBody = await blockedPaper.json();
    if (blockedPaper.status !== 409 || blockedPaperBody.error !== "RISK_REJECTED") throw new Error("Risk no bloqueó feed degradado");

    const constitution = await fetch(`${base}/api/constitution`).then(r => r.json());
    if (!constitution.ok || constitution.constitution.contentHash !== constitution.registry.contentHash) throw new Error("Constitución activa inválida");
    const invalidFund = await securedFetch("/api/fund/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "authorize", capitalReferenceId: "SMOKE-REF", capitalReferenceAmount: 25000, autonomousAllocationPct: 0.051 }),
    });
    if (invalidFund.status !== 400) throw new Error("Fondo permitió superar 5%");
    const fundAuthorization = await securedFetch("/api/fund/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "authorize", capitalReferenceId: "SMOKE-REF", capitalReferenceAmount: 25000, autonomousAllocationPct: 0.05 }),
    }).then(r => r.json());
    if (!fundAuthorization.ok || fundAuthorization.fund.initialAutonomousContribution !== 1250) throw new Error("Autorización de fondo inválida");

    for (const secretPath of ["/.env", "/server.js", "/data/apex-runtime-state.json", "/data/apex-market-cache.json"]) {
      const response = await fetch(`http://127.0.0.1:${port}${secretPath}`);
      if (response.status !== 404) throw new Error(`El servidor expuso ${secretPath}`);
    }

    const aiRes = await securedFetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "estado", state: {} }) });
    if (aiRes.status !== 503) throw new Error("La ausencia de clave no fue controlada");
    console.log("APEX 7.1 smoke test: OK");
    finish();
  } catch (error) { finish(error); }
});

function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  child.kill("SIGTERM");
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (error) { console.error(error); process.exitCode = 1; }
}
