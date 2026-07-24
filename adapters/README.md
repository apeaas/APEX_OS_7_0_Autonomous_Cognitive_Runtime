# APEX Adapter Port

Los conectores externos están deliberadamente deshabilitados en APEX OS 7.0. Esta carpeta define contratos para integraciones futuras sin acoplar el núcleo a un broker, wallet o proveedor.

Todo adapter deberá:
1. declarar capacidades y modo (`read_only`, `paper`, `live`);
2. exponer healthcheck;
3. validar idempotencia;
4. devolver estados de orden verificables;
5. emitir eventos auditables;
6. respetar Governance, Risk y el kill switch;
7. no almacenar secretos en el frontend.
