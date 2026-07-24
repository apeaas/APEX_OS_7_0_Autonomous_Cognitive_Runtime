# APEX OS 6.2 — AI Command Runtime

## Objetivo

APEX 6.2 reemplaza el chat local básico por una capa de inteligencia real capaz de comprender el estado completo de la plataforma y proponer acciones estructuradas sobre ella.

La arquitectura conserva cuatro fronteras:

1. **La IA interpreta.**
2. **El Tool Registry traduce intención a una acción tipada.**
3. **Risk y Governance validan.**
4. **El cliente local ejecuta únicamente en PAPER.**

La IA nunca modifica el estado mediante texto libre ni llama a un broker.

## Flujo

```text
Texto o voz del operador
        ↓
APEX AI Commander
        ↓
Backend local seguro
        ↓
OpenAI Responses API + Function Calling
        ↓
Plan de acciones tipadas
        ↓
Policy Gate
        ├── lectura / navegación → ejecución local inmediata
        └── capital / agentes / governance → confirmación humana
                                                ↓
                                     APEX deterministic tools
                                                ↓
                                      Event Bus + Memory
```

## Runtime local

`server.js` cumple dos funciones:

- sirve los archivos de APEX desde `127.0.0.1`;
- mantiene `OPENAI_API_KEY` fuera del navegador y procesa `/api/assistant`.

No utiliza dependencias npm. Requiere Node.js 18 o superior.

## Snapshot

El navegador envía un snapshot reducido y explícito:

- precios, cambios e indicadores;
- decisión y estrategias;
- portfolio paper y posiciones;
- agentes;
- watchlist;
- governance;
- memoria reciente.

No se envían sockets, objetos DOM, claves ni archivos locales.

## Tool Registry

### Ejecución inmediata de bajo riesgo

- navegar entre módulos;
- enfocar un activo;
- actualizar una lectura;
- abrir evidencia;
- construir un caso;
- preparar un ticket paper;
- modificar watchlist;
- exportar memoria.

### Confirmación obligatoria

- ejecutar una orden paper;
- cerrar total o parcialmente una posición paper;
- modificar stop o target;
- pausar o reactivar agentes;
- ejecutar una autoauditoría.

## Modelo de confirmación

Una propuesta sensible queda en `pendingActions`.

Para ejecutarla deben cumplirse dos condiciones:

1. `PAPER COMMAND` debe estar armado durante esa sesión.
2. El usuario debe pulsar **Confirmar** o decir **“confirmo”**.

La confirmación no elimina las validaciones determinísticas:

- capital disponible;
- estructura válida entrada/stop/target;
- riesgo máximo de 2% del equity por operación;
- modo PAPER;
- veto de Risk y Governance.

## Voz

La versión 6.2 utiliza:

- dictado push-to-talk del navegador (`SpeechRecognition` / `webkitSpeechRecognition`);
- síntesis de voz local (`speechSynthesis`).

La voz es una interfaz de comando. El razonamiento y function calling pasan por el backend de IA.

No es todavía una sesión full-duplex de OpenAI Realtime. Esa capa puede agregarse sin cambiar el Tool Registry.

## Límites constitucionales

- PAPER ONLY.
- Cuentas externas diferidas.
- Autonomía humana máxima: 5%.
- La IA no puede elevar ese techo.
- Sin retiros, transferencias, firmas de wallet ni live orders.
- Toda acción queda registrada en Event Bus.
