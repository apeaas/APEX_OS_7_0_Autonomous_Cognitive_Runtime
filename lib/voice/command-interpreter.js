"use strict";

const { authorizeVoiceTool } = require("./tool-policy");
const { voiceError } = require("./contracts");

class VoiceCommandInterpreter {
  constructor(options = {}) {
    this.readers = options.readers || {};
  }

  async interpret(call, context = {}) {
    const authorization = authorizeVoiceTool(call.name, context);
    if (authorization.classification === "read_only") {
      const reader = this.readers[call.name];
      if (typeof reader !== "function") throw voiceError("VOICE_TOOL_UNAVAILABLE", `No existe reader para ${call.name}.`, 503);
      return {
        ok: true,
        kind: "read_only",
        policyVersion: authorization.policyVersion,
        result: sanitize(await reader(call.arguments, context)),
      };
    }
    return {
      ok: true,
      kind: "draft",
      policyVersion: authorization.policyVersion,
      requiresVisualConfirmation: true,
      directExecution: false,
      directive: buildDraftDirective(call),
    };
  }
}

function buildDraftDirective(call) {
  if (call.name === "prepare_paper_command") {
    const command = sanitize(call.arguments.command);
    if (!["open_position", "modify_position", "close_position"].includes(command?.type)) {
      throw voiceError("INVALID_VOICE_DRAFT", "Tipo de comando PAPER no permitido.", 400);
    }
    return {
      type: "COMMAND_DRAFT",
      normalRoute: "/api/decision/drafts",
      payload: {
        command: {
          ...command,
          source: "VOICE_COMMAND",
          executionMode: "PAPER_ONLY",
        },
      },
      next: "VISUAL_CONFIRMATION",
    };
  }
  if (call.name === "draft_opportunity_intent") {
    return {
      type: "OPPORTUNITY_INTENT_DRAFT",
      payload: {
        ...sanitize(call.arguments.intent),
        operable: false,
        source: "VOICE_COMMAND",
      },
      next: "HUMAN_REVIEW",
    };
  }
  if (call.name === "draft_improvement_proposal") {
    const proposal = sanitize(call.arguments.proposal);
    if (!Array.isArray(proposal?.evidence) || !proposal.evidence.length) {
      throw voiceError("EVIDENCE_REQUIRED", "La propuesta de voz requiere evidencia.", 400);
    }
    return {
      type: "IMPROVEMENT_PROPOSAL_DRAFT",
      normalRoute: "/api/improvements",
      payload: proposal,
      next: "HUMAN_REGISTRATION",
    };
  }
  throw voiceError("VOICE_TOOL_FORBIDDEN", `Draft no permitido: ${call.name}.`, 403);
}

function sanitize(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

module.exports = { VoiceCommandInterpreter, buildDraftDirective };
