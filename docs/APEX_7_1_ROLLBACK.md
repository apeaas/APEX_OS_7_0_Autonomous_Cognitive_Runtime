# APEX 7.1 — Rollback

## Principios

- No hacer `reset --hard`.
- No reescribir historia ni usar force push.
- No borrar ledger o evidencia.
- Detener APEX antes de copiar/restaurar `data/`.
- Nunca mezclar dos data dirs.
- El snapshot PAPER no es autoridad; el ledger debe restaurarse completo.

## Antes de cambiar código o datos

```text
npm.cmd run backup
git status --short
git log --oneline -10
```

Guardá la ruta impresa por backup fuera del workspace. Conservá `.env` con
permisos privados.

## Rollback del último gate

Si Gate 7 es el commit actual y no hay commits posteriores:

```text
git revert HEAD
```

Revisá el diff, ejecutá `npm.cmd test` y creá el commit de revert normal. No
uses squash ni force push.

## Rollback por gate

Commits:

- Gate 6: `b9ccfac`
- Gate 5: `d3e32b0`
- Gate 4: `96094bc`
- Gate 3: `3553ecb`
- Gate 2: `9c77191`
- Gate 1: `039173e`
- Gate 0: `fb7a8c7`
- Base: `805d639690ebfce9922f5b6f347e9a67a9f7c42f`

Para retirar gates ya publicados, revertí en orden inverso, un commit por vez:

```text
git revert b9ccfac
git revert d3e32b0
```

Continuá sólo hasta el gate deseado. Después de cada revert:

```text
npm.cmd test
git status --short
```

Los hashes pueden requerir resolución manual si existe trabajo posterior. Nunca
resuelvas descartando cambios ajenos.

## Volver al código base sin tocar la rama

La opción más segura para inspección es una rama nueva:

```text
git switch -c codex/apex-7-0-reference 805d639690ebfce9922f5b6f347e9a67a9f7c42f
```

No apuntes esa versión al data dir 7.1: el código anterior no entiende el ledger,
la Constitución ni los registros nuevos.

## Rollback de datos

1. Cerrá el proceso APEX.
2. Renombrá o copiá el `APEX_DATA_DIR` actual como evidencia.
3. Restaurá un backup completo en un directorio nuevo.
4. Configurá `APEX_DATA_DIR` a ese directorio.
5. Ejecutá `npm.cmd run doctor`.
6. Ejecutá `npm.cmd test`.
7. Iniciá y verificá `/api/health` y `/api/portfolio`.

No restaures solamente:

- `apex-paper-snapshot.json`;
- `apex-active-constitution.json`;
- un fragmento de NDJSON;
- eventos individuales.

## Snapshot corrupto

Eliminación no es necesaria. Mové el snapshot a evidencia y reiniciá: la
proyección se reconstruye desde el ledger. Si el ledger falla integridad,
detenete; no recortes manualmente salvo la recuperación automática de tail
truncado.

## Migración heredada fallida

- Conservá el backup `operational:false` del browser.
- Consultá `/api/portfolio` antes de reintentar.
- Una idempotency key repetida devuelve el efecto existente.
- Un fingerprint conflictivo requiere investigación; no fuerces una segunda
  importación.

## Voz

Para deshabilitar voz real sin cambiar código:

```text
OPENAI_API_KEY=
```

APEX seguirá cargando con mock/texto. Para una falla del provider no edites
tool policy ni expongas la clave en browser.

## Criterio de aborto

Ante corrupción, invariantes rotas, live habilitable, Risk duplicado o tests
críticos fallidos:

1. detenerse en el último commit verde;
2. conservar datos y logs;
3. no simular completitud;
4. emitir `DO NOT MERGE`;
5. documentar el bloqueo y el recovery propuesto.
