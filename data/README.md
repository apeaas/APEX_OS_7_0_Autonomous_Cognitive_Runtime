# APEX Runtime Data

Esta carpeta es administrada por el backend local de APEX OS 7.0.

Archivos creados durante el uso:
- `apex-runtime-state.json`: modo, configuración, planes y cola autónoma.
- `apex-runtime-events.ndjson`: auditoría append-only del runtime.
- `apex-client-events.ndjson`: espejo de eventos relevantes del navegador.

No guardes claves aquí. Las credenciales viven exclusivamente en `.env`.
