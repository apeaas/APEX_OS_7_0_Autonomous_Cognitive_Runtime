# APEX 7.1 — Constitutional Realtime Voice Console

## Qué implementa

La consola es conversación bidireccional, no sólo dictado. Permanece visible
mientras escucha, procesa, habla, consulta tools, muestra transcript y espera
confirmaciones.

Provider backend:

- `VoiceProvider`
- `OpenAIRealtimeProvider`
- `MockVoiceProvider`

Browser:

- `voice-state.js`
- `audio-controller.js`
- `realtime-client.js`
- `transcript-view.js`
- `voice-console.js`

Controller/composición:

- `lib/voice/runtime.js`
- `lib/voice/session-service.js`
- `lib/voice/tool-policy.js`
- `lib/voice/command-interpreter.js`
- `lib/voice/audit.js`

## Documentación oficial usada

- [Realtime API with WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Voice activity detection](https://developers.openai.com/api/docs/guides/realtime-vad)
- [Managing Realtime costs](https://developers.openai.com/api/docs/guides/realtime-costs)
- [gpt-realtime model](https://developers.openai.com/api/docs/models/gpt-realtime)

El flujo unificado mantiene la credencial estándar en backend:

```text
browser: microphone + RTCPeerConnection + SDP offer
→ POST local /api/voice/sessions/:id/call
→ backend POST /v1/realtime/calls con API key
→ SDP answer al browser
→ audio WebRTC + data channel de eventos
```

La documentación vigente muestra modelos posteriores, pero esta máquina no
tiene una clave/cuenta configurada para verificar disponibilidad. Se conserva
`gpt-realtime` como fallback estable solicitado y
`OPENAI_REALTIME_MODEL` permite cambiarlo sin modificar contratos.

## Estados

- `disabled`
- `requesting_permission`
- `connecting`
- `listening`
- `processing`
- `speaking`
- `interrupted`
- `reconnecting`
- `error`

La state machine rechaza transiciones inválidas.

## Sesión y límites

La sesión de voz se liga a la sesión criptográfica local:

- TTL por defecto: 15 minutos;
- máximo 3 reconexiones;
- máximo 40 tool calls;
- máximo 48 respuestas;
- timeout de conexión: 20 segundos;
- doble conexión rechazada;
- sesión ajena/expirada/cerrada rechazada.

Variables:

- `OPENAI_REALTIME_MODEL`
- `APEX_VOICE_SESSION_TTL_MS`
- `APEX_VOICE_CONNECT_TIMEOUT_MS`
- `APEX_VOICE_MAX_RECONNECTS`
- `APEX_VOICE_MAX_TOOL_CALLS`
- `APEX_VOICE_MAX_RESPONSES`

Estos límites acotan exposición/costo local, pero no reemplazan budgets y
alertas de la cuenta OpenAI.

## Interrupción y reconexión

Interrumpir envía:

- `response.cancel`;
- `output_audio_buffer.clear`;
- petición local de auditoría/interrupción.

El audio remoto se pausa sin perder el stream y se reanuda en el próximo delta.
La reconexión usa backoff exponencial acotado y termina en `error` al superar el
límite.

## Tool policy

Read-only:

- runtime/gateway/calidad;
- portfolio y posiciones PAPER;
- Constitución/Fondo;
- explicación Risk;
- Decision Journal;
- documentación.

Draft:

- CommandDraft PAPER;
- OpportunityIntent no operable;
- ImprovementProposal con evidencia.

Bloqueado:

- ejecución directa o mutación sin confirmación;
- cambios de Constitución, etapa o Risk;
- activación de autonomía/live;
- desactivar kill switch;
- recapitalización;
- credenciales, firmas, transferencias y retiros.

Default deny: una tool desconocida se bloquea.

## Pipeline mutable

```text
Voice transcript
→ CommandDraft
→ confirmación visual
→ HumanConfirmation session-bound
→ /api/paper/commands
→ Unified Risk
→ Governance
→ PAPER ledger
```

La voz no crea rutas privilegiadas.

## Mock y fallback

Sin clave, micrófono, permiso, WebRTC o conexión:

- la aplicación sigue cargando;
- el mock/texto queda disponible;
- la UI muestra `MOCK · sin audio real`;
- transcript, interrupción y tool calls son determinísticos;
- el mock nunca se presenta como voz real.

El dictado heredado permanece separado como botón `Dictar`.

## Privacidad

- La API key no llega al browser.
- No se almacena audio crudo.
- Voice Audit guarda sólo metadata redacted y checksums.
- SDP, tokens y posibles campos de audio se reemplazan por `[REDACTED]`.
- Transcripts visibles se mantienen en la sesión/UI; esta versión no los
  persiste en Voice Audit por defecto.

## Ejecución y diagnóstico

```text
npm.cmd start
npm.cmd run test:voice
npm.cmd run test:smoke
```

Consultar:

- `GET /api/voice/health`
- `GET /api/voice/audit?limit=100`

Una llamada OpenAI real, su latencia, audio, consumo y reconexión de red deben
validarse en un entorno autorizado con clave y acceso de cuenta antes de
considerar la voz operacionalmente certificada.
