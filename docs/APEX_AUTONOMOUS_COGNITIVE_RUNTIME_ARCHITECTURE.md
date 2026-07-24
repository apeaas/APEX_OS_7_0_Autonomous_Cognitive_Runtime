# Autonomous Cognitive Runtime — Architecture

## Flujo principal

```text
Market + Portfolio + Event Bus + Memory
                  │
                  ▼
          Context Snapshot
                  │
                  ▼
        OpenAI Responses Runtime
          │                   │
          │ tool calls        │ explanation
          ▼                   ▼
  Governance Policy      Command Dialogue
          │
          ▼
  Deterministic Risk Gateway
          │
          ▼
    Persistent Action Queue
          │
          ▼
 Browser PAPER Executor
          │
          ▼
 Result + Event Bus + NDJSON Audit
```

## Componentes

### `server.js`

Servidor local sin dependencias externas. Sirve el frontend, protege la clave, administra modos, planes, queue, ciclos autónomos, persistencia, exportaciones y puente de voz.

### `assets/js/apex-7-runtime.js`

Integra el runtime con el cockpit. Sincroniza snapshots, renderiza telemetría, procesa la cola, ejecuta acciones contra `APEX_API`, reporta resultados y ofrece protocolos de activación/emergencia.

### `assets/js/apex-ai-command.js`

Convierte respuestas con tool calls en acciones de plataforma. Aplica confirmaciones en Copilot y delega las herramientas de runtime al módulo 7.0.

### `assets/js/apex-event-bus.js`

Mantiene identidad, correlación y memoria de eventos del frontend. Un espejo de eventos seleccionados llega al backend para auditoría durable.

### `config/`

- `apex_autonomy.json`: defaults y hard locks.
- `apex_permissions.json`: roles y confirmaciones.
- `apex_integrations.json`: registry y estado de adapters.
- `apex_ai_runtime.json`: contrato de IA y voz.
- `apex_governance.json`: Constitución operativa existente.

### `data/`

- `apex-runtime-state.json`: estado durable.
- `apex-runtime-events.ndjson`: auditoría backend append-only.
- `apex-client-events.ndjson`: eventos recibidos del cockpit.

## Scheduler autónomo

El scheduler solo corre cuando:

- modo = `paper_autonomous`;
- kill switch = false;
- existe API key;
- el snapshot es reciente;
- no hay otro ciclo en curso;
- se respeta cooldown;
- la política permite la acción.

Cada ciclo obliga al modelo a elegir como máximo una de estas salidas:

- no hacer nada;
- abrir una posición PAPER;
- cerrar una posición PAPER;
- modificar protección;
- solicitar autoauditoría.

## Política determinística

El modelo propone; el gateway decide si la propuesta es admisible. Entre otros controles:

- activo en allowlist;
- capital dentro del presupuesto autónomo;
- tamaño máximo por posición;
- exposición total;
- cantidad de posiciones;
- confianza mínima;
- R/R mínimo;
- pérdida diaria;
- stop y target válidos;
- prohibición de aumentar riesgo;
- snapshot fresco;
- estado de emergencia.

## Idempotencia y queue

Las acciones poseen ID y estados `queued`, `claimed`, `executed`, `failed` o `cancelled`. El cliente reclama antes de ejecutar y reporta resultado. El replay de memoria no vuelve a ejecutar órdenes.

## Seguridad local

- bind en `127.0.0.1`;
- CORS/origin local validado;
- clave solo en `.env` del backend;
- límite de tamaño de body;
- rate limit de IA;
- paths estáticos normalizados;
- adapters externos bloqueados;
- ejecución live inexistente.
