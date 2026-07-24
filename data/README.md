# APEX Runtime Data

Esta carpeta es administrada por el backend local de APEX 7.1.

Archivos creados durante el uso:
- `apex-runtime-state.json`: modo, configuración, planes y cola autónoma.
- `apex-runtime-events.ndjson`: auditoría append-only del runtime.
- `apex-client-events.ndjson`: espejo de eventos relevantes del navegador.
- `apex-paper-ledger.ndjson`: autoridad contable PAPER append-only.
- `apex-paper-snapshot.json`: acelerador descartable; no reemplaza el ledger.
- `apex-active-constitution.json`: versión y hash de la Constitución activa.
- `apex-improvement-audit.ndjson`: registro de ImprovementProposal.
- `apex-decision-journal.ndjson`: decisiones Risk/Governance y resultados.
- `apex-voice-audit.ndjson`: metadata de voz sin audio crudo ni secretos.

No guardes claves aquí. Las credenciales viven exclusivamente en `.env`.
