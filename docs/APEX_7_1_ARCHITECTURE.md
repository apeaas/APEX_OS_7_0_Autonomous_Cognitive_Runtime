# APEX 7.1 — Architecture

## Propósito y alcance

APEX 7.1 es un runtime constitucional local de decisión patrimonial. Observa,
razona, simula, explica, conversa y registra aprendizaje sin custodiar activos ni
ejercer ejecución financiera real. Trading es un motor PAPER, no la identidad
completa del producto.

Quantum Surfer, Event Intelligence completo, feeds sociales/on-chain live,
brokers, exchanges autenticados, wallets, firmas, depósitos, retiros,
transferencias y custodia están fuera de esta rama.

## Antes de 7.1

- `localStorage` era autoridad operativa del portfolio.
- El browser calculaba cash, equity y PnL.
- Risk estaba repartido entre manual, AI Command y autonomía.
- El lifecycle permitía resultados sin claim criptográfico.
- No existían Safety Kernel, registro constitucional por hash, Governance común,
  contratos de decisión ni mejora cognitiva auditada.
- El bridge Realtime era un control parcial, no una consola conversacional
  persistente.

## Arquitectura 7.1

```text
Browser / Voice Console
        |
        | sesión local + Origin/Host + idempotency
        v
MutableRequestGuard
        |
        +--> read models / queries
        |
        +--> CommandDraft --> HumanConfirmation
                              |
                              v
Safety Kernel --> Constitution --> Governance --> Unified Risk
                                                   |
                                                   v
                                           PAPER Commands
                                                   |
                                                   v
                                       append-only EventStore
                                                   |
                                      deterministic Projection
```

La jerarquía normativa es:

```text
Safety Kernel
→ Constitución Patrimonial
→ Governance
→ Unified Risk
→ confirmación humana cuando corresponda
→ efecto PAPER
```

Una capa inferior nunca puede relajar una superior.

## Módulos y responsabilidades

| Área | Módulos | Autoridad |
|---|---|---|
| Seguridad runtime | `lib/runtime-security/` | sesión, guards, rate limit, claims |
| Safety | `lib/safety-kernel/` | invariantes no configurables |
| Constitución | `lib/constitution/`, `config/patrimonial-constitution.v1.json` | versión, hash, etapa y límites |
| Ledger | `lib/paper-ledger/` | eventos PAPER append-only |
| Portfolio | `lib/portfolio/` | validación y proyección |
| Risk | `lib/risk/` | única decisión de riesgo |
| Governance | `lib/governance/` | veto, confirmaciones y operabilidad |
| Fondo | `lib/autonomous-fund/` | subasignación PAPER inicial fija |
| Contratos | `lib/decision-contracts/` | intents, drafts y decisiones |
| Cognición | `lib/cognitive-improvement/` | propuestas sin autoaplicación |
| Journal | `lib/decision-journal/` | decisiones y resultados |
| Voz | `lib/voice/`, `assets/js/voice/` | provider, sesión, policy, UI y auditoría |
| Mercado | `lib/market-data/` | gateway público read-only y calidad |

`server.js` conserva composición, routing, wiring e integración del runtime
heredado. Gate 7 extrajo el controller/configuración de voz a
`lib/voice/runtime.js`, reduciendo 88 líneas respecto del commit de Gate 6.
Desde la base, `server.js` pasó de 791 a 1.282 líneas
(`+621/-130`) y `assets/js/app.js` de 1.412 a 1.437 (`+108/-83`).
La modularización contiene toda lógica nueva crítica, aunque separar los
controllers HTTP restantes sigue siendo deuda explícita.

## Fuentes de estado

- Contabilidad PAPER: `data/apex-paper-ledger.ndjson`.
- Snapshot PAPER: acelerador descartable; nunca autoridad.
- Runtime/planes/cola: `data/apex-runtime-state.json`.
- Constitución activa: `data/apex-active-constitution.json`.
- ImprovementProposal y Decision Journal: NDJSON con checksum.
- Voice Audit: metadata NDJSON; nunca audio crudo.
- Browser: presentación, preferencias y backup heredado no operativo.

No existe una tercera contabilidad PAPER.

## API

Queries principales:

- `GET /api/health`
- `GET /api/runtime/state|actions|events`
- `GET /api/market/status|snapshot|history`
- `GET /api/portfolio|portfolio/events`
- `GET /api/constitution|risk/policy|governance/policy|fund`
- `GET /api/improvements|decision-journal`
- `GET /api/voice/health|voice/audit`

Mutaciones principales:

- Runtime: mode/config/cycle/emergency/actions/plans/export.
- Decisión: drafts y confirmación.
- PAPER: commands e importación.
- Risk/Fondo: evaluación y commands.
- Cognición: crear/evaluar/transicionar propuestas.
- Voz: sesión, llamada SDP, tools, interrupción y desconexión.

Toda ruta mutable está registrada en `lib/runtime-security/contracts.js`; una
ruta mutable desconocida se rechaza.

## Plataforma mínima

`package.json` declara Node `>=18`. El mínimo real es Node 18.0.0 por el uso de
`fetch`, `FormData`, `Blob`, Web Streams y APIs `node:` disponibles en esa línea.
La entrega se validó en Node v24.18.0; no se afirma que la suite haya sido
ejecutada en cada minor de Node 18.

## Documentos relacionados

- Seguridad: `APEX_7_1_SECURITY.md`
- Ledger/migración: `APEX_7_1_LEDGER_AND_MIGRATION.md`
- Constitución/Fondo: `APEX_7_1_CONSTITUTION_AND_FUND.md`
- Risk/Governance: `APEX_7_1_RISK_AND_GOVERNANCE.md`
- Cognición: `APEX_7_1_COGNITIVE_IMPROVEMENT.md`
- Voz: `APEX_7_1_VOICE_CONSOLE.md`
- QA: `APEX_7_1_QA_REPORT.md`
- Rollback: `APEX_7_1_ROLLBACK.md`
