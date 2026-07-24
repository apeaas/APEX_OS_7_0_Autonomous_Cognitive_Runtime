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
    if (blockedPaper.status !== 403 || blockedPaperBody.error !== "HUMAN_CONFIRMATION_REQUIRED") throw new Error("Command API permitió mutación sin confirmación");

    const riskSimulation = await securedFetch("/api/risk/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "open_position", symbol: "ETHUSDT", capital: 100, entry: 100, stop: 95, target: 110 }),
    }).then(r => r.json());
    if (riskSimulation.riskDecision?.decision !== "reject" || !riskSimulation.riskDecision.reasons.includes("UNTRUSTED_MARKET_DATA")) throw new Error("Risk no bloqueó feed degradado");

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

    const initialImprovements = await fetch(`${base}/api/improvements?includeAudit=1`).then(r => r.json());
    if (!initialImprovements.ok || initialImprovements.proposals.length !== 0 || initialImprovements.audit.length !== 0) throw new Error("Registry cognitivo inicial inválido");
    const missingEvidence = await securedFetch("/api/improvements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemStatement: "Falta evidencia de prueba." }),
    });
    const missingEvidenceBody = await missingEvidence.json();
    if (missingEvidence.status !== 400 || missingEvidenceBody.error !== "INVALID_IMPROVEMENT_PROPOSAL") throw new Error("Proposal API aceptó evidencia ausente");
    const decisionJournal = await fetch(`${base}/api/decision-journal`).then(r => r.json());
    if (!decisionJournal.ok || !Array.isArray(decisionJournal.entries)) throw new Error("Decision Journal no disponible");

    const voiceHealth = await fetch(`${base}/api/voice/health`).then(r => r.json());
    if (!voiceHealth.ok || voiceHealth.defaultProvider !== "mock" || voiceHealth.rawAudioStored !== false || voiceHealth.apiKeyExposed !== false) {
      throw new Error("Voice health sin fallback seguro");
    }
    const voiceCreation = await securedFetch("/api/voice/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredProvider: "openai-realtime" }),
    });
    const voiceCreationBody = await voiceCreation.json();
    if (voiceCreation.status !== 201 || voiceCreationBody.session.provider !== "mock" || voiceCreationBody.session.fallbackReason !== "OPENAI_NOT_CONFIGURED") {
      throw new Error("Fallback de voz sin API key inválido");
    }
    if (JSON.stringify(voiceCreationBody).includes("OPENAI_API_KEY") || JSON.stringify(voiceCreationBody).includes("Bearer ")) {
      throw new Error("Voice session expuso material de credenciales");
    }
    const duplicateVoice = await securedFetch("/api/voice/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredProvider: "mock" }),
    });
    if (duplicateVoice.status !== 409) throw new Error("Voice permitió doble conexión");
    const voiceTool = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: "smoke-tool-1", name: "get_runtime_status", arguments: {} }),
    };
    const voiceToolResult = await securedFetch(`/api/voice/sessions/${voiceCreationBody.session.id}/tools`, voiceTool).then(r => r.json());
    if (voiceToolResult.kind !== "read_only" || voiceToolResult.result.executionMode !== "PAPER_ONLY") throw new Error("Voice tool read-only inválida");
    const duplicateVoiceTool = await securedFetch(`/api/voice/sessions/${voiceCreationBody.session.id}/tools`, voiceTool).then(r => r.json());
    if (!duplicateVoiceTool.duplicate) throw new Error("Voice tool duplicada produjo un segundo efecto");
    const forbiddenVoiceTool = await securedFetch(`/api/voice/sessions/${voiceCreationBody.session.id}/tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: "smoke-tool-2", name: "execute_trade", arguments: {} }),
    });
    if (forbiddenVoiceTool.status !== 403) throw new Error("Voice tool prohibida no fue bloqueada");
    const voiceDisconnect = await securedFetch(`/api/voice/sessions/${voiceCreationBody.session.id}/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then(r => r.json());
    if (voiceDisconnect.session?.state !== "disabled") throw new Error("Voice session no cerró correctamente");

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
