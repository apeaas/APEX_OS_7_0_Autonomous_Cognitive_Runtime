# QA Report — Quantum Architecture II

## Pruebas estáticas

- HTML sin IDs duplicados.
- Todos los IDs requeridos por `app.js` existen.
- `app.js` supera `node --check`.
- `adaptive-cockpit.js` supera `node --check`.

## Pruebas visuales

Viewports revisados:

- 1440 × 1100;
- 1366 × 768.

Resultados:

- sin scroll horizontal;
- drawer completamente fuera de pantalla cuando está cerrado;
- Governance sin texto rozando bordes;
- chat calculado en 17 px;
- placeholder calculado en 16 px;
- decisión principal cercana a 29 px en notebook;
- cuatro módulos conservan jerarquía visual;
- workspaces se abren de a uno.

## Pruebas funcionales locales

- navegación por módulos;
- cierre de workspace;
- apertura de Governance;
- apertura de Operaciones;
- disclosures;
- preguntas sugeridas;
- atajo `/`;
- sincronización de resumen;
- render de tres agentes y dos mensajes iniciales con almacenamiento disponible.

## Limitaciones del entorno de prueba

Las solicitudes externas se bloquearon durante las capturas automatizadas. El código de Binance permanece sin cambios y utiliza sus fallbacks ya existentes.
