# Security & Governance 7.0

## Principios

1. Preservación de capital antes que oportunidad.
2. La IA propone; la política determinística autoriza.
3. Toda acción debe ser explicable y auditable.
4. El silencio y el `noop` son decisiones válidas.
5. La autonomía es revocable.
6. El techo humano no es delegable.

## Hard locks

- ejecución PAPER;
- 5% máximo;
- sin live;
- sin cuentas externas;
- sin retiros;
- sin firmas;
- sin aumento de riesgo inicial;
- stop y target obligatorios;
- kill switch.

## Protocolos humanos

- `HABILITAR PAPER AUTO`: activa autonomía PAPER.
- `REANUDAR APEX`: sale de emergencia hacia Observe o Copilot.
- PAPER COMMAND: arma confirmaciones sensibles durante la sesión.

## Fallos seguros

APEX debe hacer `noop` o suspenderse cuando:

- el snapshot está vencido;
- falta precio o equity;
- hay error de feed;
- la pérdida diaria supera límite;
- el Event Bus presenta inconsistencias;
- Risk veta;
- Governance veta;
- el modelo no produce una herramienta válida;
- hay una acción en curso;
- existe emergencia.

## Datos y secretos

- `.env` no se sirve como archivo estático.
- las claves no llegan al navegador;
- los logs no deben almacenar la clave;
- los exports pueden contener información operativa y deben tratarse como privados;
- `backup_apex.bat` incluye `.env`: almacená esos respaldos de forma segura.
