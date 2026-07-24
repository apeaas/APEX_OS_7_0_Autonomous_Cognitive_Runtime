# QA Report — APEX OS Genesis 6.0

## Resultado

**APROBADO para prueba de usuario en notebook.**

## Viewports probados

### 1366 × 768
- Ancho del documento: 1366 px.
- Ancho del viewport: 1366 px.
- Desbordamiento horizontal: 0 px.
- Mercado: 377.1 px.
- Core: 273.7 px.
- Decisión: 273.7 px.
- Alertas: 249.4 px.
- Diferencia vertical entre motores: 0 px.
- Altura uniforme de motores: 82 px.

### 1440 × 900
- Ancho del documento: 1440 px.
- Ancho del viewport: 1440 px.
- Desbordamiento horizontal: 0 px.
- Mercado: 400.9 px.
- Core: 291.0 px.
- Decisión: 291.0 px.
- Alertas: 265.1 px.

## Pruebas funcionales

- `window.APEX_API` disponible: OK.
- Canvas 2D disponible: OK.
- Movimiento entre frames: OK.
- Abrir y cerrar Market Workspace: OK.
- Abrir Evidence Center durante sincronización: OK.
- Abrir ticket paper: OK.
- Chat rápido abre Operations: OK.
- Errores JavaScript en la batería final: 0.
- Fuente del chat: 16 px.
- Fuente del placeholder: 16 px.

## Observaciones

El cockpit requiere scroll vertical para acceder a la tercera fila en una ventana de 1366 × 768 con chrome de navegador visible. Esto es intencional: se priorizó legibilidad y equilibrio sobre comprimir todo en una sola pantalla.

Los datos reales dependen de disponibilidad de Binance y de las políticas de red del navegador. La ejecución sigue siendo PAPER ONLY.
