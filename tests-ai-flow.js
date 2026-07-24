"use strict";
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createSecuredFetch } = require("./tests/helpers/secured-fetch");
const mockPort = 8810;
const apexPort = 8809;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex7-ai-"));
let openAiCalls = 0;

const mock = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/responses") return res.writeHead(404).end();
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    openAiCalls += 1;
    res.setHeader("Content-Type", "application/json");
    if (openAiCalls === 1) {
      res.end(JSON.stringify({ id: "resp_mock_1", output: [{ type: "function_call", call_id: "call_mock_1", name: "focus_asset", arguments: JSON.stringify({ symbol: "BTCUSDT" }) }], usage: { input_tokens: 10, output_tokens: 5 } }));
    } else {
      const parsed = JSON.parse(body || "{}");
      if (parsed.previous_response_id !== "resp_mock_1") return res.writeHead(400).end(JSON.stringify({ error: { message: "previous_response_id ausente" } }));
      res.end(JSON.stringify({ id: "resp_mock_2", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Puse a BTC en foco para revisar su estructura." }] }], usage: { input_tokens: 8, output_tokens: 9 } }));
    }
  });
});

mock.listen(mockPort, "127.0.0.1", () => {
  const apex = spawn(process.execPath, ["server.js"], { cwd: __dirname, env: { ...process.env, APEX_PORT: String(apexPort), APEX_DATA_DIR: dataDir, APEX_MARKET_GATEWAY_DISABLED: "1", OPENAI_API_KEY: "test-key-not-real", OPENAI_BASE_URL: `http://127.0.0.1:${mockPort}/v1`, OPENAI_MODEL: "mock-model" }, stdio: ["ignore", "pipe", "pipe"] });
  const timeout = setTimeout(() => finish(new Error("AI flow test timeout")), 15000);
  let finished = false;
  apex.stdout.on("data", async chunk => {
    if (!String(chunk).includes("disponible")) return;
    try {
      const securedFetch = createSecuredFetch(`http://127.0.0.1:${apexPort}`);
      const response = await securedFetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "Poné BTC en foco", state: { version: "7.0.0", executionMode: "PAPER_ONLY", focusSymbol: "ETHUSDT" }, history: [] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(data));
      if (data.text !== "Puse a BTC en foco para revisar su estructura.") throw new Error("Texto final incorrecto");
      if (data.actions?.length !== 1 || data.actions[0].name !== "focus_asset" || data.actions[0].requiresConfirmation !== false) throw new Error("Tool call o política incorrecta");
      if (data.runtime?.mode !== "observe") throw new Error("Contexto runtime ausente");
      if (openAiCalls !== 2) throw new Error("Loop function calling incompleto");
      console.log("APEX 7.0 AI function-calling test: OK");
      finish();
    } catch (error) { finish(error); }
  });
  function finish(error) { if (finished) return; finished = true; clearTimeout(timeout); apex.kill("SIGTERM"); mock.close(); fs.rmSync(dataDir, { recursive: true, force: true }); if (error) { console.error(error); process.exitCode = 1; } }
});
