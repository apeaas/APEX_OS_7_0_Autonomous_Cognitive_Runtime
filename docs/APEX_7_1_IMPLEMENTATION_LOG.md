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

## Gate 1 — Runtime Security and Action Lifecycle

### Objetivo

Aplicar una frontera de seguridad uniforme a todas las rutas mutables y hacer que
el lifecycle de acciones requiera un claim criptográfico ligado a sesión.

### Implementación

- `SessionManager` crea `sessionId` y token de 256 bits sólo en memoria, ligados
  a contexto de cliente, con expiración y rotación automática en cada arranque.
- `GET /api/session/bootstrap` valida Host y contexto same-origin, responde con
  `Cache-Control: no-store` y nunca persiste ni registra el token.
- El cliente de seguridad se carga antes que el resto del frontend, conserva las
  credenciales en un closure y añade headers de sesión e idempotencia a toda
  llamada same-origin `POST`, `PATCH`, `PUT` o `DELETE`.
- `MutableRequestGuard` centraliza Host, Origin, sesión, token, media type, tamaño
  declarado, contrato de ruta, rate limit, idempotency key y kill switch.
- Los contratos asignan un tipo y máximo de body por ruta; una ruta mutable no
  registrada se rechaza.
- El rate limit es por sesión, método y ruta.
- Lifecycle válido: `queued → claimed → completed | failed | cancelled`.
- Cada claim contiene `actionId`, `claimId`, `sessionId`, `claimant`, `attempt`,
  `claimedAt`, `expiresAt` y nonce criptográfico.
- Completar exige `claimId`, nonce, sesión propietaria, claim vigente y estado
  `claimed`; el nonce queda consumido y un segundo efecto es imposible.
- El kill switch impide claims y resultados pendientes, cancela la cola mediante
  el mismo lifecycle y sólo deja pasar administración segura explícita.
- Se eliminó el reporte externo `queued → failed` que usaba el browser al fallar
  antes de obtener un claim válido.

### Archivos

- Creados:
  `lib/runtime-security/contracts.js`,
  `lib/runtime-security/session-manager.js`,
  `lib/runtime-security/rate-limiter.js`,
  `lib/runtime-security/action-claims.js`,
  `lib/runtime-security/mutable-request-guard.js`,
  `assets/js/runtime-security-client.js`,
  `tests/helpers/secured-fetch.js`,
  `tests-runtime-security.js`.
- Modificados:
  `server.js`, `index.html`, `assets/js/apex-7-runtime.js`, `package.json`,
  `tests-smoke.js`, `tests-ai-flow.js`, `tests-runtime.js`.

### Pruebas

- `npm.cmd run test:security`: 35 aserciones negativas, exit 0.
- Casos: token ausente/inválido/expirado, contexto ajeno, Origin inválido, Host
  inválido, PATCH protegido, payload excesivo, JSON inválido, content type
  inválido, rate limit, idempotency key ausente, claim expirado/ajeno/inválido,
  resultado duplicado, transición inválida, cancelación, y kill switch antes y
  durante el lifecycle.
- `npm.cmd test`: 6/6 suites OK, exit 0, duración final 19.093 ms.
- Suites preservadas: frontend contract (219 IDs), market gateway, smoke, AI
  function calling y autonomous runtime.

### Riesgos y deuda

- La sesión local no sustituye autenticación multiusuario; está diseñada para el
  runtime local de esta versión.
- `APEX_ALLOWED_HOSTS` y `APEX_ALLOWED_ORIGINS` deben configurarse explícitamente
  si el proceso se publica en una interfaz LAN o detrás de un reverse proxy.
- La idempotencia de efectos PAPER se completará en Gate 2 en el ledger; Gate 1
  garantiza idempotencia del lifecycle y exige la key en toda mutación.

### Resultado

`PASS`. Runtime endurecido, browser actualizado y suite completa en verde.

## Gate 2 — Canonical PAPER Ledger and Portfolio Projection

### Objetivo

