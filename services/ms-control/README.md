# ms-control

Interruptor de Consultar (RF-09). El administrador apaga y enciende ms-consultar desde el menú principal. Las demás opciones siguen funcionando mientras Consultar está apagado.

| Ruta | Rol | Qué hace |
| --- | --- | --- |
| `GET /api/control/health` | sin token | 200 si el servicio está arriba |
| `GET /api/control/consultar` | administrador | `{ encendido, replicas, enEjecucion }` |
| `POST /api/control/consultar/apagar` | administrador | Detiene todas las réplicas de ms-consultar |
| `POST /api/control/consultar/encender` | administrador | Arranca las réplicas detenidas. 409 si nunca se crearon |

La documentación OpenAPI está en `/api/control/docs`.

## Cómo funciona

- Detiene y arranca **de verdad** los contenedores, igual que `docker compose stop` y `docker compose start`. Los busca por las etiquetas de Compose `com.docker.compose.project=gestion-datos-personales` y `com.docker.compose.service=ms-consultar`, así que también sirve si se escaló.
- Traefik quita y vuelve a poner la ruta `/api/consultar` solo (DD-04). El frontend lo nota en su revisión de `/api/consultar/health`.
- Solo enciende contenedores que ya existen. Por eso el sistema se arranca como siempre: `docker compose --profile consultar up -d --build`.
- No usa la base de datos, así que no importa `ComunModule`: solo toma de `@gdp/common` el guard JWT con roles.
- El apagado y el encendido no van al log de transacciones, porque no son operaciones sobre personas y el log solo admite sus cinco tipos. Quedan en la salida del contenedor (`docker compose logs ms-control`), con el usuario que los hizo.

## Acceso a Docker

ms-control **no** monta el socket de Docker. Le pide todo a `docker-proxy` (`tecnativa/docker-socket-proxy`), que está en la red interna `control`, sin puertos publicados.

`docker-proxy` usa la configuración de [`docker-proxy.cfg`](docker-proxy.cfg) en lugar de la que trae la imagen. Solo deja pasar `GET /containers/json`, `POST /containers/{id}/stop` y `POST /containers/{id}/start`. Todo lo demás responde 403: crear contenedores, exec, inspeccionar (que mostraría las contraseñas de las variables de entorno), imágenes y volúmenes.

No se usaron las variables de la imagen (`POST`, `CONTAINERS`, `ALLOW_START`, `ALLOW_STOP`): para detener y arrancar habría que activar `POST=1`, y con `CONTAINERS=1` eso deja pasar también crear contenedores y exec.

## Verificar

```bash
docker compose --profile consultar up -d --build
bash services/ms-control/verificar.sh
```

Comprueba los permisos, lo que `docker-proxy` rechaza, apagar y encender por la API, que el contenedor quede detenido en Docker, que la ruta desaparezca del gateway y que ms-log, ms-modificar y ms-borrar sigan respondiendo (CP-07).
