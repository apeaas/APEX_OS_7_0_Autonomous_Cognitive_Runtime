"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const aiJs = fs.readFileSync(path.join(root, "assets/js/apex-ai-command.js"), "utf8");
const runtimeJs = fs.readFileSync(path.join(root, "assets/js/apex-7-runtime.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const serverJs = fs.readFileSync(path.join(root, "server.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/apex-7-runtime.css"), "utf8");

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`IDs duplicados: ${[...new Set(duplicates)].join(", ")}`);
for (const id of ["aiCommandPill", "aiRuntimeState", "aiPendingActions", "aiCommandLauncher", "chatInput", "sendChatBtn"]) if (!ids.includes(id)) throw new Error(`Falta ID base ${id}`);
for (const id of ["autonomousRuntimePanel", "runtimeKillBtn", "runtimeQueueList", "runtimePlanList", "runtimeSettingsCard", "runtimeProtocolModal"]) if (!runtimeJs.includes(id)) throw new Error(`Falta UI runtime ${id}`);

for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)) {
  const ref = match[1];
  if (/^(?:https?:|data:)/.test(ref)) continue;
  if (!fs.existsSync(path.join(root, ref))) throw new Error(`Asset inexistente: ${ref}`);
}
if (!html.includes("apex-7-runtime.css") || !html.includes("apex-7-runtime.js")) throw new Error("Assets v7 no vinculados");
if (!aiJs.includes("window.APEX_RUNTIME?.executeCommandAction")) throw new Error("AI Command no delega al runtime v7");
if (!runtimeJs.includes("processAutonomousQueue") || !runtimeJs.includes("executeAutonomousAction")) throw new Error("Worker autónomo ausente");
if (!appJs.includes("commandExecutePaperTrade") || !appJs.includes("getCommandSnapshot")) throw new Error("APEX_API incompleta");
if (!appJs.includes("Autoauditoría determinística")) throw new Error("Governance sigue sin auditoría determinística");
if (!serverJs.includes("HUMAN_AUTONOMY_CEILING_PCT = 5")) throw new Error("Techo humano no fijado");
if (!serverJs.includes("externalAccounts: false") || !serverJs.includes("liveTrading: false")) throw new Error("Locks externos ausentes");
if (!css.includes(".autonomy-command-rail") || !css.includes(".runtime-master-grid")) throw new Error("Design System runtime incompleto");
if (/sk-[A-Za-z0-9_-]{20,}/.test(html + aiJs + runtimeJs + appJs + serverJs)) throw new Error("Posible clave embebida");
console.log(`APEX 7.0 frontend contract: OK · ${ids.length} static IDs`);
