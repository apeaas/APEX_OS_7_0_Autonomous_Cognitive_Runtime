# APEX 7.1 — Constitutional Cognitive Voice Runtime

APEX es un **runtime constitucional de decisión patrimonial** local: observa,
razona, simula, explica, conversa y aprende de resultados sin adquirir autoridad
financiera. El backend mantiene una única contabilidad PAPER, un único Risk
Engine y límites técnicos que prompts, modelos, voz o configuración no pueden
relajar.

## Inicio

```text
Windows: start_apex.bat
macOS/Linux: ./start_apex.sh
URL: http://127.0.0.1:5500
```

## Fronteras

- PAPER ONLY
- Live trading bloqueado
- Cuentas externas bloqueadas
- Techo autónomo humano: 5%
- Kill switch
- Risk y Governance con veto

Consultá `INSTRUCCIONES.txt` y `docs/APEX_OS_7_MASTER_SYNOPSIS.md`.

La documentación de la versión comienza en
`docs/APEX_7_1_ARCHITECTURE.md`. Quantum Surfer queda explícitamente fuera de
esta rama y se reserva para APEX 7.2.

## Market Data Gateway

El servidor local centraliza el feed público read-only de Binance, valida velas y tickers, publica calidad estructurada y conserva el stream directo anterior como fallback no confiable. Thinking, Risk, Governance y autonomía PAPER requieren estado `healthy`.

Detalles: `docs/MARKET_DATA_GATEWAY.md`.
