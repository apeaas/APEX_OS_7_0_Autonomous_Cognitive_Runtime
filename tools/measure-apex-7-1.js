"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { EventStore } = require("../lib/paper-ledger/event-store");
const { PaperLedgerCommands } = require("../lib/paper-ledger/commands");
const { PaperLedgerQueries } = require("../lib/paper-ledger/queries");
const { VoiceCommandInterpreter } = require("../lib/voice/command-interpreter");
const { VoiceSessionService } = require("../lib/voice/session-service");

const root = path.resolve(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apex-7-1-metrics-"));

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  let server;
  try {
    const ledger = measureLedgerReplay(path.join(tempRoot, "ledger"));
    const reconnect = await measureDeterministicReconnect();
    server = await startServer(path.join(tempRoot, "server"));
    const http = await measureHttp(server.baseUrl);
    const metrics = {
      measuredAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
      },
      fixture: {
        ledgerEvents: ledger.eventCount,
        httpIterations: http.iterations,
        marketGateway: "disabled",
        openAIRealtimeConfigured: false,
      },
      startup: {
        readyMs: round(server.readyMs),
        rssBytesApprox: server.rssBytesApprox,
        rssMiBApprox: server.rssBytesApprox == null ? null : round(server.rssBytesApprox / 1024 / 1024),
      },
      ledgerReconstruction: ledger,
      portfolioQuery: http.portfolio,
      riskEvaluation: http.risk,
      voiceMockConnection: http.voice,
      voiceDeterministicReconnect: reconnect,
      caveats: [
        "Resultados locales; no son garantía para otro hardware.",
        "Voice connection usa MockVoiceProvider porque OPENAI_API_KEY está vacía.",
        "Reconnect mide el service path con provider determinístico; no mide red/WebRTC real.",
      ],
    };
    console.log(JSON.stringify(metrics, null, 2));
  } finally {
    if (server?.child && !server.child.killed) server.child.kill("SIGTERM");
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function measureLedgerReplay(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, "paper-ledger.ndjson");
  const store = new EventStore({ filePath });
  const commands = new PaperLedgerCommands({ store });
  commands.initialize(25_000);
  for (let index = 0; index < 100; index += 1) {
    commands.execute({ type: "adjust_cash", amount: 1, reason: "QA fixture" }, {
      idempotencyKey: `qa-adjust-${index}`,
      sessionId: "QA",
      actor: { type: "system", id: "QA_METRICS" },
      authority: "system",
      policyVersion: "qa-metrics.v1",
    });
  }
  const started = performance.now();
  const replayed = new EventStore({ filePath });
  const projection = new PaperLedgerQueries({ store: replayed }).portfolio();
  const elapsed = performance.now() - started;
  return {
    eventCount: replayed.all().length,
    replayAndProjectionMs: round(elapsed),
    resultingVersion: projection.version,
    resultingCash: projection.cash,
  };
}

async function measureDeterministicReconnect() {
  const provider = {
    getHealth: () => ({ configured: true }),
    connect: async () => ({
      answerSdp: "v=0\r\nm=audio 9 RTP/AVP 0",
      model: "deterministic-qa",
    }),
    disconnect: async () => ({ ok: true }),
    interrupt: async () => ({ ok: true }),
  };
  const service = new VoiceSessionService({
    providers: { "openai-realtime": provider },
    interpreter: new VoiceCommandInterpreter({ readers: {} }),
    limits: { maxReconnects: 3 },
  });
  const context = { ownerSessionId: "QA-RECONNECT" };
  const session = service.create({ preferredProvider: "openai-realtime" }, context);
  const sdp = "v=0\r\nm=audio 9 RTP/AVP 0";
  await service.connect(session.id, sdp, context);
  const started = performance.now();
  const reconnected = await service.connect(session.id, sdp, context);
  return {
    reconnectMs: round(performance.now() - started),
    attempts: reconnected.session.reconnects,
    provider: "deterministic-qa",
  };
}

async function startServer(dataDir) {
  const port = 18_000 + (process.pid % 1_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const started = performance.now();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      APEX_PORT: String(port),
      APEX_DATA_DIR: dataDir,
      APEX_MARKET_GATEWAY_DISABLED: "1",
      OPENAI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += String(chunk); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Startup timeout: ${stderr || stdout}`)), 15_000);
    child.stdout.on("data", chunk => {
      stdout += String(chunk);
      if (!stdout.includes("APEX OS 7.1 disponible")) return;
      clearTimeout(timeout);
      resolve();
    });
    child.once("exit", code => {
      clearTimeout(timeout);
      reject(new Error(`Servidor terminó durante startup (${code}): ${stderr || stdout}`));
    });
  });
  return {
    child,
    baseUrl,
    readyMs: performance.now() - started,
    rssBytesApprox: readProcessRss(child.pid),
  };
}

async function measureHttp(baseUrl) {
  const bootstrap = await fetch(`${baseUrl}/api/session/bootstrap`, {
    headers: { "Sec-Fetch-Site": "same-origin" },
  }).then(response => response.json());
  const iterations = 30;
  const portfolioSamples = [];
  const riskSamples = [];
  const voiceSamples = [];
  for (let index = 0; index < iterations; index += 1) {
    const portfolioStarted = performance.now();
    const portfolio = await fetch(`${baseUrl}/api/portfolio`).then(response => response.json());
    portfolioSamples.push(performance.now() - portfolioStarted);
    if (!portfolio.ok) throw new Error("Portfolio query falló durante métricas.");

    const riskStarted = performance.now();
    const risk = await securedJson(baseUrl, bootstrap, "/api/risk/evaluate", {
      type: "open_position",
      symbol: "BTCUSDT",
      capital: 100,
      entry: 100,
      stop: 95,
      target: 110,
    });
    riskSamples.push(performance.now() - riskStarted);
    if (!risk.ok || risk.riskDecision.decision !== "reject") throw new Error("Risk QA no produjo el veto esperado.");

    const voiceStarted = performance.now();
    const created = await securedJson(baseUrl, bootstrap, "/api/voice/sessions", {
      preferredProvider: "openai-realtime",
    });
    voiceSamples.push(performance.now() - voiceStarted);
    if (created.session.provider !== "mock") throw new Error("Voice QA no activó el fallback mock.");
    await securedJson(baseUrl, bootstrap, `/api/voice/sessions/${created.session.id}/disconnect`, {});
  }
  return {
    iterations,
    portfolio: distribution(portfolioSamples),
    risk: distribution(riskSamples),
    voice: distribution(voiceSamples),
  };
}

async function securedJson(baseUrl, session, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      "X-APEX-Session-Id": session.sessionId,
      "X-APEX-Session-Token": session.token,
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${pathname} ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function distribution(samples) {
  const sorted = samples.slice().sort((left, right) => left - right);
  return {
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    minMs: round(sorted[0]),
    maxMs: round(sorted.at(-1)),
  };
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function readProcessRss(pid) {
  try {
    if (process.platform === "win32") {
      const output = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `(Get-Process -Id ${Number(pid)}).WorkingSet64`],
        { encoding: "utf8" },
      );
      const value = Number(output.trim());
      return Number.isFinite(value) ? value : null;
    }
    const status = fs.readFileSync(`/proc/${Number(pid)}/status`, "utf8");
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return match ? Number(match[1]) * 1024 : null;
  } catch {
    return null;
  }
}

function round(value) {
  return Math.round(Number(value) * 1_000) / 1_000;
}
