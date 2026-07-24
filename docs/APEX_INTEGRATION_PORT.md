# Integration Port

## Objetivo

Separar el cerebro de APEX de cualquier broker, wallet, fuente de datos o proveedor de IA. Un conector futuro se registra como adapter y expone capacidades explícitas; nunca obtiene acceso directo al Core.

## Capas obligatorias

```text
APEX Cognitive Runtime
        │
Governance Gateway
        │
Risk Gateway
        │
Execution Intent
        │
Adapter Contract
        │
External Provider
        │
Reconciliation + Audit
```

## Manifest

Cada adapter debe declarar:

- identidad y versión;
- clase: market data, broker, wallet, intelligence, notification;
- capacidades;
- modos soportados;
- autenticación requerida;
- límites;
- health check;
- idempotency support;
- reconciliación;
- estado de seguridad.

El schema está en `adapters/adapter-manifest.schema.json`.

## Estado actual

| Adapter | Estado | Autoridad |
|---|---|---|
| Binance Public Market Data | Enabled | lectura pública |
| OpenAI Responses | Configurable | inteligencia server-side |
| OpenAI Realtime | Beta | voz server-proxied |
| Browser Notifications | Ready | local |
| MetaTrader 5 | Deferred | bloqueado |
| Interactive Brokers | Deferred | bloqueado |
| Phantom Wallet | Deferred | bloqueado |

## Requisitos antes de habilitar cuentas externas

- base de datos transaccional;
- secret vault;
- autenticación fuerte del operador;
- idempotency keys;
- reconciliación de fills;
- circuit breakers;
- límites por cuenta y adapter;
- pruebas de caos y desconexión;
- auditoría independiente;
- rollback y recovery;
- sandbox del proveedor;
- aprobación humana explícita para cambiar de PAPER a LIVE.
