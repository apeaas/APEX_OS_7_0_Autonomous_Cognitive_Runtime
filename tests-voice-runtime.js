"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_VOICE_LIMITS,
  VOICE_STATES,
  validateSdp,
  validateToolCall,
  voiceLimits,
} = require("./lib/voice/contracts");
const { VoiceAudit, redact } = require("./lib/voice/audit");
const { VoiceCommandInterpreter, buildDraftDirective } = require("./lib/voice/command-interpreter");
const { VoiceSessionService } = require("./lib/voice/session-service");
const {
  authorizeVoiceTool,
  classifyVoiceTool,
  voiceToolDefinitions,
} = require("./lib/voice/tool-policy");
const { MockVoiceProvider } = require("./lib/voice/providers/mock-voice-provider");
const { OpenAIRealtimeProvider, safetyIdentifier } = require("./lib/voice/providers/openai-realtime-provider");
const { AudioController } = require("./assets/js/voice/audio-controller");
const { RealtimeClient } = require("./assets/js/voice/realtime-client");
const { VoiceState } = require("./assets/js/voice/voice-state");

let assertions = 0;
function check(actual, expected, message) {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
}
function rejectsCode(operation, code) {
  assertions += 1;
  return assert.rejects(operation, error => error?.code === code);
}
function throwsCode(operation, code) {
  assertions += 1;
  return assert.throws(operation, error => error?.code === code);
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-voice-"));
  try {
    await testContractsAndState();
    await testAudio();
    await testProviders();
    await testPolicyAndInterpreter();
    await testAudit(tmpDir);
    await testSessionService(tmpDir);
    await testBrowserClient();
    testStaticBoundaries();
    console.log(`APEX 7.1 constitutional voice tests: OK - ${assertions} assertions`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function testContractsAndState() {
  check(VOICE_STATES, [
    "disabled",
    "requesting_permission",
    "connecting",
    "listening",
    "processing",
    "speaking",
    "interrupted",
    "reconnecting",
    "error",
  ]);
  check(voiceLimits({ sessionTtlMs: 1 }).sessionTtlMs, 60_000);
  check(voiceLimits({ maxToolCalls: 999 }).maxToolCalls, 200);
  check(voiceLimits({}).maxResponses, DEFAULT_VOICE_LIMITS.maxResponses);
  check(validateSdp("v=0\r\nm=audio 9 RTP/AVP 0").startsWith("v=0"), true);
  throwsCode(() => validateSdp("not-sdp"), "INVALID_VOICE_SDP");
  check(validateToolCall({ callId: "call-1", name: "get_runtime_status", arguments: {} }).name, "get_runtime_status");
  throwsCode(() => validateToolCall({ callId: "?", name: "X", arguments: [] }), "INVALID_VOICE_TOOL_CALL");

  const state = new VoiceState();
  check(state.snapshot().state, "disabled");
  state.transition("requesting_permission");
  state.transition("connecting");
  state.transition("listening");
  state.transition("processing");
  state.transition("speaking");
  state.transition("interrupted");
  state.transition("listening");
  check(state.snapshot().state, "listening");
  throwsCode(() => state.transition("requesting_permission"), "INVALID_VOICE_TRANSITION");
  state.fail(Object.assign(new Error("falló"), { code: "VOICE_TEST_ERROR" }));
  check(state.snapshot().details.code, "VOICE_TEST_ERROR");
}

async function testAudio() {
  const unavailable = new AudioController({ mediaDevices: {}, document: null });
  await rejectsCode(() => unavailable.requestMicrophone(), "MICROPHONE_DEVICE_UNAVAILABLE");

  const denied = new AudioController({
    mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); } },
    document: null,
  });
  await rejectsCode(() => denied.requestMicrophone(), "MICROPHONE_PERMISSION_DENIED");

  const missing = new AudioController({
    mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error("missing"), { name: "NotFoundError" }); } },
    document: null,
  });
  await rejectsCode(() => missing.requestMicrophone(), "MICROPHONE_DEVICE_NOT_FOUND");

  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const localStream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
  const audioElement = {
    srcObject: null,
    paused: false,
    autoplay: false,
    hidden: false,
    setAttribute() {},
    async play() { this.paused = false; },
    pause() { this.paused = true; },
    remove() {},
  };
  const document = {
    createElement: () => audioElement,
    body: { appendChild() {} },
  };
  const audio = new AudioController({
    mediaDevices: { getUserMedia: async () => localStream },
    document,
  });
  await audio.requestMicrophone();
  check(audio.getHealth().active, true);
  check(audio.setMuted(true), true);
  check(track.enabled, false);
  const remoteStream = { id: "remote" };
  audio.attachRemote({ streams: [remoteStream] });
  audio.stopRemotePlayback();
  check(audioElement.srcObject, null);
  check(await audio.resumeRemotePlayback(), true);
  check(audioElement.srcObject, remoteStream);
  audio.stop();
  check(track.stopped, true);
  check(audio.getHealth().rawAudioStored, false);
}

