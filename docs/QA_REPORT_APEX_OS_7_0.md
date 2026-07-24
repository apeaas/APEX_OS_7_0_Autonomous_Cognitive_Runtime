# QA Report — APEX OS 7.0

## Suite automatizada

- Node syntax check de servidor y módulos frontend.
- Frontend contract test.
- Server smoke test.
- Simulación de AI function calling.
- Runtime flow: modos, límites, planes, queue, claim/result, emergency stop y export.

## Controles adicionales

- JSON de configuración parseable.
- lock PAPER_ONLY.
- live trading y cuentas externas en false.
- techo humano = 5.
- launcher con Node >=18.
- diagnóstico local.
- manifest de adapters.

## Validación visual

La limitación histórica de navegación automatizada quedó superada en la validación del
2026-07-24 documentada más abajo: se abrió la aplicación real en el navegador integrado,
se ejercitaron los flujos críticos y se conservaron capturas del estado saludable y del
fail-safe.

## Resultado verificado

`npm test` completó correctamente:

- frontend contract: OK · 219 IDs estáticos;
- smoke test: OK;
- AI function-calling test: OK;
- autonomous runtime test: OK.

El health check local confirmó versión 7.0.0, modelo configurable, PAPER_ONLY, cuentas externas false, liveTrading false, 23 herramientas y siete entries en el Integration Registry. Esta release no fue probada contra brokers o wallets reales porque esas integraciones están bloqueadas.

## Validación local y Market Data Gateway — 2026-07-24

### Validación previa

- Inicio mediante `start_apex.bat` en Windows.
- Se corrigieron finales de línea CRLF de los launchers `.bat`; el contenido operativo no cambió.
- Interfaz real abierta en `http://127.0.0.1:5500`.
- Binance público entregó BTC, ETH y SOL con 120 velas de 15 minutos.
- EMA20, EMA50, RSI14, ATR14 y volumen relativo se actualizaron con datos reales.
- Thinking construyó un caso persistente y Governance ejecutó una auditoría conservadora.
- Se abrió, validó, ejecutó y cerró una posición exclusivamente PAPER.
- El fallback conversacional local respondió sin `OPENAI_API_KEY`.
- Planes, memoria, Event Bus, kill switch y reanudación en OBSERVE fueron verificados.

### Gateway implementado

- Fuente primaria local para REST + WebSocket públicos de Binance.
- Contrato `1.0.0`, validación OHLCV/timestamps/secuencia y calidad global/por símbolo.
- Estados `healthy`, `degraded`, `stale`, `disconnected` y `recovering`.
- Caché atómica restaurada siempre como no confiable.
- Backoff, prevención de reconexiones duplicadas y backfill REST al recuperar.
- Fallback WebSocket del navegador preservado como visible pero no confiable.
- Barrera compartida hacia Thinking, Risk, Governance y runtime autónomo.

### Prueba de falla real

Se detuvo deliberadamente el servidor local con la página abierta:

- el fallback directo continuó mostrando precios;
- la interfaz pasó a `DEGRADADO · SIN OPERAR`;
- la confianza quedó limitada;
- Risk bloqueó el ticket antes de la validación;
- no se abrió ninguna posición;
- al reiniciar con `start_apex.bat`, el gateway volvió a `LIVE · GATEWAY`.

### Evidencia visual

- `docs/QA_PRE_GATEWAY_2026-07-24.png`
- `docs/QA_GATEWAY_FAILSAFE_2026-07-24.png`
- `docs/QA_GATEWAY_HEALTHY_2026-07-24.png`

La pestaña final limpia no registró errores ni warnings de la aplicación. Durante la prueba previa, el navegador automatizado informó que no soporta `prompt()` al intentar crear un plan desde ese diálogo nativo; el endpoint y la persistencia del plan se verificaron por API. Se registra su reemplazo por formulario interno en el backlog, sin cambio visual en esta rama.

### Suite final

`npm test` incluye:

- sintaxis de servidor, gateway y frontend;
- contrato frontend: 219 IDs;
- pruebas deterministas del gateway;
- smoke test;
- AI function-calling;
- runtime autónomo.

Las pruebas del gateway cubren EMA20, EMA50, RSI14, ATR14, volumen relativo, orden, duplicados, huecos, OHLCV, stale/degraded, desconexión, backoff, reconexión, recuperación, caché, fallback, propagación de calidad y locks PAPER.

### Resultado de seguridad

- `executionMode = PAPER_ONLY`;
- `liveTrading = false`;
- `externalAccounts = false`;
- brokers, wallets, retiros y firmas permanecen bloqueados;
- techo humano máximo = 5%;
- kill switch operativo;
- ningún estado de feed no confiable puede iniciar un ciclo autónomo o ejecutar una acción PAPER basada en precios.

### Trazabilidad Git

La rama de trabajo es `feature/market-data-gateway`. Durante la sesión apareció el commit
`68d337a9798c4ab5da80b7df4338561362b61893` (`Gate 0.1 local runtime hardening`),
creado por la identidad Git `apeaas <matias.ags@hotmail.com>` y ya referenciado por
`origin/feature/market-data-gateway`. Codex no ejecutó ese commit ni un push. No se
alteró la historia ni el remoto; los ajustes de cierre enumerados por `git status`
permanecen locales y sin commit para revisión.

### Versión

No se incrementó la versión. Por alcance y compatibilidad, el cambio es candidato a `7.0.1` después de revisión y merge, no una nueva versión mayor.
