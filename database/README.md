# database

Scripts de la base de datos PostgreSQL 16 con pgvector. Referencia: secciones 6.1 a 6.3 de `docs/diseno/documento_diseno.md`.

| Archivo | Qué hace |
| --- | --- |
| `init.sql` | Crea las tablas `persona`, `log_transaccion` y `persona_embedding`, la vista `vista_personas`, los índices, los seis usuarios de base de datos y sus permisos |
| `init-usuarios.sh` | Asigna a cada usuario la contraseña definida en `.env` (`DB_PASSWORD_*`). Ninguna contraseña queda en el repositorio |
| `verificar.sh` | Comprueba que el esquema, las restricciones y los permisos coinciden con el diseño |
| `datos-prueba.sql` | 20 personas ficticias y un registro `CREAR` en el log por cada una (usuario `datos-prueba`) |
| `cargar-datos-prueba.sh` | Ejecuta `datos-prueba.sql` en el contenedor `postgres` |
| `datos-profesor.plantilla.sql` | Plantilla para los datos que manda el profesor para la sustentación (T25) |
| `cargar-datos-profesor.sh` | Vacía personas, log e índice del chat, carga `datos-profesor.sql` y reindexa el chat (T25) |

## Cuándo se ejecutan

`init.sql` e `init-usuarios.sh` se ejecutan solos, en ese orden, la primera vez que arranca el contenedor `postgres`, es decir, cuando el volumen `pgdata` está vacío. Si cambian, o si cambias una contraseña `DB_PASSWORD_*` en `.env`, hay que recrear el volumen (esto borra los datos locales):

```bash
docker compose down -v
docker compose up -d
```

## Verificar

Con el contenedor `postgres` arriba, desde la raíz del repositorio:

```bash
docker compose exec -T postgres sh < database/verificar.sh
```

Debe terminar con `TODO BIEN`. Usa el documento ficticio `9999999999` y limpia lo que crea.

## Cargar datos de prueba

Con el contenedor `postgres` arriba, desde la raíz del repositorio (en Windows, con Git Bash):

```bash
bash database/cargar-datos-prueba.sh
```

Se puede repetir sin duplicar nada: una persona que ya existe no se vuelve a insertar y tampoco recibe otro registro de log. No necesita Keycloak ni los microservicios. Después hay que ejecutar **Reindexar todo** en n8n para que el chat conozca a las personas (ver `n8n/README.md`).

Los registros de log de estos datos llevan el usuario `datos-prueba`, así se distinguen de los de usuarios reales. Si recreas el volumen (`docker compose down -v`) se pierde todo y hay que volver a cargar.

## Dejar solo los datos del profesor (sustentación)

En la sustentación el profesor pide dejar la base solo con las personas que mandó por correo (ver `docs/sustentacion.md`).

1. Copia `database/datos-profesor.plantilla.sql` como `database/datos-profesor.sql`. Ese archivo está en `.gitignore`: cada quien lo pone en su copia y no se sube.
2. Reemplaza la fila de ejemplo por una fila por persona del correo.
3. Ejecuta, desde la raíz:

```bash
bash database/cargar-datos-profesor.sh        # pide escribir SI
bash database/cargar-datos-profesor.sh --si   # sin preguntar
```

El script **borra todas las personas, todo el log y el índice del chat**. Después carga las personas con su registro `CREAR` (usuario `datos-profesor`) y ejecuta «Reindexar todo» en n8n. El vaciado y la carga van en una sola transacción: si una fila no cumple las validaciones, por ejemplo un segundo nombre de más de 30 caracteres, no se carga nada y la base queda como estaba. Las personas con datos inválidos a propósito se dejan fuera del archivo y se prueban en el formulario durante la demostración.

Si la reindexación falla (n8n sin configurar o sin `GEMINI_API_KEY`), los datos quedan cargados y el script indica cómo reindexar a mano.

## Usuarios y permisos

| Usuario | Servicio | Permisos |
| --- | --- | --- |
| `usr_crear` | ms-crear | SELECT e INSERT en `persona`, INSERT en el log |
| `usr_modificar` | ms-modificar | SELECT y UPDATE en `persona`, INSERT en el log |
| `usr_consultar` | ms-consultar | SELECT en `persona`, INSERT en el log |
| `usr_borrar` | ms-borrar | SELECT y DELETE en `persona`, INSERT en el log |
| `usr_log` | ms-log | SELECT e INSERT en el log |
| `usr_n8n` | n8n | SELECT en `vista_personas`, dueño de `persona_embedding` |

Ningún usuario puede hacer UPDATE, DELETE ni TRUNCATE sobre `log_transaccion`.

## Para quien programe contra esta base

- **El esquema lo define `init.sql`, no el ORM.** En TypeORM, `synchronize` debe ir en `false`: los usuarios de los servicios no pueden crear ni alterar tablas.
- **Quien inserta en el log no puede leerlo** (salvo `usr_log`). El INSERT no debe usar `RETURNING`, o fallará con `permission denied` (comprobado). Ojo: `save()` e `insert()` de TypeORM agregan `RETURNING id` por su cuenta; el módulo de auditoría (T05) debe insertar con una consulta parametrizada propia o desactivar el `RETURNING`.
- **`foto_tipo`** guarda el tipo MIME: `image/jpeg` o `image/png`. La foto y su tipo van juntos o los dos nulos.
- **`tipo_documento` y `genero`** guardan el texto tal como lo muestra el formulario (`Cédula`, `Tarjeta de identidad`, `Masculino`, `Femenino`, `No binario`, `Prefiero no reportar`).
- **`fecha_actualizacion`** la actualiza el servicio que modifica; no hay disparador.
- **`persona_embedding`** tiene las columnas que usa el nodo Postgres PGVector Store de n8n (`id`, `text`, `metadata`, `embedding`). El documento va en `metadata ->> 'numero_documento'`. La columna `embedding` no fija la dimensión; la decide T14 según el modelo de embeddings.
- PostgreSQL no publica puertos. Para entrar: `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`.
