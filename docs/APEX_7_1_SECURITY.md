# APEX 7.1 — Security Model

## Invariantes no relajables

`lib/safety-kernel/invariants.js` fija:

- `PAPER_ONLY=true`;
- live, cuentas externas, broker execution, wallet signing, retiros,
  transferencias y custodia en `false`;
- Market Data Gateway read-only;
- feed trusted obligatorio para decisiones market-dependent;
- aporte autónomo inicial máximo de 5%;
- ningún modelo puede declarar trusted, elevar Risk, cambiar Constitución,
  desactivar kill switch, activar live o recapitalizar el Fondo;
- completar una acción requiere claim válido.

Ni JSON, prompts, modelos, tools, voz ni Constitución pueden ampliar estos
límites. La Constitución sólo puede restringirlos.

## Sesión local

- `GET /api/session/bootstrap` exige Host permitido y contexto same-origin.
- Genera `sessionId` y token aleatorio de 256 bits.
- Token y sesiones viven sólo en memoria y rotan en cada arranque.
- Expiran; no se guardan en `localStorage`, archivos o logs.
- El browser mantiene las credenciales en un closure y las añade únicamente a
  mutaciones same-origin.
- No es autenticación multiusuario ni autoriza exposición directa a Internet.

Variables de despliegue local:

- `APEX_ALLOWED_HOSTS`
- `APEX_ALLOWED_ORIGINS`
- `APEX_SESSION_TTL_MS`
- `APEX_AI_RATE_LIMIT`

## Guard uniforme de mutaciones

Para `POST`, `PATCH`, `PUT` y `DELETE`, `MutableRequestGuard` aplica:

1. contrato de ruta registrado;
2. Host;
3. Origin obligatorio;
4. Content-Type;
5. tamaño declarado y límite durante streaming;
6. sesión y token;
7. `X-Idempotency-Key`;
8. rate limit por sesión+método+ruta;
9. kill switch;
10. schema del payload antes del handler.

Una ruta mutable no registrada devuelve `MUTABLE_ROUTE_NOT_ALLOWED`.

## Lifecycle y claims

Única transición normal:

```text
queued → claimed → completed | failed | cancelled
```

Cada claim incluye `actionId`, `claimId`, `sessionId`, `claimant`, `attempt`,
`claimedAt`, `expiresAt` y nonce criptográfico de un solo uso.

Se bloquean:

- `queued → completed`;
- fallo externo sin claim;
- segundo efecto sobre `completed`;
- `cancelled → completed`;
- completar desde una sesión distinta;
- claim expirado, reutilizado o con argumentos diferentes.

## Kill switch

El kill switch:

- impide nuevas acciones y claims;
- bloquea mutaciones PAPER y drafts;
- cancela/frena trabajo no ejecutado;
- preserva sólo administración segura registrada;
- registra causa y timestamp.

Las rutas de tool/interrupción/desconexión de voz pueden entrar durante una
emergencia para permitir lectura/cierre; la policy interna veta todo draft.

## API OpenAI y voz

- `OPENAI_API_KEY` se lee sólo en backend.
- El browser envía SDP a una ruta local; el backend autentica la llamada OpenAI.
- No se devuelven tokens OpenAI ni headers `Authorization`.
- `OpenAI-Safety-Identifier` deriva de un hash de la sesión local.
- Tool policy por allowlist; default deny.
- No existe `/api/voice/execute`.
- Toda mutación de voz vuelve a las APIs normales con confirmación, Risk y
  Governance.
- Voice Audit redacta claves cuyos nombres indiquen API key, Authorization,
  token, secret, SDP, raw audio o audio bytes.
- `rawAudioStored=false` forma parte de health, sesión y auditoría.

## Persistencia e integridad

- Ledger, cognición, journal y voz usan cadenas SHA-256.
- El ledger usa `fsync` y detecta corrupción; sólo una cola final truncada tiene
  recuperación acotada con backup.
- Snapshots son descartables y se validan por checksum.
- La Constitución activa se fija por versión+hash; un cambio silencioso aborta.
- `.env` y `data/` no se sirven como archivos estáticos.

## Datos de mercado

Sólo `healthy + trusted + symbol fresh` habilita operabilidad. Caché restaurada,
fallback del browser, feed degraded/stale/disconnected/recovering y cualquier
afirmación del modelo permanecen untrusted. Thinking puede investigar, pero debe
producir `operable=false`.

## Amenazas cubiertas

- CSRF/local network drive-by contra mutaciones.
- Host header inesperado.
- replay de resultados, claims y comandos.
- payloads excesivos o tipos incorrectos.
- doble contabilidad y PnL duplicado.
- escalada de autoridad por prompt/tool/voz.
- exposición accidental de API key al frontend.
- corrupción/tampering de registros.

## Límites conocidos

- El proceso es local y single-user; no sustituye TLS, IAM o aislamiento de un
  servicio multiusuario.
- Dos procesos no deben compartir el mismo `APEX_DATA_DIR`.
- No se hizo pentest externo ni validación de llamada OpenAI real sin clave.
- La auditoría local debe protegerse mediante permisos y backups del sistema.