Convertir el backend en la única autoridad de cash, equity, PnL y posiciones
PAPER mediante eventos append-only, proyección reproducible e importación única
del estado heredado.

### Implementación

- `EventStore` NDJSON append-only con `fsync`, schema, idempotency key única y
  cadena SHA-256 enlazada por `previousChecksum`.
- Una corrupción intermedia o checksum alterado aborta en modo fail-safe.
- Una escritura final truncada se copia a backup de evidencia y se recupera
  únicamente hasta el último evento íntegro antes de admitir nuevos appends.
- Separación explícita de commands, events, projections y queries.
- Eventos implementados:
  `portfolio_initialized`, `legacy_portfolio_imported`,
  `paper_order_submitted`, `paper_order_filled`,
  `paper_position_modified`, `paper_position_closed`,
  `paper_cash_adjusted` y los contratos reservados del fondo para Gate 3.
- Cada evento contiene todos los campos constitucionales de auditoría y su
  bloque de integridad.
- Proyección determinística con cash, equity, realized/unrealized PnL,
  posiciones, exposición bruta/neta/por símbolo, fondos, high-water mark,
  drawdown, versión y último evento/checksum aplicados.
- Marks de mercado son overlays read-only y sólo se aplican si el gateway es
  trusted; no se convierten en una segunda contabilidad.
- Snapshot atómico con checksum. Es descartable: un snapshot corrupto se ignora
  y el estado siempre se reconstruye desde el ledger.
- Command API:
  `POST /api/paper/commands`; queries:
  `GET /api/portfolio`, `GET /api/portfolio/events`.
- Idempotencia sin segundo efecto, versionado optimista para concurrencia y
  rechazo de cierre doble, posición duplicada, cash insuficiente y números no
  finitos.
- Migración:
  `POST /api/portfolio/import`, validación completa, fingerprint SHA-256,
  conflicto explícito y evento único `legacy_portfolio_imported`.
- El browser detecta `apex-portfolio`, solicita confirmación, importa, archiva
  una copia marcada `operational:false` y elimina la clave operativa.
- `assets/js/app.js` ya no carga, guarda ni modifica contabilidad en
  `localStorage`; todas las aperturas, modificaciones y cierres usan command API.
- El backend descarta el portfolio incluido en snapshots del browser y usa la
  proyección canónica para IA, autonomía y resúmenes del runtime.
- El reset destructivo del browser fue sustituido por un rechazo append-only.

### Archivos

- Creados:
  `lib/paper-ledger/contracts.js`, `event-store.js`, `projector.js`,
  `commands.js`, `queries.js`, `snapshots.js`, `migration.js`,
  `lib/portfolio/projection.js`, `validators.js`,
  `assets/js/paper-portfolio-client.js`, `tests-paper-ledger.js`.
- Modificados:
  `server.js`, `assets/js/app.js`, `assets/js/apex-7-runtime.js`,
  `index.html`, `package.json`, `.gitignore`, `tests-smoke.js`,
  `tests-runtime.js`, `tests-frontend-contract.js`,
  `lib/runtime-security/contracts.js`.

### Pruebas

- Ledger: 32 aserciones sobre evento/idempotency duplicados, cierre/PnL doble,
  replay, reinicio, snapshot corrupto, tail truncado, checksum alterado,
  importación repetida/parcial/conflictiva, números no finitos, posición
  imposible/duplicada y conflicto de versión concurrente.
- Smoke: inicialización, query, command API y repetición idempotente.
- Frontend contract: cliente canónico cargado antes de `app.js` y ausencia de
  lectura/escritura operativa de `apex-portfolio`.
- `npm.cmd test`: 7/7 suites OK, exit 0, duración 21.993 ms.

### Riesgos y deuda

- El ledger local usa exclusión por proceso y el event loop de Node; ejecutar dos
  procesos contra el mismo `APEX_DATA_DIR` no está soportado.
- El overlay de PnL no realizado depende de market data trusted y no se persiste.
- La autorización Risk/Governance previa a command API se centraliza en Gate 3/4.

### Resultado

