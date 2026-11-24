# ms-crear

Microservicio NestJS de la opción **Crear Personas**. Ruta en el gateway: `/api/crear`. Usuario de base de datos: `usr_crear`.

| Método y ruta | Rol | Respuestas |
| --- | --- | --- |
| `POST /api/crear/personas` | administrador | 201, 400, 401, 403, 409 |
| `POST /api/crear/personas/importacion/revision` | administrador | 200, 400, 401, 403. Revisa un Excel o CSV y sus fotos sin guardar nada |
| `POST /api/crear/personas/importacion` | administrador | 200, 400, 401, 403. Crea las personas válidas del archivo, con sus fotos |
| `GET /api/crear/docs` | sin token | Documentación OpenAPI (`/api/crear/docs-json` en JSON) |

## Cómo se usa

El cuerpo es `multipart/form-data` con los campos del formulario y, opcionalmente, el archivo `foto` (JPG o PNG, máximo 2 MB). También acepta `application/json` cuando no hay foto.

Campos: `tipoDocumento`, `numeroDocumento`, `primerNombre`, `segundoNombre` (opcional), `apellidos`, `fechaNacimiento` (`dd-mmm-yyyy` o `yyyy-mm-dd`), `genero`, `correo` y `celular`. Las reglas son las de la sección 3.3 del diseño y viven en `libs/common`.

- **201:** devuelve la persona creada, sin la foto (`tieneFoto` indica si quedó guardada).
- **400:** `errores: [{ campo, mensaje }]`, para mostrar cada mensaje junto a su campo. La foto inválida llega como campo `foto`.
- **409:** el número de documento ya existe.

La persona y su registro de log se guardan en una sola transacción. Los intentos rechazados (400, 403 y 409) quedan en el log con resultado `ERROR`.

Un detalle: el 403 se decide antes de leer el formulario, así que ese registro del log queda sin número de documento.

## Importar personas desde un archivo

Para los datos que manda el profesor: un Excel (`grupo_N.xlsx`, una fila por persona con las columnas del formulario y una columna «Foto») y un zip con las fotos. Se usa desde la pantalla «Crear personas» → «Importar personas desde un archivo».

- Los archivos van en un `multipart/form-data`: `datos` (un `.xlsx` o `.csv`) y `fotos` (uno o varios `.zip` o imágenes sueltas). Se leen sin dependencias: un `.xlsx` es un zip con XML (`src/importacion/archivos.ts`).
- `src/importacion/columnas.ts` reconoce los encabezados con distintos nombres (sin importar tildes ni mayúsculas) y convierte formas comunes: `CC` → `Cédula`, `M` → `Masculino`, fechas `dd-mmm-aaaa`, `dd/mm/aaaa` o de Excel, documentos con puntos, celulares con `+57`.
- Cada fila se valida con `CrearPersonaDto`, la misma clase del formulario, así que los mensajes son los mismos. Las fotos se buscan por el nombre de la columna «Foto» y se validan como en el formulario (JPG o PNG, hasta 2 MB); si una falta o no es válida, la persona se crea sin foto.
- **Revisión:** dice qué pasará con cada fila (lista, ya registrada o con errores) y no guarda nada ni escribe en el log.
- **Importación:** crea cada persona con `PersonasService.crear`, igual que el formulario: su `CREAR` en el log en la misma transacción y el aviso a n8n para indexarla. Las filas que no se crean (inválidas, repetidas o ya registradas) quedan en el log como `CREAR` con resultado `ERROR`, con el archivo y la línea en el detalle.

## Verificar

Con todo arriba (`docker compose up -d --build`), desde la raíz del repositorio (en Windows, con Git Bash):

```bash
bash services/ms-crear/verificar.sh
```

Debe terminar con `TODO BIEN`. Llama a la API por el gateway con tokens reales y revisa la base de datos y el log.

La importación tiene su propia verificación, con un Excel y un zip ficticios del mismo formato que los del profesor (`archivos-importacion-prueba.mjs`):

```bash
bash services/ms-crear/verificar-importacion.sh
```

## Integración

- **Aviso a n8n:** después de crear avisa con `CREAR`, sin esperar la respuesta. Ver `libs/common/README.md`, sección «Aviso a n8n».
- **Pruebas unitarias:** Jest, en `src/*.spec.ts` (`npm test -w ms-crear`).

## Archivos

- `src/personas.controller.ts`: ruta, permisos y subida de la foto.
- `src/personas.service.ts`: transacción de creación y log.
- `src/importacion/`: importar personas desde un archivo: lectura de zip, xlsx y CSV, columnas y valores, revisión e importación.
- `Dockerfile`: se construye con el contexto en la raíz del repositorio.
