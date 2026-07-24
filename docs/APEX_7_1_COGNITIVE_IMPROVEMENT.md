# APEX 7.1 — Cognitive Improvement under Audit

## Objetivo

APEX puede detectar contradicciones, registrar errores, proponer mejoras,
diseñar evaluaciones, comparar métricas, sugerir patches y generar informes.
No puede otorgarse autoridad para aplicar esas propuestas.

## ImprovementProposal

Contrato `improvement-proposal.v1`:

- identidad, fecha y fuente;
- observación, problema e hipótesis;
- cambio propuesto y módulos afectados;
- beneficio esperado y riesgo;
- evidencia;
- plan de evaluación;
- baseline/candidate metrics;
- status;
- `requiresHumanApproval=true`.

Estados:

- `DRAFT`
- `READY_FOR_EVALUATION`
- `EVALUATED`
- `REJECTED`
- `APPROVED_FOR_DEVELOPMENT`
- `IMPLEMENTED_EXTERNALLY`
- `AUDITED`

`AUTO_DEPLOYED` no existe.

## Límites de autoridad

APEX no puede:

- editar código activo mediante este framework;
- cambiar Safety Kernel o Constitución;
- elevar permisos;
- autoaprobar;
- autoaplicar;
- hacer merge o desplegar;
- activar cambios;
- borrar evidencia.

La policy rechaza módulos protegidos como Safety, Constitución, workflows,
deployment y permisos. Las transiciones de aprobación/desarrollo,
implementación externa y auditoría requieren actor `human_operator`.

## Auditoría

`ProposalRegistry` guarda registros NDJSON append-only con:

- fingerprint para duplicados;
- cadena SHA-256;
- `fsync`;
- replay validado;
- snapshots clonados y congelados.

Una alteración rompe el arranque del registro con fallo de integridad. Evaluar
sólo produce `EVALUATED` o `REJECTED`; nunca aprobación automática.

## Decision Journal

El journal mínimo conserva:

- contexto y evidencia;
- intent;
- RiskDecision;
- GovernanceDecision;
- decisión;
- latencia;
- resultado;
- error de interpretación;
- error de timing;
- error de ejecución.

También usa NDJSON y checksum enlazado. No es Replay Lab completo.

## API

- `GET /api/improvements?includeAudit=1`
- `POST /api/improvements`
- `POST /api/improvements/:id/evaluate`
- `POST /api/improvements/:id/status`
- `GET /api/decision-journal`

Una propuesta creada desde voz sólo se registra tras click humano y queda en
`DRAFT`.

## Flujo recomendado

1. Registrar problema y evidencia.
2. Preparar baseline y plan.
3. Marcar ready mediante autoridad humana.
4. Ejecutar evaluación externa/reproducible.
5. Registrar resultados.
6. Decidir desarrollo fuera del runtime.
7. Implementar en una rama separada.
8. Auditar y registrar el resultado.

Este flujo no concede merge ni deployment automático.
