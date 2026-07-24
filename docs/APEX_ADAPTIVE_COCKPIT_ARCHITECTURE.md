# APEX Quantum Architecture II — Adaptive Cockpit

## Propósito

El Adaptive Cockpit aplica una regla central:

> La información debe aparecer cuando se necesita, no antes.

Mission Control deja de exponer simultáneamente toda la profundidad del sistema. La pantalla principal funciona como puente de mando y responde rápidamente:

1. qué está ocurriendo;
2. qué recomienda APEX;
3. qué riesgo existe;
4. qué módulo requiere atención.

La profundidad permanece disponible en workspaces específicos.

## Capas de interfaz

### 1. Modo Síntesis

Visible al iniciar:

- briefing proactivo;
- APEX Core;
- decisión, confianza, riesgo y vigencia;
- Hunter;
- Thinking;
- Governance;
- Capital.

Los cuatro módulos resumen estado y ofrecen una única acción de entrada.

### 2. Deep Workspaces

- **Market Intelligence:** radar, estrategias y portfolio paper.
- **Thinking Architecture:** expediente, evidencia, Fiscal, Historiador y Comité.
- **Governance:** licencia, Trust Score, Constitución, agentes y Diario.
- **Operations & Dialogue:** conversación, agentes y actividad.

Solo un workspace puede permanecer abierto a la vez. Los demás continúan funcionando en segundo plano.

### 3. Progressive Disclosure

Se ocultan por defecto los elementos cuyo detalle no es necesario para decidir en tres segundos:

- Constitución completa;
- matriz de agentes;
- Historiador;
- deliberación completa;
- portfolio detallado;
- actividad técnica.

Los estados esenciales permanecen visibles en sus resúmenes.

## Reactividad

Los resúmenes del Cockpit reflejan las salidas existentes de APEX:

- mejor estrategia y cantidad de casos relevantes;
- caso activo y consenso;
- veredicto del Fiscal;
- autonomía y Trust Score;
- equity, exposición y P&L;
- estado general del sistema.

La actualización utiliza observadores del DOM y sincronización periódica. No duplica el motor analítico ni altera sus reglas.

## Diálogo

La entrada de APEX se rediseñó como puerta principal al sistema:

- tipografía de 17 px;
- placeholder de 16 px;
- altura mínima de 54 px;
- tres preguntas sugeridas;
- atajo de teclado `/`;
- foco visible y navegación accesible.

## Gobierno preservado

- techo humano de autonomía: 5% del capital;
- APEX puede reducir o suspender su licencia;
- APEX no puede elevar el techo humano;
- Risk y Governance conservan veto;
- ejecución real permanece bloqueada;
- toda operación continúa siendo paper.

## Decisiones de simplificación

El panel System Pulse independiente fue absorbido por los cuatro módulos de resumen. La información no se eliminó: capital, exposición, mercado y riesgo siguen alimentando el Cockpit.

La Constitución y el Comité dejaron de ocupar espacio permanente. Su estado se muestra y el contenido completo se abre bajo demanda.

## Próxima arquitectura

El siguiente salto técnico debe ser el Core Event Bus:

- eventos inmutables;
- IDs de caso y correlación;
- votos y vetos formales;
- reconstrucción de decisiones;
- memoria histórica persistente;
- auditoría determinista del Trust Score.
