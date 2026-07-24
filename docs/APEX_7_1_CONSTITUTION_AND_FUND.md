# APEX 7.1 — Constitution and Autonomous PAPER Fund

## Safety antes que Constitución

La Constitución no es el techo técnico final. `Safety Kernel` fija primero las
prohibiciones no relajables; una Constitución válida sólo puede añadir
restricciones.

## Constitución Patrimonial

Fuente versionada:

`config/patrimonial-constitution.v1.json`

Contiene:

- identidad, versión, estado y fechas;
- versión anterior y `contentHash`;
- objetivo y etapa;
- límites no negociables;
- policy de autonomía y perfiles Risk;
- drawdown, consolidación, transiciones de etapa y vetos;
- prohibiciones y change control.

Etapas modeladas:

- `CAPITAL_BUILDING`
- `EXPANSION`
- `PRESERVATION`
- `PATRIMONIAL_ALLOCATION`

Las transiciones no se automatizan. Requieren propuesta, decisión humana
explícita y una nueva versión auditable.

## Registro activo y cambio

En el primer arranque, `ConstitutionRegistry` valida schema y hash y registra
versión+hash en `data/apex-active-constitution.json`.

En arranques posteriores:

- la misma versión+hash es aceptada;
- editar el JSON o recalcular su hash sin proceso de cambio produce
  `SILENT_CONSTITUTION_CHANGE_BLOCKED`;
- el runtime no activa silenciosamente una Constitución nueva.

Un cambio legítimo debe:

1. crear una versión nueva;
2. mantener Safety Kernel;
3. documentar `previousVersion`;
4. recalcular `contentHash`;
5. recibir aprobación humana;
6. desplegarse externamente como release auditable.

## Fondo Autónomo PAPER

Tipos contables:

- `PATRIMONY_RESERVE`
- `AUTONOMOUS_GROWTH_POOL`
- `PROFIT_CONSOLIDATION_POOL`

Estados:

- `DRAFT`
- `AUTHORIZED`
- `ACTIVE`
- `RESTRICTED`
- `FROZEN`
- `CLOSED`

## Regla del 5%

El 5% es un máximo de contribución externa inicial calculado una sola vez:

```text
initialAutonomousContribution =
  capitalReferenceAmount × autonomousAllocationPct
```

con `autonomousAllocationPct <= 0.05`.

`capitalReferenceId`, monto y fecha quedan congelados. El crecimiento posterior
del patrimonio no aumenta el aporte; una pérdida no activa top-up.

## Composición y consolidación

- Ganancias retenidas pueden componer dentro del Growth Pool PAPER.
- Consolidar reduce cash/NAV/retained profit del Growth Pool y aumenta
  `consolidatedProfit`.
- Lo consolidado no vuelve automáticamente.
- No existe obligación contra el patrimonio principal.
- Recapitalizar se rechaza: requiere nueva Constitución y aprobación humana
  externa.
- Drawdown y porcentaje de consolidación no se inventan; permanecen sin umbral
  automático hasta una definición humana versionada.

## Límites separados

La implementación distingue:

- aporte inicial;
- Risk por operación;
- gross/net exposure;
- leverage;
- concentración;
- estrategia/venue;
- drawdown.

Un 5% de aporte no equivale a 5% de riesgo, exposición o pérdida tolerada.

## API

- `GET /api/constitution`
- `GET /api/fund`
- `POST /api/fund/commands`

Los commands del Fondo requieren sesión, idempotencia, autoridad
`human_operator` y respetan kill switch/Safety.

## Recuperación

La autorización y cambios del Fondo son eventos del ledger PAPER. Restaurar el
Fondo implica restaurar el ledger completo; nunca copiar sólo un snapshot o
editar campos del estado derivado.