async function testProviders() {
  const mock = new MockVoiceProvider();
  check(mock.getHealth().realVoice, false);
  await mock.connect({ sessionId: "mock-1" });
  check(mock.simulate("mostrá el portfolio").toolCall.name, "get_paper_portfolio");
  check(mock.simulate("ejecutá ahora").toolCall.name, "execute_trade");
  check(mock.simulate("hola").response.includes("No se utilizó audio real"), true);
  throwsCode(() => mock.simulate(" "), "EMPTY_VOICE_TRANSCRIPT");
  check((await mock.interrupt("mock-1")).interrupted, true);
  await mock.disconnect("mock-1");

  const failedMock = new MockVoiceProvider({ failConnect: true });
  await rejectsCode(() => failedMock.connect({ sessionId: "mock-fail" }), "MOCK_VOICE_CONNECTION_FAILED");

  const missingKey = new OpenAIRealtimeProvider({ apiKey: "" });
  check(missingKey.getHealth().configured, false);
  await rejectsCode(() => missingKey.connect({ sessionId: "openai-none" }), "AI_RUNTIME_NOT_CONFIGURED");

  let request = null;
  const openai = new OpenAIRealtimeProvider({
    apiKey: "unit-test-secret",
    model: "gpt-realtime",
    sessionConfig: () => ({ type: "realtime", model: "gpt-realtime" }),
    fetch: async (url, options) => {
      request = { url, options };
      return new Response("v=0\r\nm=audio 9 RTP/AVP 0", {
        status: 201,
        headers: { location: "/v1/realtime/calls/call_test" },
      });
    },
  });
  const connected = await openai.connect({
    sessionId: "voice-openai-1",
    ownerSessionId: "owner-1",
    sdp: "v=0\r\nm=audio 9 RTP/AVP 0",
  });
  check(connected.callId, "call_test");
  check(request.url.endsWith("/v1/realtime/calls"), true);
  check(request.options.headers.Authorization, "Bearer unit-test-secret");
  check(request.options.headers["OpenAI-Safety-Identifier"], safetyIdentifier("owner-1"));
  check(request.options.body instanceof FormData, true);
  check(JSON.stringify(connected).includes("unit-test-secret"), false);
}

