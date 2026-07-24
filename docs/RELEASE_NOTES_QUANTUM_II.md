# Release Notes — APEX Quantum Architecture II

## Adaptive Cockpit

### Nueva experiencia principal

- Mission Control inicia en modo síntesis.
- Cuatro módulos reactivos: Hunter, Thinking, Governance y Capital.
- Briefing proactivo generado desde el estado del sistema.
- Un solo workspace profundo abierto por vez.
- Cierre rápido para regresar al puente de mando.

### Progressive Disclosure

- Constitución cerrada por defecto.
- Comité de agentes cerrado por defecto.
- Historiador y deliberación bajo demanda.
- Estrategias y portfolio dentro de disclosures.
- Actividad técnica fuera de la vista principal.

### Legibilidad

- Chat: 17 px.
- Placeholder: 16 px.
- Campo de diálogo: 54 px de alto.
- Botones y estados ampliados.
- Padding reforzado en Governance.
- Protección de palabras largas y estados extensos.
- Sin desbordamiento horizontal en pruebas de 1366 px y 1440 px.

### Reactividad

- Sincronización de resúmenes mediante MutationObserver.
- Briefing adaptado a Setup válido, Observación o No Trade.
- Estado de Governance adaptado a habilitación, reducción o suspensión.
- Actualización de equity, exposición, P&L y caso activo.
- Toasts de interacción y accesos rápidos.

### Navegación

- Navegación reducida a cinco destinos.
- `/` abre el diálogo.
- `Esc` regresa a síntesis.
- Estados ARIA y foco visible.
- Compatibilidad con prefers-reduced-motion.

### Preservado

- Data Foundation.
- Binance REST/WebSocket.
- EMA, RSI, ATR y volumen.
- Paper execution.
- Case Engine.
- Prosecutor Agent.
- Historian demostrativo.
- Governance Engine.
- Constitución v2.
- Autonomía máxima del 5%.

### Fronteras honestas

- No existe ejecución live.
- El Historiador aún usa precedentes demostrativos.
- La autoauditoría actual no sustituye métricas deterministas reales.
- No hay conectores activos con MetaTrader, Phantom ni brokers de acciones.
