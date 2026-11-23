# ms-borrar

Microservicio NestJS de la opción **Borrar Personas** (tarea T09). Ruta en el gateway: `/api/borrar`. Usuario de base de datos: `usr_borrar`.

| Método y ruta | Rol | Respuestas |
| --- | --- | --- |
| `GET /api/borrar/personas/{documento}` | administrador | 200, 400, 401, 403, 404 |
| `DELETE /api/borrar/personas/{documento}` | administrador | 204, 400, 401, 403, 404 |
| `GET /api/borrar/docs` | sin token | Documentación OpenAPI (`/api/borrar/docs-json` en JSON) |

## Cómo se usa (CU-06)

1. **Buscar (`GET`).** Devuelve la persona con su foto (`foto` como `data:image/...;base64,...`, o `null`) para que el usuario revise los datos antes de confirmar. Este servicio hace su propia búsqueda y no depende de ms-consultar. Queda en el log con el tipo `CONSULTAR` y el contexto «Búsqueda previa a un borrado». Buscar no borra nada: si el usuario cancela, no hay que llamar a nada más.
2. **Borrar (`DELETE`).** Lo llama el frontend solo cuando el usuario confirma. Responde 204 sin cuerpo. El borrado y su registro de log van en una transacción. El detalle del log guarda los datos que tenía la persona en `anterior` (sin la foto ni las fechas de creación y actualización) y `teniaFoto`, así su historial queda completo aunque la persona ya no exista (CP-05).

Los rechazos (400, 403 y 404) quedan en el log con resultado `ERROR`. Borrar dos veces la misma persona da 404 la segunda vez.

## Verificar

Con todo arriba (`docker compose --profile consultar up -d --build`), desde la raíz del repositorio (en Windows, con Git Bash):

```bash
bash services/ms-borrar/verificar.sh
```

Debe terminar con `TODO BIEN`. Inserta sus propias personas de prueba en la base de datos, así que no necesita ms-crear. Si ms-consultar está encendido, lo apaga un momento para comprobar que borrar funciona sin él, y lo vuelve a encender.

## Pendiente en otras tareas

- (T16 hecha: después de borrar avisa a n8n con `BORRAR`, para que quite el vector de la persona. Ver `libs/common/README.md`, sección «Aviso a n8n».)
- **T13:** la pantalla de borrar del frontend, con la confirmación.
- **T18:** pruebas unitarias con Jest.

## Archivos

- `src/personas.controller.ts`: rutas y permisos.
- `src/personas.service.ts`: búsqueda previa, transacción de borrado y log.