async function testPolicyAndInterpreter() {
  check(classifyVoiceTool("get_paper_portfolio"), "read_only");
  check(classifyVoiceTool("prepare_paper_command"), "draft");
  check(classifyVoiceTool("execute_trade"), "blocked");
  check(authorizeVoiceTool("draft_opportunity_intent").requiresVisualConfirmation, true);
  throwsCode(() => authorizeVoiceTool("execute_trade"), "VOICE_TOOL_FORBIDDEN");
  throwsCode(() => authorizeVoiceTool("prepare_paper_command", { killSwitch: true }), "KILL_SWITCH_ACTIVE");
  check(voiceToolDefinitions().some(tool => tool.name === "explain_risk"), true);
  check(voiceToolDefinitions().some(tool => tool.name === "execute_trade"), false);

  const interpreter = new VoiceCommandInterpreter({
    readers: {
      get_runtime_status: async () => ({ mode: "observe", token: undefined }),
    },
  });
  const read = await interpreter.interpret({ name: "get_runtime_status", arguments: {} });
  check(read.kind, "read_only");
  check(read.result.mode, "observe");
  const draft = buildDraftDirective({
    name: "prepare_paper_command",
    arguments: { command: { type: "open_position", symbol: "BTCUSDT" } },
  });
  check(draft.type, "COMMAND_DRAFT");
  check(draft.payload.command.executionMode, "PAPER_ONLY");
  check(draft.next, "VISUAL_CONFIRMATION");
  throwsCode(
    () => buildDraftDirective({ name: "prepare_paper_command", arguments: { command: { type: "withdraw" } } }),
    "INVALID_VOICE_DRAFT",
  );
  throwsCode(
    () => buildDraftDirective({ name: "draft_improvement_proposal", arguments: { proposal: { evidence: [] } } }),
    "EVIDENCE_REQUIRED",
  );
  const research = buildDraftDirective({
    name: "draft_opportunity_intent",
    arguments: { intent: { thesis: "Investigar", operable: true } },
  });
  check(research.payload.operable, false);
}

async function testAudit(tmpDir) {
  const auditPath = path.join(tmpDir, "voice-audit.ndjson");
  const audit = new VoiceAudit({ filePath: auditPath });
  const record = audit.append("VOICE_TEST", {
    apiKey: "do-not-store",
    nested: { authorization: "Bearer secret", sdp: "v=0", normal: "kept" },
  });
  check(record.details.apiKey, "[REDACTED]");
  check(record.details.nested.sdp, "[REDACTED]");
  check(record.details.nested.normal, "kept");
  check(record.rawAudioStored, false);
  const disk = fs.readFileSync(auditPath, "utf8");
  check(disk.includes("do-not-store"), false);
  check(disk.includes("Bearer secret"), false);
  check(new VoiceAudit({ filePath: auditPath }).list().length, 1);
  check(redact({ rawAudio: "bytes", safe: 1 }), { rawAudio: "[REDACTED]", safe: 1 });

  const tamperedPath = path.join(tmpDir, "voice-audit-tampered.ndjson");
  fs.copyFileSync(auditPath, tamperedPath);
  fs.appendFileSync(tamperedPath, '{"bad":true}\n');
  throwsCode(() => new VoiceAudit({ filePath: tamperedPath }), "VOICE_AUDIT_INTEGRITY_FAILURE");
}

