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

## Limitación de validación en este entorno

La navegación automatizada con navegador fue bloqueada por la política administrativa del entorno de construcción. Por ese motivo, esta release no incluye una nueva captura certificada por Playwright. La interfaz hereda el cockpit visual validado de Genesis/6.x y agrega componentes Runtime mediante CSS/JS; la revisión visual final debe hacerse en el notebook objetivo después de instalar.

## Resultado verificado

`npm test` completó correctamente:

- frontend contract: OK · 219 IDs estáticos;
- smoke test: OK;
- AI function-calling test: OK;
- autonomous runtime test: OK.

El health check local confirmó versión 7.0.0, modelo configurable, PAPER_ONLY, cuentas externas false, liveTrading false, 23 herramientas y siete entries en el Integration Registry. Esta release no fue probada contra brokers o wallets reales porque esas integraciones están bloqueadas.
