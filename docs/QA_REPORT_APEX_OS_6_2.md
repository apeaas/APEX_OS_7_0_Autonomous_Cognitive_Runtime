# QA Report — APEX OS 6.2

## Pruebas completadas

- `node --check` sobre backend y todos los módulos JavaScript.
- contrato frontend: 219 IDs únicos, assets presentes y 13 tools con handler local.
- validación de HTML y ausencia de IDs duplicados.
- verificación de existencia de todos los assets enlazados.
- health endpoint local.
- prueba end-to-end del loop de function calling con un servidor OpenAI compatible simulado: tool call → function output → respuesta final.
- validación de políticas de confirmación para herramientas de bajo riesgo y sensibles.
- static server para `index.html`, CSS y JavaScript.
- verificación de que `.env` y `server.js` no pueden descargarse desde el servidor estático.
- respuesta controlada `503 AI_RUNTIME_NOT_CONFIGURED` cuando no existe clave.
- comprobación de que no se incluyeron claves con formato de secreto.
- revisión del Tool Registry y de las políticas de confirmación.
- verificación de modo `PAPER_ONLY` y `externalAccounts: false`.

## Límite del entorno de QA

No se realizó una llamada facturable a OpenAI porque el paquete no contiene credenciales. La integración queda operativa al agregar una clave válida al `.env` local.

La captura visual automatizada no pudo completarse en el entorno de construcción debido a una política del navegador que bloquea localhost y `file://`; no se declara una validación visual automatizada falsa. La interfaz conserva el Design System de 6.1 y agrega estilos aislados en `ai-command.css`.
