# Modelo de seguridad — AI Command

## Secretos

- La clave se guarda exclusivamente en `.env`.
- `.env` no se incluye con una clave real.
- El frontend nunca recibe `OPENAI_API_KEY`.
- El servidor escucha por defecto solo en `127.0.0.1`.

## Ejecución

La salida textual de la IA no ejecuta código.

Solo pueden ejecutarse nombres registrados en el Tool Registry. Cada herramienta recibe argumentos explícitos y pasa por validación local.

## Confirmación y armado

Las herramientas sensibles requieren confirmación. Además, `PAPER COMMAND` se arma por sesión y vuelve a estado pasivo al cerrar el navegador.

## Acciones no disponibles

No existe herramienta para:

- cuentas externas;
- trading live;
- retiros;
- transferencias;
- firmas on-chain;
- secretos;
- cambios del techo autónomo;
- eliminación de vetos.

## Auditoría

Se registran, entre otros:

- `AI_COMMAND_REQUESTED`;
- `AI_RESPONSE_RECEIVED`;
- `AI_ACTION_PROPOSED`;
- `AI_ACTION_CONFIRMED`;
- `AI_ACTION_CANCELLED`;
- `AI_ACTION_EXECUTED`;
- `AI_ACTION_REJECTED`;
- armado y desarmado de PAPER COMMAND.
