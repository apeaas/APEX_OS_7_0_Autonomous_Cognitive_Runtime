# APEX OS 7.0 — Autonomous Cognitive Runtime

APEX es un **Sistema Operativo Patrimonial Cognitivo** local: cockpit, inteligencia de mercado, comité de agentes, gobierno, memoria y ejecución PAPER bajo una política autónoma limitada.

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

## Market Data Gateway

El servidor local centraliza el feed público read-only de Binance, valida velas y tickers, publica calidad estructurada y conserva el stream directo anterior como fallback no confiable. Thinking, Risk, Governance y autonomía PAPER requieren estado `healthy`.

Detalles: `docs/MARKET_DATA_GATEWAY.md`.
