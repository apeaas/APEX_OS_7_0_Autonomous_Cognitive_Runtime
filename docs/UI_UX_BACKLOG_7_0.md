# Backlog UI/UX priorizado — APEX OS 7.0

Observaciones de la validación real del 24 de julio de 2026. Esta rama no implementa cambios visuales.

## P0 — Seguridad y comprensión inmediata

1. Hacer que el detalle de calidad del feed sea desplegable desde el estado existente: fuente, edad, latencia, última vela, huecos e issues.
2. Reforzar semánticamente la diferencia entre `LIVE MARKET DATA` y `PAPER EXECUTION`; usuarios nuevos pueden interpretar “LIVE” como capital real.
3. Mantener el kill switch visible al desplazarse por workspaces profundos y mostrar con igual jerarquía el protocolo de reanudación.
4. Corregir la unión visual de título y mensaje en tickets bloqueados (`OPERACIÓN BLOQUEADA` + detalle).

## P1 — Jerarquía operativa

1. Reducir la competencia visual entre Runtime, motores, APEX Core, decisión, alertas y portfolio en el primer viewport.
2. Mostrar el estado de confianza de Thinking/Risk/Governance junto al estado del feed, evitando que “Normal” parezca autorización operativa durante degradación.
3. Estabilizar la telemetría visual de Governance; estados animados como `0/3` pueden parecer una pérdida real de agentes aunque sean presentación transitoria.
4. Mejorar la visibilidad del chat integrado: hoy queda por debajo de módulos de mayor altura y puede pasar inadvertido.
5. Proveer un control manual gobernado para modificar stop/target PAPER; la capacidad existe por AI Command, pero no tiene ruta manual visible.
6. Reemplazar diálogos nativos `prompt()` del alta de planes por un formulario interno accesible y auditable.

## P2 — Densidad, navegación y legibilidad

1. Revisar el corte vertical en 1366×768: varios paneles críticos quedan apenas fuera del primer viewport.
2. Reducir truncamientos en tarjetas de motores y presupuesto autónomo.
3. Unificar los estados activos de navegación cuando varios accesos abren el mismo workspace.
4. Mejorar contraste y tamaño de metadatos secundarios sin aumentar la densidad general.
5. Evitar duplicaciones de barras sticky en capturas full-page y exportaciones visuales.
6. Incorporar una vista compacta de conversación + acción pendiente + confirmación humana.

