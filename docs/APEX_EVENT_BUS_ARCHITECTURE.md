# APEX OS 6.1 — Core Event Bus Architecture

## Objetivo
Convertir acciones aisladas de la interfaz en una secuencia persistente, correlacionable y auditable. APEX ya no solo muestra decisiones: conserva cómo llegó a ellas.

## Contrato de evento
Cada evento contiene:

- `id` y `sequence` monotónica.
- `type`, `category`, `source` y `severity`.
- `occurredAt` y `recordedAt`.
- `correlationId`, `caseId` y `symbol` cuando correspondan.
- `payload` estructurado.
- `checksum` FNV-1a calculado sobre el evento normalizado.
- marca `immutable: true`.

## Flujo principal

`Market / Research → Case Engine → Evidence → Prosecutor → Risk → Governance → Decision → Paper Execution → Outcome`

Los pasos relevantes emiten eventos. Los eventos alimentan simultáneamente:

1. la actividad visible;
2. el Diario de Conciencia;
3. la memoria persistente;
4. la auditoría de integridad;
5. el replay seguro.

## Eventos críticos implementados

- `CASE_CREATED`
- `EVIDENCE_REGISTERED`
- `PROSECUTOR_OBJECTION`
- `CASE_DECIDED`
- `AUTONOMY_ASSESSED`
- `GOVERNANCE_AUDIT_COMPLETED`
- `RISK_TICKET_APPROVED`
- `RISK_TICKET_REJECTED`
- `RISK_VETO`
- `PAPER_TRADE_OPENED`
- `PAPER_TRADE_CLOSED`
- `PAPER_PORTFOLIO_RESET`
- `DECISION_SYNTHESIZED`
- `DATA_FEED_STATUS_CHANGED`

## Persistencia actual
El prototipo utiliza `localStorage` para que el paquete siga siendo estático, portable y ejecutable sin servidor propio. Conserva hasta 1.800 eventos y 500 registros por dominio de memoria.

Esta es una base funcional, no el almacenamiento final de producción. Una fase futura podrá sustituir el adaptador por IndexedDB, SQLite o un event store remoto sin cambiar el contrato de eventos.

## Replay
El replay reconstruye los eventos vinculados por `correlationId`. No repite órdenes, no modifica el portfolio y no genera efectos secundarios. Su finalidad es explicar y auditar.

## Seguridad
- PAPER ONLY.
- Sin conexión a broker.
- Sin firma de wallet.
- Sin ejecución live.
- Risk y Governance conservan veto.
- Techo humano de autonomía: 5%.
