"use strict";

const { voiceError } = require("./contracts");

const READ_ONLY_TOOLS = new Set([
  "get_runtime_status",
  "get_market_quality",
  "get_paper_portfolio",
  "get_constitution",
  "get_autonomous_fund",
  "explain_risk",
  "get_decision_journal",
  "get_documentation",
]);

const DRAFT_TOOLS = new Set([
  "prepare_paper_command",
  "draft_opportunity_intent",
  "draft_improvement_proposal",
]);

const EXPLICITLY_BLOCKED_TOOLS = new Set([
  "execute_trade",
  "execute_paper_command",
  "change_constitution",
  "change_stage",
  "change_risk",
  "activate_autonomy",
  "disable_kill_switch",
  "activate_live",
  "recapitalize_fund",
  "read_credentials",
  "sign_transaction",
  "transfer_funds",
  "withdraw_funds",
]);

function classifyVoiceTool(name) {
  if (READ_ONLY_TOOLS.has(name)) return "read_only";
  if (DRAFT_TOOLS.has(name)) return "draft";
  return "blocked";
}

function authorizeVoiceTool(name, context = {}) {
  const classification = classifyVoiceTool(name);
  if (classification === "blocked") {
    throw voiceError("VOICE_TOOL_FORBIDDEN", `La herramienta de voz ${name} no está permitida.`, 403, {
      explicitlyBlocked: EXPLICITLY_BLOCKED_TOOLS.has(name),
    });
  }
  if (classification === "draft" && context.killSwitch) {
    throw voiceError("KILL_SWITCH_ACTIVE", "El kill switch bloquea borradores mutables desde voz.", 423);
  }
  return {
    allowed: true,
    classification,
    requiresVisualConfirmation: classification === "draft",
    directExecution: false,
    policyVersion: "voice-tool-policy.v1",
  };
}

function voiceToolDefinitions() {
  return [
    tool("get_runtime_status", "Consulta estado, modo, kill switch y locks del runtime.", {}),
    tool("get_market_quality", "Consulta salud, calidad y confianza del Market Data Gateway.", {}),
    tool("get_paper_portfolio", "Consulta la proyección canónica del portfolio PAPER.", {}),
    tool("get_constitution", "Consulta la Constitución Patrimonial activa y su hash.", {}),
    tool("get_autonomous_fund", "Consulta el Fondo Autónomo PAPER.", {}),
    tool("explain_risk", "Evalúa y explica Risk sin ejecutar. Los datos degradados nunca son operables.", {
      command: { type: "object", additionalProperties: true },
    }, ["command"]),
    tool("get_decision_journal", "Consulta entradas recientes del Decision Journal.", {
      limit: { type: "integer", minimum: 1, maximum: 25 },
    }),
    tool("get_documentation", "Lista documentación operativa de APEX 7.1.", {}),
    tool("prepare_paper_command", "Prepara un CommandDraft PAPER. Nunca ejecuta; exige confirmación visual y las APIs normales.", {
      command: { type: "object", additionalProperties: true },
    }, ["command"]),
    tool("draft_opportunity_intent", "Prepara un OpportunityIntent no operable para investigación.", {
      intent: { type: "object", additionalProperties: true },
    }, ["intent"]),
    tool("draft_improvement_proposal", "Prepara una ImprovementProposal con evidencia para registro humano.", {
      proposal: { type: "object", additionalProperties: true },
    }, ["proposal"]),
  ];
}

function tool(name, description, properties, required = []) {
  return {
    type: "function",
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };
}

module.exports = {
  DRAFT_TOOLS,
  EXPLICITLY_BLOCKED_TOOLS,
  READ_ONLY_TOOLS,
  authorizeVoiceTool,
  classifyVoiceTool,
  voiceToolDefinitions,
};
