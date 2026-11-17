# ms-modificar

Microservicio NestJS de la opción **Modificar Datos Personales** (tarea T07). Ruta en el gateway: `/api/modificar`. Usuario de base de datos: `usr_modificar`.

| Método y ruta | Rol | Respuestas |
| --- | --- | --- |
| `GET /api/modificar/personas/{documento}` | administrador | 200, 400, 401, 403, 404 |
| `PUT /api/modificar/personas/{documento}` | administrador | 200, 400, 401, 403, 404 |
| `GET /api/modificar/docs` | sin token | Documentación OpenAPI (`/api/modificar/docs-json` en JSON) |

## Cómo se usa

**Buscar (`GET`).** Devuelve la persona con su foto (`foto` como `data:image/...;base64,...`, o `null`), para llenar el formulario. Este servicio hace su propia búsqueda y no depende de ms-consultar. Queda en el log con el tipo `CONSULTAR` y el contexto «Búsqueda previa a una modificación».

**Modificar (`PUT`).** El cuerpo es `multipart/form-data` (o `application/json` sin foto) con todos los campos del formulario menos el número de documento, que no se puede cambiar: si se envía, se ignora. Las reglas son las de la sección 3.3 del diseño.

La foto se maneja así:

- Si llega un archivo `foto`, reemplaza la actual.
- Si no llega archivo y `eliminarFoto` es `true`, se quita.
- Si no llega ninguna de las dos cosas, se conserva.

La modificación y su registro de log se guardan en una sola transacción. El detalle del log guarda el valor anterior y el nuevo **solo de los campos que cambiaron**, y `foto: agregada | reemplazada | eliminada` cuando aplica (nunca la imagen). Si no cambió nada, el registro lleva `sinCambios: true`.

Los rechazos (400, 403 y 404) quedan en el log con resultado `ERROR`.

## Verificar

Con todo arriba (`docker compose up -d --build`), desde la raíz del repositorio (en Windows, con Git Bash):

```bash
bash services/ms-modificar/verificar.sh
```

Debe terminar con `TODO BIEN`. Inserta su propia persona de prueba en la base de datos, así que no necesita ms-crear.

## Pendiente en otras tareas

- **T16:** avisar a n8n por webhook después de modificar.
- **T18:** pruebas unitarias con Jest.

## Archivos

- `src/personas.controller.ts`: rutas, permisos y subida de la foto.
- `src/personas.service.ts`: búsqueda previa, transacción de modificación y log.
- `src/actualizar-persona.dto.ts`: cuerpo del `PUT` (los campos comunes más `eliminarFoto`).
