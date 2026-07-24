"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const port = 8799;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex7-smoke-"));
const child = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env: { ...process.env, APEX_PORT: String(port), OPENAI_API_KEY: "", APEX_DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"],
});

const timeout = setTimeout(() => finish(new Error("Smoke test timeout")), 15000);
let finished = false;
child.stdout.on("data", async chunk => {
  if (!String(chunk).includes("disponible")) return;
  try {
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    const health = await healthRes.json();
    if (!health.ok || health.version !== "7.0.0" || health.executionMode !== "PAPER_ONLY") throw new Error("Health inválido");
    if (health.externalAccounts !== false || health.liveTrading !== false) throw new Error("Locks de seguridad inválidos");

    const state = await fetch(`http://127.0.0.1:${port}/api/runtime/state`).then(r => r.json());
    if (state.mode !== "observe" || state.config.autonomyCapPct > 5) throw new Error("Runtime inicial inválido");

    const indexRes = await fetch(`http://127.0.0.1:${port}/`);
    const html = await indexRes.text();
    if (!indexRes.ok || !html.includes("APEX AI Commander") || !html.includes("apex-7-runtime.js")) throw new Error("Frontend v7 no servido");

    const adapterRes = await fetch(`http://127.0.0.1:${port}/api/integrations`);
    const adapters = await adapterRes.json();
    if (adapters.externalAccountsEnabled !== false) throw new Error("Integraciones externas habilitadas por error");

    for (const secretPath of ["/.env", "/server.js", "/data/apex-runtime-state.json"]) {
      const response = await fetch(`http://127.0.0.1:${port}${secretPath}`);
      if (response.status !== 404) throw new Error(`El servidor expuso ${secretPath}`);
    }

    const aiRes = await fetch(`http://127.0.0.1:${port}/api/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "estado", state: {} }) });
    if (aiRes.status !== 503) throw new Error("La ausencia de clave no fue controlada");
    console.log("APEX 7.0 smoke test: OK");
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