async function testSessionService(tmpDir) {
  let now = Date.parse("2026-07-24T12:00:00.000Z");
  let readerCalls = 0;
  const mock = new MockVoiceProvider();
  const audit = new VoiceAudit({ filePath: path.join(tmpDir, "session-audit.ndjson") });
  const interpreter = new VoiceCommandInterpreter({
    readers: {
      get_runtime_status: async () => {
        readerCalls += 1;
        return { mode: "observe", emergencyStop: false };
      },
    },
  });
  const service = new VoiceSessionService({
    providers: {
      "openai-realtime": new OpenAIRealtimeProvider({ apiKey: "" }),
      mock,
    },
    interpreter,
    audit,
    clock: () => now,
    limits: { sessionTtlMs: 60_000, maxReconnects: 0, maxToolCalls: 2 },
  });
  const owner = { ownerSessionId: "owner-A", killSwitch: false };
  const session = service.create({ preferredProvider: "openai-realtime" }, owner);
  check(session.provider, "mock");
  check(session.fallbackReason, "OPENAI_NOT_CONFIGURED");
  check(session.apiKeyExposed, false);
  throwsCode(() => service.create({ preferredProvider: "mock" }, owner), "VOICE_SESSION_ALREADY_ACTIVE");
  throwsCode(
    () => service.requireSession(session.id, { ownerSessionId: "owner-B" }),
    "FOREIGN_VOICE_SESSION",
  );
  const first = await service.executeTool(session.id, {
    callId: "tool-1",
    name: "get_runtime_status",
    arguments: {},
  }, owner);
  check(first.kind, "read_only");
  const duplicate = await service.executeTool(session.id, {
    callId: "tool-1",
    name: "get_runtime_status",
    arguments: {},
  }, owner);
  check(duplicate.duplicate, true);
  check(readerCalls, 1);
  await rejectsCode(() => service.executeTool(session.id, {
    callId: "tool-2",
    name: "execute_trade",
    arguments: {},
  }, owner), "VOICE_TOOL_FORBIDDEN");
  await rejectsCode(() => service.executeTool(session.id, {
    callId: "tool-3",
    name: "prepare_paper_command",
    arguments: { command: { type: "open_position" } },
  }, { ...owner, killSwitch: true }), "VOICE_TOOL_LIMIT");
  check((await service.interrupt(session.id, owner)).state, "interrupted");
  check((await service.disconnect(session.id, owner)).state, "disabled");
  await rejectsCode(() => service.executeTool(session.id, {
    callId: "tool-4",
    name: "get_runtime_status",
    arguments: {},
  }, owner), "VOICE_SESSION_CLOSED");

  const expiring = service.create({ preferredProvider: "mock" }, owner);
  now += 60_001;
  throwsCode(() => service.requireSession(expiring.id, owner), "VOICE_SESSION_EXPIRED");
  check(service.getHealth().rawAudioStored, false);
  check(service.getHealth().defaultProvider, "mock");

  let connections = 0;
  const realtimeService = new VoiceSessionService({
    providers: {
      "openai-realtime": {
        getHealth: () => ({ configured: true }),
        connect: async () => {
          connections += 1;
          return { answerSdp: "v=0\r\nm=audio 9 RTP/AVP 0", model: "test" };
        },
      },
      mock,
    },
    interpreter,
    audit,
    clock: () => now,
    limits: { maxReconnects: 0 },
  });
  const realtime = realtimeService.create({ preferredProvider: "openai-realtime" }, { ownerSessionId: "owner-C" });
  await realtimeService.connect(realtime.id, "v=0\r\nm=audio 9 RTP/AVP 0", { ownerSessionId: "owner-C" });
  await rejectsCode(
    () => realtimeService.connect(realtime.id, "v=0\r\nm=audio 9 RTP/AVP 0", { ownerSessionId: "owner-C" }),
    "VOICE_RECONNECT_LIMIT",
  );
  check(connections, 1);

  const killSwitchService = new VoiceSessionService({
    providers: { "openai-realtime": new OpenAIRealtimeProvider({ apiKey: "" }), mock },
    interpreter,
    audit,
  });
  const killSession = killSwitchService.create({ preferredProvider: "mock" }, { ownerSessionId: "owner-D" });
  await rejectsCode(() => killSwitchService.executeTool(killSession.id, {
    callId: "draft-kill",
    name: "prepare_paper_command",
    arguments: { command: { type: "open_position" } },
  }, { ownerSessionId: "owner-D", killSwitch: true }), "KILL_SWITCH_ACTIVE");
}

