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
| `cargar-datos-profesor.sh` | Vacía personas, log e índice del chat, carga los datos de `datos-profesor/` (o `datos-profesor.sql`) con sus fotos y reindexa el chat (T25, T28 y T29) |
| `datos-profesor.mjs` | Convierte el Excel o CSV del profesor y su zip de fotos en SQL: reconoce columnas y valores comunes y deja fuera las filas inválidas (T28 y T29) |

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

En la sustentación el profesor pide dejar la base solo con las personas que mandó por correo (ver `docs/sustentacion.md`). Por lo que recibió otro grupo, llegan un Excel (`grupo_N.xlsx`, una fila por persona, con las mismas columnas del formulario y una columna «Foto») y un zip con las fotos (`archivos_jpg.zip`). Varias personas pueden compartir la misma foto.

1. Crea la carpeta `database/datos-profesor/` y pon ahí **los dos archivos tal como llegaron**, sin abrirlos ni convertirlos. Está en `.gitignore`: no se sube.
2. En cuanto lleguen, desde la raíz:

```bash
bash database/cargar-datos-profesor.sh --revisar   # qué columnas y fotos reconoció y qué filas quedan fuera; no toca la base
```

3. Para cargar (borra todo lo anterior):

```bash
bash database/cargar-datos-profesor.sh             # pide escribir SI
bash database/cargar-datos-profesor.sh --si        # sin preguntar (en la sustentación)
```

El conversor es `datos-profesor.mjs` (Node.js 22 o superior, sin dependencias: lee el .xlsx y el .zip por su cuenta). Acepta:

- **Datos:** un `.xlsx` (primera hoja) o un `.csv` (coma, punto y coma o tabulador; UTF-8 o Windows-1252). Uno solo por carpeta.
- **Fotos:** uno o varios `.zip` y también imágenes sueltas en la carpeta. Se buscan por el nombre que dice la columna «Foto», sin importar mayúsculas ni subcarpetas del zip. Deben ser JPG o PNG (se revisa el contenido, no la extensión) de hasta 2 MB.
- **Encabezados** con distintos nombres, sin importar tildes ni mayúsculas: «Número Documento», «No. Identificación», «Tipo doc», «Nombres» (el primero es el primer nombre y el resto el segundo), «Primer apellido» y «Segundo apellido» (se unen), «Sexo», «Email», «Teléfono», «Foto» o «Imagen»...
- **Valores** como `Cédula`, `CC`, `TI`, `M`, `F`, fechas `dd-mmm-aaaa` (`16-mar-1965`), `dd/mm/aaaa`, `aaaa-mm-dd` o fecha de Excel, documentos con puntos y celulares con espacios o `+57`.

Las fechas con barras se leen como día/mes/año, que es lo usual en Colombia. Revisa en el informe que ninguna haya quedado al revés.

Qué pasa con lo que no cumple:

- Una fila que no cumple las validaciones (sección 3.3 del diseño), o con un documento repetido, **queda fuera** con su motivo y las demás se cargan. Así pasa con la persona que el profesor trae inválida a propósito: se prueba en el formulario para mostrar el mensaje de error.
- Si la foto no está, no es JPG o PNG, o pesa más de 2 MB, **la persona se carga sin foto** y el informe lo avisa. La foto es opcional.
- Si falta una columna obligatoria, el script dice cuál y no carga nada.

**A mano.** Si los datos vienen de otra forma (en el cuerpo del correo o en un PDF), copia `database/datos-profesor.plantilla.sql` como `database/datos-profesor.sql` y pon una fila por persona (sin fotos). Si existe la carpeta, se usa la carpeta.

El script **borra todas las personas, todo el log y el índice del chat**, y después carga las personas (con su foto) y un registro `CREAR` por cada una (usuario `datos-profesor`), y ejecuta «Reindexar todo» en n8n. El vaciado y la carga van en una sola transacción: si algo falla, la base queda como estaba. Si la reindexación falla (n8n sin configurar o sin `GEMINI_API_KEY`), los datos quedan cargados y el script indica cómo reindexar a mano.

Pruebas del conversor: `npm run test:database`.

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
