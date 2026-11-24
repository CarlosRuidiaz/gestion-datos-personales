# ms-consultar

Microservicio NestJS de la opción **Consultar Datos Personales**. Ruta en el gateway: `/api/consultar`. Usuario de base de datos: `usr_consultar`.

| Método y ruta | Rol | Respuestas |
| --- | --- | --- |
| `GET /api/consultar/personas/{documento}` | administrador o consultor | 200, 400, 401, 403, 404 |
| `GET /api/consultar/health` | sin token | 200 disponible, 503 sin base de datos |
| `GET /api/consultar/docs` | sin token | Documentación OpenAPI (`/api/consultar/docs-json` en JSON) |

## Cómo se usa

**Consultar.** Devuelve la ficha completa de la persona (`PersonaRespuesta` de `libs/common`), con la foto como `data:image/...;base64,...` lista para un `<img>`, o `null` si no tiene. La consulta y su registro de log (`CONSULTAR`, resultado `EXITO`, sin detalle) van en una transacción. Los rechazos (400, 403 y 404) quedan en el log con resultado `ERROR`.

**Health.** Responde `{"estado":"disponible","servicio":"ms-consultar"}` si el servicio llega a la base de datos, y 503 si no. El frontend lo usa para mostrar Consultar como disponible o no (CU-04). Cuando el contenedor está apagado, la ruta desaparece del gateway y Traefik responde **404**: para el frontend, cualquier respuesta distinta de 200 significa «no disponible».

## Encender, apagar y escalar (DD-04, RF-09)

ms-consultar está en el perfil `consultar` de Docker Compose y no tiene `container_name`, así que se puede escalar:

```bash
docker compose --profile consultar up -d --build             # arrancar todo
docker compose stop ms-consultar                              # deshabilitar Consultar
docker compose up -d ms-consultar                             # habilitar Consultar
docker compose up -d --scale ms-consultar=3 ms-consultar      # tres réplicas
```

Traefik ve los cambios en segundos, sin reiniciarse. El contenedor tiene un healthcheck sobre `/api/consultar/health`: Traefik solo envía peticiones a las réplicas que ya lo pasaron, así que una réplica que está arrancando no recibe tráfico.

## Verificar

Con todo arriba (`docker compose --profile consultar up -d --build`), desde la raíz del repositorio (en Windows, con Git Bash):

```bash
bash services/ms-consultar/verificar.sh
```

Debe terminar con `TODO BIEN`. Además de la consulta y el log, apaga ms-consultar (comprueba que su ruta desaparece y que ms-modificar sigue buscando), lo vuelve a encender, lo escala a tres réplicas y lo deja otra vez con una.

## Integración

- **Pantalla:** la de consulta está en `frontend/src/paginas/Consultar.tsx`.
- **Pruebas unitarias:** Jest, en `src/*.spec.ts` (`npm test -w ms-consultar`).

## Archivos

- `src/personas.controller.ts`: ruta de consulta, para los dos roles.
- `src/personas.service.ts`: consulta con su log en una transacción y chequeo de la base de datos.
- `src/health.controller.ts`: endpoint `health` sin token.