`PASS`. Ledger canónico, migración y frontend proyectado con suite completa en
verde.

## Gate 3 — Safety Kernel, Constitution, Unified Risk and Autonomous Fund

### Objetivo

Establecer límites técnicos no relajables, registrar una Constitución activa por
hash, sustituir los caminos Risk duplicados por un engine determinístico y
modelar el aporte autónomo inicial fijo.

### Implementación

- Safety Kernel en código con PAPER_ONLY, live/external accounts/broker/wallet/
  retiros/transferencias/custodia deshabilitados, feed trusted obligatorio,
  kill switch absoluto, claim requerido y techo autónomo inicial de 5%.
- Los hard locks públicos ahora derivan del kernel, no de JSON ni prompts.
- `patrimonial-constitution.v1.json` incluye identidad, versión, estado,
  timestamps, hash, objetivo, etapa, límites, autonomía, perfiles Risk, políticas
  de drawdown/consolidación/transición, vetos, prohibiciones y change control.
- El registro activo se fija en `APEX_DATA_DIR` por versión+hash. Editar el JSON
  activo, incluso con un hash válido nuevo, detiene el arranque con
  `SILENT_CONSTITUTION_CHANGE_BLOCKED`.
- Las etapas se modelan, pero sólo generan propuestas pendientes de confirmación
  humana; no existe transición automática.
- Unified Risk `unified-risk.v1` consume Safety, Constitución, runtime config,
  feed/frescura, portfolio ledger, cash, equity, riesgo, tamaño, exposición,
  concentración, duplicados, pérdida diaria, R/R, expiración, etapa y fondo.
- Ante límites en conflicto se usa el mínimo. Las salidas versionadas son
  `approve`, `reduce`, `delay`, `reject` con razones, límites, warnings,
  evidencia de feed y timestamps.
- `POST /api/paper/commands` aplica Risk en backend y reemplaza el tamaño por
  `approvedSize` cuando la decisión es `reduce`.
- Manual, assistant y autonomía recorren el mismo engine. El scheduler verifica
  el gateway autoritativo antes de consultar al modelo; un snapshot o modelo no
  puede declarar trusted un feed.
- El frontend dejó de atribuirse decisiones Risk: sólo preestima y muestra la
  decisión/tamaño/riesgo devueltos por backend.
- Fondo PAPER modelado con los tipos `PATRIMONY_RESERVE`,
  `AUTONOMOUS_GROWTH_POOL` y `PROFIT_CONSOLIDATION_POOL`, y estados requeridos.
- La contribución es `capitalReferenceAmount × allocationPct` una sola vez,
  con base congelada y `allocationPct <= 0.05`.
- No hay top-up por pérdidas, recálculo por aumento patrimonial, retorno
  automático de consolidado ni recapitalización. Esta última se rechaza hasta
  una nueva Constitución y aprobación humana.
- No se inventaron porcentajes de drawdown o consolidación: permanecen `null` y
  requieren definición/importe humano explícito.
- APIs: `GET /api/constitution`, `/api/risk/policy`, `/api/fund`;
  `POST /api/risk/evaluate`, `/api/fund/commands`.

### Archivos

- Creados:
  `config/patrimonial-constitution.v1.json`,
  `lib/safety-kernel/{invariants,evaluator}.js`,
  `lib/constitution/{schema,registry,evaluator,change-control}.js`,
  `lib/risk/{contracts,policy,engine,explain}.js`,
  `lib/autonomous-fund/{model,service}.js`,
  `tests-constitutional-risk-fund.js`.
- Modificados:
  `server.js`, `lib/runtime-security/contracts.js`,
  `lib/paper-ledger/commands.js`, `assets/js/app.js`, `index.html`,
  `package.json`, `.gitignore`, `tests-smoke.js`, `tests-runtime.js`.

### Pruebas

- Policy: 43 aserciones sobre Constitución inválida/hash/cambio silencioso,
  etapa sin autoridad, live, feed untrusted, kill switch, modelo sin autoridad,
  reducción de riesgo, feed/frescura, duplicado, pérdida diaria, expiración,
  perfil que intenta elevar límites, fondo >5%, base/contribución, ganancia,
  pérdida sin top-up, consolidación, recapitalización, freeze e idempotencia.
