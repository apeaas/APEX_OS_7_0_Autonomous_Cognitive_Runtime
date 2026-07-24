# APEX 7.1 — PAPER Ledger and Migration

## Autoridad canónica

El backend es la única fuente de cash, equity, PnL, posiciones, exposición,
fondos, high-water mark, drawdown, versión y último evento aplicado. El browser
consulta la proyección y envía comandos; no mantiene contabilidad paralela.

## Separación

- Commands: `lib/paper-ledger/commands.js`
- Events/integridad: `event-store.js`, `contracts.js`
- Projection/replay: `projector.js`, `lib/portfolio/projection.js`
- Queries: `queries.js`
- Snapshot: `snapshots.js`
- Migración: `migration.js`
- Validación: `lib/portfolio/validators.js`

## Eventos

Eventos implementados/reservados:

- `portfolio_initialized`
- `legacy_portfolio_imported`
- `paper_order_submitted`
- `paper_order_filled`
- `paper_position_modified`
- `paper_position_closed`
- `paper_cash_adjusted`
- `autonomous_fund_authorized`
- `autonomous_fund_activated`
- `profit_consolidated`
- `fund_restricted`
- `fund_frozen`

Cada evento contiene identidad, tipo, timestamps, aggregate, idempotency,
causation, correlation, sesión, actor, payload, policy/schema version y bloque
de integridad SHA-256 enlazado al checksum anterior.

## Garantías

- Append-only con `fsync`.
- Idempotency key única; retry recupera el efecto existente.
- Batch parcial duplicado se rechaza.
- Eventos validados e inmutables en memoria.
- Replay determinístico desde cero.
- Concurrencia optimista por `expectedVersion`.
- Doble cierre y doble PnL se rechazan.
- Snapshot atómico y descartable.
- Corrupción intermedia falla cerrada.
- Tail final truncado se copia a `.bak` y se recorta al último evento íntegro.

## Proyección

`GET /api/portfolio` devuelve:

- `cash`, `equity`;
- `realizedPnL`, `unrealizedPnL`;
- posiciones;
- exposición bruta, neta y por símbolo;
- fondos;
- `highWaterMark`, `drawdown`;
- `version`, `lastEventApplied`, `lastEventChecksum`;
- integridad y estado de migración.

Marks de mercado trusted son overlays read-only: no crean eventos ni otra
contabilidad.

## Migración desde localStorage

1. Abrí APEX 7.1 en el mismo origen/perfil de 7.0.
2. El cliente detecta `apex-portfolio`.
3. Revisá el resumen mostrado.
4. Confirmá la importación.
5. `POST /api/portfolio/import` valida estructura completa, límites y números.
6. El backend calcula fingerprint y registra `legacy_portfolio_imported`.
7. La respuesta incluye checksum y proyección.
8. El browser archiva un backup con `operational:false`.
9. Elimina la clave operativa heredada.
10. El backup nunca vuelve a leerse como autoridad.

Se rechazan importación parcial, no finitos, posiciones imposibles/duplicadas,
inconsistencias, repetición conflictiva y migración sobre un portfolio no vacío.

## Operación y backup

Antes de migrar:

```text
npm.cmd run backup
npm.cmd test
```

No edites ni trunques el NDJSON. Para inspeccionar:

```text
GET /api/portfolio
GET /api/portfolio/events?limit=100
```

Para restaurar, seguí `APEX_7_1_ROLLBACK.md`: detener el proceso, conservar el
data dir actual y restaurar una copia completa en otro directorio. Nunca mezcles
eventos de dos copias ni reemplaces sólo el snapshot.

## Límites

- Exclusión por proceso/event loop; dos procesos sobre el mismo directorio no
  están soportados.
- No hay base externa ni replicación.
- Unrealized PnL depende de marks trusted y no se persiste como verdad contable.
