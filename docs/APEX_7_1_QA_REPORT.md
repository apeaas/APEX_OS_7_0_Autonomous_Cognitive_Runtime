# APEX 7.1 — QA Report

## Identificación

- Rama: `feature/constitutional-cognitive-voice-runtime`
- Base: `805d639690ebfce9922f5b6f347e9a67a9f7c42f`
- OS: Microsoft Windows 10.0.19045 x64
- Node validado: v24.18.0
- Node mínimo por APIs usadas: 18.0.0
- Ejecución: `PAPER_ONLY`
- Fecha: 2026-07-24

## Baseline

Antes de editar:

- `npm.cmd test`
- 5/5 suites
- exit 0
- duración 35.506 ms
- fallos preexistentes: ninguno
- `git fetch --prune origin` falló con `Empty reply from server`
- la copia local coincidía exactamente con la base esperada

## Commits auditables

| Gate | Commit | Resultado |
|---|---|---|
| 0 | `fb7a8c7` | PASS |
| 1 | `039173e` | PASS |
| 2 | `9c77191` | PASS |
| 3 | `3553ecb` | PASS |
| 4 | `96094bc` | PASS |
| 5 | `d3e32b0` | PASS |
| 6 | `b9ccfac` | PASS |
| 7 | commit final de esta rama | pendiente al cerrar QA |

## Suite

Comando:

```text
npm.cmd test
```

Suite completa final de Gate 7:

- 11/11 suites;
- exit 0;
- duración 36.715 ms;
- sin fallos.

Suites:

1. runtime security: 35 aserciones;
2. PAPER ledger: 32;
3. Constitution/Risk/Fund: 43;
4. decision/Governance: 32;
5. cognitive improvement/Journal: 40;
6. constitutional voice: 110;
7. frontend contract: 219 IDs estáticos;
8. Market Data Gateway;
9. smoke HTTP;
10. AI function-calling simulado;
11. autonomous runtime fail-safe.

Total explícito de aserciones de dominio: 292, más contrato frontend y suites
de integración que reportan resultado por escenario.

## Cobertura negativa destacada

Seguridad:

- token ausente/inválido/expirado;
- Origin/Host inválidos;
- PATCH protegido;
- payload/JSON/content type inválidos;
- rate limit e idempotency ausente;
- claim expirado/ajeno/reutilizado;
- transición/resultado duplicado;
- kill switch durante lifecycle.

Ledger:

- evento/idempotency duplicados;
- cierre/PnL doble;
- restart/replay;
- snapshot corrupto;
- tail truncado y checksum alterado;
- importación repetida/parcial/conflictiva;
- no finitos, posición imposible y conflicto de versión.

Constitución/Risk/Fondo:

- schema/hash/cambio silencioso;
- etapa/live/perfil que eleva Safety;
- feed untrusted y stale;
- cash/risk/duplicado/daily loss;
- Fondo >5%, base no congelada, top-up, consolidación, retorno automático,
  recapitalización y freeze.

Governance/Cognición:

- intent expirado/degradado;
- confirmación ausente/ajena/expirada/reutilizada/mismatch;
- autoaprobación/autoaplicación/deployment;
- evidencia/traceability/duplicados/tampering.

Voz:

- permiso denegado y dispositivo ausente;
- provider/key/WebRTC/conexión fallidos;
- expiración, doble conexión y sesión ajena;
- interrupción/cancelación;
- reconexión y límite;
- tool duplicada/prohibida;
- kill switch y mutación sin confirmación;
- transcript vacío y voz/texto;
- fallback mock/texto;
- no key/ruta privilegiada en browser;
- UI cargable sin voz.

## QA visual

Validación local en navegador integrado:

- panel persistente visible;
- provider `MOCK · sin audio real`;
- transición `DESHABILITADA → ESCUCHANDO`;
- consulta escrita del portfolio PAPER y respuesta visible;
- intento live bloqueado con `VOICE_TOOL_FORBIDDEN`;
- interrupción registrada y retorno a listening;
- desconexión y retorno a `DESHABILITADA`;
- sin errores nuevos de consola después de corregir el binding de timers.

## Performance local

Comando reproducible:

```text
npm.cmd run qa:metrics
```

Fixture:

- Market Data Gateway deshabilitado;
- OpenAI sin clave;
- 101 eventos de ledger;
- 30 iteraciones HTTP.

Resultados del 2026-07-24:

| Medida | Resultado |
|---|---:|
| Arranque hasta ready | 716,750 ms |
| RSS aproximado tras arranque | 51,148 MiB |
| Replay+proyección de 101 eventos | 14,575 ms |
| Query portfolio median / p95 | 10,682 / 12,994 ms |
| Risk API median / p95 | 16,182 / 18,990 ms |
| Conexión mock median / p95 | 18,764 / 23,541 ms |
| Reconnect determinístico backend | 0,058 ms |

Son mediciones locales, no garantías. Conexión y reconnect no representan red,
audio ni WebRTC OpenAI real.

## Tamaño de archivos centrales

Base → Gate 7:

- `server.js`: 791 → 1.282 líneas; diff `+621/-130`, net +491.
- `assets/js/app.js`: 1.412 → 1.437; diff `+108/-83`, net +25.
- Gate 7 extrajo voz y redujo `server.js` 88 líneas frente a Gate 6.

La lógica crítica nueva está en módulos. Separar controllers HTTP restantes de
`server.js` continúa como deuda, sin justificar una reescritura riesgosa en este
gate.

## Aceptación

- Seguridad/runtime: PASS
- Ledger/proyección/migración: PASS
- Safety/Constitución/Fondo: PASS
- Unified Risk/Governance/contratos: PASS
- Mejora cognitiva/Journal: PASS
- Voz mock/UI/tool policy: PASS
- OpenAI Realtime real: NO VALIDADO por ausencia de clave/cuenta
- Quantum Surfer: EXCLUIDO correctamente

## Riesgos y deuda

- Repetir fetch remoto cuando GitHub esté disponible.
- Ejecutar matrix CI en Node 18 y una versión LTS actual; sólo Node v24.18.0 fue
  ejecutado aquí.
- Validar OpenAI Realtime real, costo, audio, latencia y reconnect con una cuenta
  autorizada.
- No ejecutar dos procesos contra el mismo `APEX_DATA_DIR`.
- Proteger backups/data mediante permisos del sistema.
- Extraer controllers HTTP restantes si `server.js` vuelve a crecer.

## Veredicto

La arquitectura es revisable y todos los gates funcionales están en verde. La
voz real debe tratarse como integración no certificada hasta validarla con una
cuenta configurada; el fallback mock/texto sí está verificado.
