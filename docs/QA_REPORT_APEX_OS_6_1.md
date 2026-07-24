# QA Report — APEX OS 6.1

## Banco principal
- Viewport: 1366 × 768.
- Navegador de prueba: Chromium headless.
- Modo: datos externos restringidos durante QA; ejecución paper.

## Resultados
- Aplicación inicializada: OK.
- `window.APEX_API`: OK.
- Event Bus disponible: OK.
- Memory workspace disponible: OK.
- Eventos persistidos y renderizados: OK.
- Creación de caso aumenta eventos y memoria: OK.
- Autoauditoría persiste un registro de Governance: OK.
- Checksums verificados: OK.
- Persistencia después de recarga: OK.
- Replay sin efectos secundarios: OK.
- Único botón lateral activo al abrir Memoria: OK.
- Desbordamiento horizontal en 1366 px: 0 px.
- Excepciones JavaScript durante la batería: 0.

## Capturas
- `APEX_OS_6_1_MISSION_1366.png`
- `APEX_OS_6_1_MEMORY_1366.png`

## Observación
El entorno de QA bloqueó resolución externa de Binance en algunas corridas. Esto fue tratado como una condición de feed y no generó errores de aplicación. En el entorno del usuario, el feed continúa usando los conectores ya existentes.
