# APEX 7.1 — Implementation Log

Rama: `feature/constitutional-cognitive-voice-runtime`  
Base local verificada: `805d639690ebfce9922f5b6f347e9a67a9f7c42f`  
Modo de ejecución: `PAPER_ONLY`

## Gate 0 — Baseline Audit

### Objetivo

Verificar la base solicitada, ejecutar la suite existente y mapear las fuentes de
autoridad, las superficies mutables y los límites antes de editar el runtime.

### Entorno y comandos

- Fecha: 2026-07-24.
- OS: Microsoft Windows NT 10.0.19045.0.
- Node: v24.18.0.
- Rama inicial: `main`.
- Commit local inicial: `805d639690ebfce9922f5b6f347e9a67a9f7c42f`.
- `git fetch --prune origin`: intentado; GitHub respondió `Empty reply from server`.
  No se modificó la historia y se continuó porque la copia local limpia coincide
  exactamente con la base exigida.
- `npm.cmd test`: exit 0, duración 35.506 ms.
- Suites: 5/5 (`contract`, `market`, `smoke`, `ai`, `runtime`), todas OK.
- Chequeo sintáctico existente: OK.
- Fallos preexistentes: ninguno en la suite. `npm` desde PowerShell requiere
  invocar `npm.cmd` por la política local de ejecución de scripts.

### Hallazgos

#### Runtime y seguridad

- `server.js` concentraba composición, routing, seguridad, persistencia, IA,
  acciones y Realtime en 791 líneas.
- Rutas mutables detectadas:
  `POST /api/assistant`, `/api/runtime/snapshot`, `/api/runtime/events`,
  `/api/runtime/mode`, `/api/runtime/cycle`, `/api/runtime/emergency`,
  `/api/runtime/actions/:id/{claim,result,cancel}`, `/api/runtime/plans`,
  `/api/runtime/export`, `/api/realtime/call`; y
  `PATCH /api/runtime/config`, `/api/runtime/plans/:id`.
- El guard sólo cubría `POST`, no `PATCH`, `PUT` o `DELETE`.
- Un `Origin` ausente se aceptaba; `Host` no se validaba.
- No existía sesión criptográfica ni token antifalsificación.
- El límite de payload se comprobaba durante streaming, pero no había política
  uniforme de tipo de contenido, schema o idempotency key.
- El rate limit era global por IP y sólo para `POST`.
- El lifecycle permitía reportar `queued → executed/failed`.
- Los claims no tenían `claimId`, sesión, nonce, expiración ni prevención de
  reutilización.
- El kill switch cancelaba cola, pero la protección no estaba centralizada para
  todas las mutaciones.

#### Portfolio PAPER

- `assets/js/app.js` cargaba y escribía `apex-portfolio` en `localStorage`.
- Apertura, modificación, cierre, cash, equity y PnL se calculaban en el browser.
- El backend recibía snapshots del browser y los usaba para riesgo autónomo.
- Reiniciar el servidor no reconstruía la contabilidad desde un ledger.
- No había command/event separation, event integrity, idempotencia de efectos ni
  importación única del estado heredado.

#### Risk, Governance y mercado

- Había límites distintos en UI, AI Command y ciclo autónomo; el browser podía
  vetar con un 2% mientras autonomía usaba `apex_autonomy.json`.
- `evaluateAutonomousRisk` combinaba feed, cash, posiciones y límites, pero no era
  un Risk Engine común ni producía un contrato versionado.
- `MarketDataGateway` conserva REST/WebSocket/cache público read-only.
- La caché restaurada se marca `trusted: false`; `healthy` es la única calidad
  operable.
- Thinking puede presentar evidencia degradada, pero no existía un contrato
  común `operable=false`.

#### UI y voz

- `assets/js/app.js` tenía 1.412 líneas y contabilidad PAPER operativa.
- `assets/js/apex-7-runtime.js` mezclaba Mission Control, polling, ejecución de
  acciones y un puente WebRTC básico.
- Existía dictado/push-to-talk y un bridge Realtime beta, pero no una consola
  persistente con state machine, texto/voz compartidos, mock determinístico,
  reconexión y tool policy modular.
- El endpoint Realtime mantenía la API key en backend, un límite positivo que se
  preservará.

### Decisiones

- Backend como única autoridad PAPER mediante ledger append-only.
- Sesión local efímera y guard único para todos los métodos mutables.
- Claims y confirmaciones ligados a sesión y de un solo uso.
- Safety Kernel en código, siempre más restrictivo que configuración,
  Constitución, prompts o modelos.
- Risk y Governance como contratos determinísticos compartidos.
- Voz sin ruta privilegiada: toda mutación recorrerá confirmación, Risk,
  Governance y command API PAPER.
- Sin base de datos externa y sin Quantum Surfer.

### Archivos

- Creado: `docs/APEX_7_1_IMPLEMENTATION_LOG.md`.

### Riesgos y deuda

- El fetch remoto debe repetirse cuando GitHub esté disponible.
- La migración del browser debe preservar un backup no operativo sin volver a
  tratarlo como autoridad.
- La conectividad OpenAI Realtime real no puede validarse sin clave y red; CI
  dependerá del provider mock.

### Resultado

`PASS`. Base local exacta, árbol limpio y suite preexistente completa en verde.
