# APEX OS Genesis — Arquitectura de presentación

## Objetivo

Recomponer Mission Control sin modificar el núcleo lógico logrado en Data Foundation, Thinking Architecture, Governance Foundation y Quantum Rebirth.

## Capas preservadas

- Binance REST y WebSocket.
- EMA, RSI, ATR y volumen relativo.
- Strategy Engine.
- Paper Portfolio y ticket de ejecución.
- Case Engine.
- Prosecutor/Fiscal.
- Historian demostrativo.
- Governance Engine.
- Constitución v2.
- Autonomía máxima del 5%.

## Nueva capa

`genesis-god-mode.css` y `genesis-god-mode.js` forman una capa de presentación desacoplada.

- CSS recompone grilla, jerarquía, tipografía, instrumentación y responsive.
- JavaScript lee `window.APEX_API`; no altera decisiones, riesgo ni ejecución.
- El rack de motores reutiliza los estados ya producidos por `living-cockpit.js`.
- El Core conserva Canvas y fallback CSS.

## Distribución

### Rack superior
Hunter, Context, Risk, Strategy, Portfolio y Governance.

### Primera fila
Market Radar | APEX Core | Decisión | Alertas.

### Segunda fila
Estrategias | Posiciones | Portfolio.

### Tercera fila
Comité | Actividad | Agentes | Chat.

### Workspaces profundos
Market, Thinking, Governance y Operations permanecen cerrados hasta que el usuario los solicita.

## Correcciones técnicas

- Se neutralizó el posicionamiento orbital heredado de los motores para alinearlos en el rack.
- Se eliminó un `MutationObserver` autorreferencial potencial en Genesis.
- `openEvidence()` ahora tolera la ventana de sincronización inicial sin lanzar una excepción.
- Chat y placeholder se fijaron en 16 px.
- El Canvas se verificó comparando frames sucesivos.

## Frontera honesta

La capa visual comunica actividad real de software y datos cuando están disponibles. No implica que los agentes sean modelos autónomos completos ni que exista ejecución live. La ejecución continúa bloqueada en paper.
