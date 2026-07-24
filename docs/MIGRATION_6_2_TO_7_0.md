# Migración 6.2 → 7.0

## Estrategia recomendada

No reemplazar archivos. Instalar 7.0 en una carpeta nueva y conservar 6.2 completa.

## Estado del navegador

El frontend utiliza el mismo origen `http://127.0.0.1:5500`. Si se usa el mismo perfil, el localStorage se conserva automáticamente.

## Estado del backend

Para importar JSON/NDJSON de 6.2:

```bash
node tools/migrate-from-6-2.js "RUTA_A_LA_CARPETA_6_2"
```

La herramienta:

1. valida que exista `data/` en la fuente;
2. respalda `data/` de 7.0;
3. copia los archivos conocidos;
4. no toca `.env` ni configuración 7.0.

## Reversión

Cerrar 7.0 y volver a ejecutar `start_apex.bat` dentro de 6.2. No se modifica la carpeta anterior.
