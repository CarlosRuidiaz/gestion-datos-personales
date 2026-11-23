# ms-crear

Microservicio NestJS de la opción **Crear Personas** (tarea T06). Ruta en el gateway: `/api/crear`. Usuario de base de datos: `usr_crear`.

| Método y ruta | Rol | Respuestas |
| --- | --- | --- |
| `POST /api/crear/personas` | administrador | 201, 400, 401, 403, 409 |
| `GET /api/crear/docs` | sin token | Documentación OpenAPI (`/api/crear/docs-json` en JSON) |

## Cómo se usa

El cuerpo es `multipart/form-data` con los campos del formulario y, opcionalmente, el archivo `foto` (JPG o PNG, máximo 2 MB). También acepta `application/json` cuando no hay foto.

Campos: `tipoDocumento`, `numeroDocumento`, `primerNombre`, `segundoNombre` (opcional), `apellidos`, `fechaNacimiento` (`dd-mmm-yyyy` o `yyyy-mm-dd`), `genero`, `correo` y `celular`. Las reglas son las de la sección 3.3 del diseño y viven en `libs/common`.

- **201:** devuelve la persona creada, sin la foto (`tieneFoto` indica si quedó guardada).
- **400:** `errores: [{ campo, mensaje }]`, para mostrar cada mensaje junto a su campo. La foto inválida llega como campo `foto`.
- **409:** el número de documento ya existe.

La persona y su registro de log se guardan en una sola transacción. Los intentos rechazados (400, 403 y 409) quedan en el log con resultado `ERROR`.

Un detalle: el 403 se decide antes de leer el formulario, así que ese registro del log queda sin número de documento.

## Verificar

Con todo arriba (`docker compose up -d --build`), desde la raíz del repositorio (en Windows, con Git Bash):

```bash
bash services/ms-crear/verificar.sh
```

Debe terminar con `TODO BIEN`. Llama a la API por el gateway con tokens reales y revisa la base de datos y el log.

## Pendiente en otras tareas

- (T16 hecha: después de crear avisa a n8n con `CREAR`, sin esperar la respuesta. Ver `libs/common/README.md`, sección «Aviso a n8n».)
- **T18:** pruebas unitarias con Jest.

## Archivos

- `src/personas.controller.ts`: ruta, permisos y subida de la foto.
- `src/personas.service.ts`: transacción de creación y log.
- `Dockerfile`: se construye con el contexto en la raíz del repositorio.