async function testBrowserClient() {
  const state = new VoiceState();
  const audio = {
    muted: false,
    requestMicrophone: async () => ({}),
    stop() {},
    stopRemotePlayback() {},
    addTracks() {},
  };
  const calls = [];
  const session = {
    id: "browser-mock",
    provider: "mock",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    limits: { maxResponses: 4, maxReconnects: 3, connectTimeoutMs: 2_000 },
  };
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/voice/health") {
      return json({ ok: true, defaultProvider: "mock", providers: { mock: { configured: true } } });
    }
    if (url === "/api/voice/sessions") return json({ ok: true, session });
    return json({ ok: true });
  };
  const client = new RealtimeClient({ state, audio, fetch });
  const events = [];
  client.on("*", event => events.push(event));
  check((await client.connect()).provider, "mock");
  check(state.value, "listening");
  await rejectsCode(() => client.connect(), "VOICE_DOUBLE_CONNECTION");
  await rejectsCode(() => client.sendText(" "), "EMPTY_VOICE_TRANSCRIPT");
  await client.sendText("hola");
  check(events.some(event => event.type === "mock.response"), true);
  await client.sendText("portfolio");
  check(events.some(event => event.type === "tool-call" && event.detail.name === "get_paper_portfolio"), true);
  await client.interrupt();
  check(state.value, "listening");
  await client.disconnect();
  check(state.value, "disabled");
  check(calls.some(call => call.url.endsWith("/disconnect")), true);

  const deniedState = new VoiceState();
  const deniedClient = new RealtimeClient({
    state: deniedState,
    audio: {
      requestMicrophone: async () => { throw Object.assign(new Error("denied"), { code: "MICROPHONE_PERMISSION_DENIED" }); },
      stop() {},
    },
    fetch: async url => url === "/api/voice/health"
      ? json({ ok: true, defaultProvider: "openai-realtime" })
      : json({ ok: true }),
  });
  await rejectsCode(() => deniedClient.connect(), "MICROPHONE_PERMISSION_DENIED");
  check(deniedState.value, "error");

  const liveState = new VoiceState("speaking");
  const sent = [];
  let stoppedRemote = false;
  const liveClient = new RealtimeClient({
    state: liveState,
    audio: {
      stopRemotePlayback() { stoppedRemote = true; },
      stop() {},
    },
    fetch: async () => json({ ok: true }),
  });
  liveClient.session = {
    id: "browser-live",
    provider: "openai-realtime",
    limits: { maxResponses: 4, maxReconnects: 3 },
  };
  liveClient.channel = { readyState: "open", send: value => sent.push(JSON.parse(value)) };
  await liveClient.interrupt();
  check(sent.map(event => event.type), ["response.cancel", "output_audio_buffer.clear"]);
  check(stoppedRemote, true);
  check(liveState.value, "listening");
  await liveClient.sendText("estado por texto");
  check(sent.slice(-2).map(event => event.type), ["conversation.item.create", "response.create"]);
  check(liveState.value, "processing");

  const reconnectState = new VoiceState("listening");
  const queued = [];
  const reconnectClient = new RealtimeClient({
    state: reconnectState,
    audio: { stop() {} },
    fetch: async () => json({ ok: true }),
    setTimer: callback => {
      queued.push(callback);
      return queued.length;
    },
    clearTimer() {},
  });
  reconnectClient.session = {
    id: "reconnect",
    provider: "openai-realtime",
    reconnects: 0,
    limits: { maxReconnects: 3 },
  };
  let reconnectAttempts = 0;
  reconnectClient.establishPeer = async () => {
    reconnectAttempts += 1;
    if (reconnectAttempts === 1) throw Object.assign(new Error("network"), { code: "VOICE_CONNECTION_FAILED" });
    reconnectState.transition("connecting");
    reconnectState.transition("listening");
  };
  reconnectClient.scheduleReconnect();
  await queued.shift()();
  check(reconnectClient.session.reconnects, 2);
  await queued.shift()();
  check(reconnectAttempts, 2);
  check(reconnectState.value, "listening");
}

function testStaticBoundaries() {
  const root = __dirname;
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const browserVoice = [
    "assets/js/voice/voice-state.js",
    "assets/js/voice/audio-controller.js",
    "assets/js/voice/realtime-client.js",
    "assets/js/voice/transcript-view.js",
    "assets/js/voice/voice-console.js",
  ].map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  check(html.includes("assets/css/voice-console.css"), true);
  check(html.includes("assets/js/voice/voice-console.js"), true);
  check(browserVoice.includes("/api/voice/sessions"), true);
  check(browserVoice.includes("/api/paper/commands"), true);
  check(browserVoice.includes("response.cancel"), true);
  check(browserVoice.includes("output_audio_buffer.clear"), true);
  check(browserVoice.includes("OPENAI_API_KEY"), false);
  check(browserVoice.includes("Bearer "), false);
  check(browserVoice.includes("/api/voice/execute"), false);
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
