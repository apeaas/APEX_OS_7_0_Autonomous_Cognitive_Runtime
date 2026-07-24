# APEX 7.1 — Unified Risk, Governance and Decision Contracts

## Un solo Risk Engine

`lib/risk/engine.js` implementa:

```text
evaluateIntent(intent, context) → RiskDecision
```

Manual, assistant, autonomía y el perfil reservado
`event_intelligence` recorren la misma policy `unified-risk.v1`.

`RiskDecision` contiene:

- `decision`: `approve | reduce | delay | reject`;
- riesgo y tamaño aprobados;
- razones, límites y warnings;
- versión de policy y Constitución;
- evidencia de feed/frescura;
- timestamp.

## Evaluaciones

El engine comprueba:

- Safety Kernel y PAPER_ONLY;
- kill switch y autoridad/claim;
- trusted feed y freshness por símbolo;
- cash, equity y tamaño;
- riesgo por trade y R/R;
- exposición, concentración y duplicados;
- drawdown y pérdida diaria;
- expiración y etapa;
- Fondo para perfil autónomo.

Cuando hay límites en conflicto, usa el menor. El frontend puede preestimar, pero
el backend decide.

## Datos degradados

Thinking puede conservar evidencia y generar investigación, pero:

```text
trusted=false → operable=false
reason=UNTRUSTED_MARKET_DATA
```

Un modelo, snapshot del browser o caché restaurada no puede elevar la confianza
del gateway. Confirmar un evento tampoco implica una entrada válida.

## OpportunityIntent

El contrato versionado preserva:

- ventana temporal y expiración;
- tesis, activo, símbolo, dirección y horizonte;
- scores que pueden ser `null` o `unknown`;
- feed quality/freshness;
- methodology, evidence y provenance;
- `operable`.

Un OpportunityIntent representa investigación, no una orden, y nunca ejecuta.

## CommandDraft y HumanConfirmation

Pipeline humano/assistant:

```text
CommandDraft
→ visual disclosure
→ HumanConfirmation session-bound
→ command exacto
→ Unified Risk
→ Governance
→ ledger PAPER
```

El draft muestra acción, símbolo/posición, tamaño, precios, feed, expiración y
consecuencia PAPER. Draft y confirmación:

- se ligan a `sessionId`;
- tienen fingerprint exacto del comando;
- expiran;
- son de un solo uso;
- sólo permiten retry con la misma idempotency key;
- rechazan sesión ajena o payload modificado.

## Governance

`GovernanceEngine` consume:

- Safety Kernel;
- Constitución;
- RiskDecision;
- autoridad y claim;
- kill switch;
- feed/frescura;
- expiración/evidencia;
- Fondo.

Salida:

`approve | reduce | delay | reject | veto`

con razones, versiones, timestamp, `operable` y confirmación requerida.

Governance no sustituye Risk. Puede endurecer o vetar; nunca elevar lo que Risk
aprobó.

## Autonomía

La autonomía sustituye una confirmación humana por operación sólo cuando existe
una acción previamente gobernada con claim vigente, sesión, claimId, nonce,
expiración y argumentos coincidentes. La idempotency key del ledger deriva del
`actionId`.

Sin Fondo `ACTIVE`, feed trusted o claim válido, no hay efecto.

## API

- `GET /api/risk/policy`
- `POST /api/risk/evaluate`
- `GET /api/governance/policy`
- `POST /api/decision/drafts`
- `POST /api/decision/drafts/:id/confirm`
- `POST /api/paper/commands`

No existe un endpoint de ejecución privilegiada para assistant o voz.