- Smoke integra Constitución, fondo y veto Risk con gateway degradado.
- Runtime confirma que ni snapshot ni modelo elevan la confianza del gateway.
- `npm.cmd test`: 8/8 suites OK, exit 0, duración 24.467 ms.

### Riesgos y deuda

- Los umbrales de drawdown y consolidación quedan deliberadamente sin valor
  hasta una decisión humana versionada.
- El Fondo es una subasignación contable PAPER; la atribución de trades por
  estrategia/venue queda fuera de esta versión.
- Governance y confirmaciones versionadas se incorporan en Gate 4 sobre esta
  decisión Risk única.

### Resultado

`PASS`. Safety Kernel, Constitución, Unified Risk y Fondo PAPER operativos y
auditables.

## Gate 4 — Decision Contracts, Confirmations and Governance

### Objetivo

Normalizar intents y decisiones, hacer visible y no reutilizable la confirmación
humana y colocar Governance entre Risk y cualquier efecto PAPER.

### Implementación

- Contrato versionado `OpportunityIntent` con ventana temporal, provenance,
  evidence, feed/frescura y scores que aceptan `null`/`unknown` sin inventar
  porcentajes.
- Un evento confirmado no vuelve operable un intent: feed trusted, freshness,
  expiración y calidad de entrada conservan semántica independiente.
- Thinking puede conservar investigación degradada, pero Governance produce
  `operable=false` y `UNTRUSTED_MARKET_DATA`.
- `CommandDraft` se liga a sesión y fingerprint exacto del comando, expira y
  muestra acción, símbolo, posición, tamaño, entry/stop/target/exit, feed,
  expiración y consecuencia exclusivamente PAPER.
- `HumanConfirmation` se liga a `sessionId` y `draftId`, expira, compara el
  fingerprint del comando y sólo puede consumirse una vez. Un retry con la
  misma idempotency key recupera el efecto sin duplicarlo; otra key se rechaza.
- Endpoints:
  `POST /api/decision/drafts`,
  `POST /api/decision/drafts/:id/confirm`,
  `GET /api/governance/policy`.
- `GovernanceEngine` consume Safety, Constitución, Risk, kill switch,
  feed/frescura, expiración, evidencia, autoridad y Fondo, con salidas
  `approve`, `reduce`, `delay`, `reject`, `veto`.
- Pipeline humano/assistant efectivo:
  `CommandDraft → visual confirmation → session-bound HumanConfirmation →
  Unified Risk → Governance → PAPER ledger`.
- `POST /api/paper/commands` rechaza comandos humanos sin draft/confirmación.
- La autonomía sólo sustituye la confirmación individual cuando presenta el
  claim vigente de la acción exacta, con sesión, claimId, nonce, expiración y
  argumentos coincidentes. Su idempotency key de ledger deriva de `actionId`.
- El cliente PAPER usa un diálogo visible y no posee una ruta privilegiada.

### Archivos

- Creados:
  `lib/decision-contracts/contracts.js`,
  `lib/governance/contracts.js`,
  `lib/governance/engine.js`,
  `lib/governance/confirmations.js`,
  `tests-decision-governance.js`.
- Modificados:
  `server.js`, `lib/runtime-security/contracts.js`,
  `assets/js/paper-portfolio-client.js`, `assets/js/apex-7-runtime.js`,
  `assets/js/app.js`, `package.json`, `tests-smoke.js`.

### Pruebas

- 32 aserciones de contratos/Governance: scores desconocidos, provenance,
  operabilidad y expiración, feed degradado, draft disclosure, confirmación
  ausente/ajena/expirada/reutilizada, mismatch de comando, retry idempotente,
  live veto, Risk reduce, Thinking no operable y autonomía sin fondo.
- Smoke confirma que command API rechaza mutación sin confirmación.
- `npm.cmd test`: 9/9 suites OK, exit 0, duración 26.790 ms.

