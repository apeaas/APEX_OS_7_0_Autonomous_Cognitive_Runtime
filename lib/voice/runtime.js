"use strict";

const { VoiceAudit } = require("./audit");
const { VoiceCommandInterpreter } = require("./command-interpreter");
const { OpenAIRealtimeProvider } = require("./providers/openai-realtime-provider");
const { MockVoiceProvider } = require("./providers/mock-voice-provider");
const { VoiceSessionService } = require("./session-service");
const { voiceToolDefinitions } = require("./tool-policy");

function createVoiceRuntime(options) {
  const audit = new VoiceAudit({ filePath: options.auditFile });
  const interpreter = new VoiceCommandInterpreter({ readers: options.readers });
  const openAIProvider = new OpenAIRealtimeProvider({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    timeoutMs: options.limits.connectTimeoutMs,
    sessionConfig: () => realtimeSessionConfig(options),
  });
  const sessions = new VoiceSessionService({
    providers: {
      "openai-realtime": openAIProvider,
      mock: new MockVoiceProvider(),
    },
    interpreter,
    audit,
    limits: options.limits,
  });

  return Object.freeze({
    audit,
    sessions,
    async handle(req, res, url) {
      if (req.method === "GET" && url.pathname === "/api/voice/health") {
        options.sendJson(res, 200, sessions.getHealth());
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/voice/audit") {
        options.sendJson(res, 200, { ok: true, records: audit.list(url.searchParams.get("limit")) });
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/voice/sessions") {
        const session = sessions.create(await options.readJson(req), options.requestContext(req));
        options.appendEvent(
          "VOICE_SESSION_CREATED",
          { voiceSessionId: session.id, provider: session.provider },
          session.provider === "mock" ? "warning" : "info",
        );
        options.sendJson(res, 201, { ok: true, session });
        return true;
      }

      const callMatch = url.pathname.match(/^\/api\/voice\/sessions\/([^/]+)\/call$/);
      if (req.method === "POST" && callMatch) {
        const sdp = await options.readText(req, req.apexSecurity.maxBytes);
        const result = await sessions.connect(callMatch[1], sdp, options.requestContext(req));
        options.appendEvent("REALTIME_CALL_CREATED", {
          voiceSessionId: result.session.id,
          model: options.model,
        }, "success");
        res.writeHead(201, { "Content-Type": "application/sdp", "Cache-Control": "no-store" });
        res.end(result.answerSdp);
        return true;
      }

      const toolMatch = url.pathname.match(/^\/api\/voice\/sessions\/([^/]+)\/tools$/);
      if (req.method === "POST" && toolMatch) {
        const result = await sessions.executeTool(toolMatch[1], await options.readJson(req), options.requestContext(req));
        options.sendJson(res, 200, result);
        return true;
      }

      const interruptMatch = url.pathname.match(/^\/api\/voice\/sessions\/([^/]+)\/interrupt$/);
      if (req.method === "POST" && interruptMatch) {
        await options.readJson(req);
        const session = await sessions.interrupt(interruptMatch[1], options.requestContext(req));
        options.sendJson(res, 200, { ok: true, session });
        return true;
      }

      const disconnectMatch = url.pathname.match(/^\/api\/voice\/sessions\/([^/]+)\/disconnect$/);
      if (req.method === "POST" && disconnectMatch) {
        await options.readJson(req);
        const session = await sessions.disconnect(disconnectMatch[1], options.requestContext(req));
        options.sendJson(res, 200, { ok: true, session });
        return true;
      }
      return false;
    },
  });
}

function realtimeSessionConfig(options) {
  return {
    type: "realtime",
    model: options.model,
    instructions: [
      typeof options.systemInstructions === "function" ? options.systemInstructions() : options.systemInstructions,
      "# Voz",
      "Respondé en español, con fluidez, de forma directa y normalmente en 1–3 frases.",
      "Disentí cuando la evidencia no alcance. Declará incertidumbre y datos degradados.",
      "No ejecutes herramientas mutables. Sólo consultá o prepará borradores.",
      "Toda operación PAPER requiere CommandDraft, confirmación visual, Risk y Governance por las APIs normales.",
      "Nunca describas una narrativa o un feed degradado como una decisión operable.",
    ].join("\n"),
    output_modalities: ["audio"],
    audio: {
      input: {
        noise_reduction: { type: "far_field" },
        transcription: { model: "gpt-4o-mini-transcribe", language: "es" },
        turn_detection: {
          type: "semantic_vad",
          create_response: true,
          interrupt_response: true,
          eagerness: "auto",
        },
      },
      output: { voice: "marin", speed: 1.02 },
    },
    tools: voiceToolDefinitions(),
    tool_choice: "auto",
  };
}

module.exports = { createVoiceRuntime, realtimeSessionConfig };
