# APEX Market Data Gateway

## Alcance

Gateway local de solo lectura para BTCUSDT, ETHUSDT y SOLUSDT. Centraliza el histórico REST de 15 minutos y el stream público de Binance, normaliza los datos y publica un contrato estable para el cockpit.

No contiene clientes de broker, wallets, credenciales financieras ni rutas de ejecución real. Todos sus payloads declaran `PAPER_ONLY` y los locks externos permanecen en `false`.

## Flujo

```text
Binance REST + WebSocket públicos
              |
              v
   MarketDataGateway local
   - validación OHLCV
   - orden, duplicados y huecos
   - timestamps, latencia y antigüedad
   - caché local no confiable al restaurar
   - backoff y recuperación de histórico
              |
              v
 /api/market/status
 /api/market/snapshot
 /api/market/history?symbol=BTCUSDT
              |
              v
 Cockpit -> Thinking / Risk / Governance / Event Bus
```

El navegador consulta el gateway local como fuente primaria. El WebSocket directo anterior se conserva como fallback: permite observar precios durante una caída del gateway, pero se clasifica como `degraded` y no autoriza decisiones ni operaciones PAPER.

## Contrato

Versión: `1.0.0`.

Cada ticker normalizado incluye:

- `symbol`;
- `price`, `change`, `high`, `low`, `open`, `vol`;
- `bid`, `ask`, `spread`;
- `eventTime`, `ts`, `latencyMs`;
- `sequence`.

Cada vela incluye:

- `symbol`, `interval`;
- `openTime`, `closeTime`;
- `open`, `high`, `low`, `close`, `volume`.

La validación rechaza valores no finitos o no positivos, timestamps inválidos/futuros, rangos OHLC inconsistentes, spreads negativos, símbolos o intervalos ajenos al contrato. También registra desorden, duplicados y huecos.

## Estados de calidad

| Estado | Confiable | Conducta |
|---|---:|---|
| `healthy` | Sí | Thinking, Risk y Governance pueden consumir los datos. |
| `degraded` | No | Observación visible; acciones dependientes del precio bloqueadas. |
| `stale` | No | Último estado visible solo como antiguo; no operar. |
| `disconnected` | No | Sin fuente validada; no operar. |
| `recovering` | No | Reconexión/backfill en curso; no operar. |

Solo `healthy` con `trusted: true` supera la barrera común de calidad.

## Reconexión y caché

- Backoff controlado desde 500 ms hasta 30 s.
- Un único intento programado a la vez.
- Rotación entre tres endpoints públicos de stream.
- Refresco REST al reconectar para recuperar huecos.
- Refresco preventivo del histórico cada cinco minutos.
- Caché atómica en `data/apex-market-cache.json`.
- La caché restaurada siempre inicia como `stale` y `trusted: false`; nunca se presenta como mercado actual hasta recibir y validar datos nuevos.

## Observabilidad

El gateway publica calidad global y por símbolo, edad, latencia, secuencia, cantidad de velas e issues. Las transiciones se reflejan en Event Bus y runtime; los chequeos sin cambio de estado no generan telemetría repetitiva.

## Compatibilidad

No se agregó ninguna dependencia. El runtime actual validado usa Node.js 24. En versiones de Node sin `globalThis.WebSocket`, el gateway conserva REST/caché y se mantiene no confiable para operar; el fallback del navegador continúa visible. Elevar el requisito mínimo de Node o agregar una dependencia WebSocket debe evaluarse por separado.

## Seguridad

- Fuente Binance pública y read-only.
- Sin claves en frontend, caché o logs.
- Sin rutas de broker o wallet.
- Sin ejecución live.
- Kill switch y techo del 5% intactos.
- Feed no confiable fuerza `noop` antes de invocar un ciclo autónomo.