### Riesgos y deuda

- Drafts y confirmaciones son efímeros y rotan al reiniciar, igual que la sesión;
  los eventos relevantes se reflejan en auditoría del runtime.
- La UI usa un diálogo nativo deliberadamente simple; Gate 6 lo integrará en la
  consola persistente de voz/texto sin cambiar contratos.

### Resultado

`PASS`. Contratos, confirmación y Governance impiden autoridad paralela.

## Gate 5 — Cognitive Improvement Framework

### Objetivo

Permitir que APEX detecte problemas, conserve evidencia y evalúe propuestas de
mejora sin adquirir capacidad de autoaprobar, autoaplicar, desplegar ni modificar
reglas activas.

### Implementación

- Contrato versionado `ImprovementProposal` con todos los campos requeridos,
  evidencia y métricas obligatorias, `requiresHumanApproval=true` forzado por
  construcción y siete estados explícitos; `AUTO_DEPLOYED` no existe.
- Registry NDJSON append-only con `fsync`, fingerprint de duplicados y cadena
  SHA-256 enlazada. El replay valida cada checksum y aborta ante alteraciones.
- Los registros se clonan y congelan recursivamente antes de incorporarse a la
  memoria: mutar el objeto de entrada después del append no cambia la auditoría.
- Policy de auditoría bloquea autoaprobación, autoaplicación, despliegue,
  borrado de evidencia y propuestas que intenten modificar Safety Kernel,
  Constitución activa, workflows, deployment o permisos.
- El evaluator sólo puede terminar en `EVALUATED` o `REJECTED`; resultados y
  evidencia trazable son obligatorios y nunca producen aprobación automática.
- Transiciones a desarrollo, implementación externa y auditoría requieren actor
  `human_operator`; implementación continúa siendo externa al runtime.
- APIs protegidas:
  `POST /api/improvements`,
  `POST /api/improvements/:id/evaluate`,
  `POST /api/improvements/:id/status`;
  queries:
  `GET /api/improvements`,
  `GET /api/decision-journal`.
- Decision Journal mínimo append-only registra contexto, evidencia, intent,
  Risk, Governance, decisión, latencia, resultado y errores de interpretación,
  timing o ejecución, también con cadena SHA-256.
- El command pipeline PAPER escribe decisiones bloqueadas, completadas y errores
  de ejecución en el Journal. No se implementó Replay Lab.

### Archivos

- Creados:
  `lib/cognitive-improvement/{contracts,audit-policy,evaluator,proposal-registry}.js`,
  `lib/decision-journal/store.js`,
  `tests-cognitive-improvement.js`.
- Modificados:
  `server.js`, `lib/runtime-security/contracts.js`, `package.json`,
  `tests-smoke.js`, `.gitignore`,
  `docs/APEX_7_1_IMPLEMENTATION_LOG.md`.

### Pruebas

- Cognición: 40 aserciones sobre evidencia, estados, ausencia de
  `AUTO_DEPLOYED`, aprobación/aplicación por modelo, Safety Kernel,
  Constitución, pérdida de trazabilidad, duplicados, transiciones humanas,
  borrado de evidencia, persistencia, inmutabilidad y tampering de ambas cadenas.
- Smoke: queries del registry/journal y rechazo API de propuesta incompleta.
- `npm.cmd test`: 10/10 suites OK, exit 0, duración 31.212 ms.

### Riesgos y deuda

- El framework conserva y evalúa propuestas, pero deliberadamente no contiene
  ningún executor, merge, deployment ni editor de código activo.
- El journal cubre el pipeline PAPER después de autorizar draft/claim. Los
  rechazos anteriores por sesión o confirmación se conservan en la auditoría de
  runtime, no se duplican en este journal decisional.
- La UI dedicada para explorar propuestas queda como consumidor futuro; las APIs
  y contratos auditables están disponibles en esta versión.

### Resultado

`PASS`. APEX puede proponer y evaluar con trazabilidad, pero no puede autorizarse
ni aplicar sus propios cambios.
