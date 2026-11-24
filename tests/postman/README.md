# tests/postman

Colección de Postman con todos los endpoints de los cinco microservicios, por el gateway y con tokens reales de Keycloak. Cada petición trae pruebas.

| Archivo | Qué es |
| --- | --- |
| `gdp.postman_collection.json` | La colección: 54 peticiones y 80 comprobaciones, en el orden de la prueba |
| `gdp-local.postman_environment.json` | El entorno local. Las contraseñas y la llave de API van vacías a propósito: no se suben al repositorio |

## Cómo usarla en Postman

1. Con todo arriba (`docker compose --profile consultar up -d`) y los datos de prueba cargados o no (da igual).
2. En Postman: **Import** y elige los dos archivos.
3. Arriba a la derecha elige el entorno **Gestión de Datos Personales · local** y llena estos tres valores con los de tu `.env`:

   | Variable del entorno | Variable de `.env` |
   | --- | --- |
   | `passwordAdmin` | `KEYCLOAK_USUARIO_ADMIN_PASSWORD` |
   | `passwordConsultor` | `KEYCLOAK_USUARIO_CONSULTOR_PASSWORD` |
   | `n8nApiKey` | `N8N_LOG_API_KEY` |

4. Clic derecho sobre la colección, **Run collection**, y **Run**.

No hay que sacar tokens a mano: un script de la colección los pide a Keycloak con el cliente `pruebas` (usuarios `admin.prueba` y `consultor.prueba`) y los renueva antes de que venzan, a los 5 minutos.

## Cómo correrla desde la terminal (newman)

Desde la raíz del repositorio, en Git Bash:

```bash
npx newman run tests/postman/gdp.postman_collection.json \
  -e tests/postman/gdp-local.postman_environment.json \
  --env-var "passwordAdmin=$(grep ^KEYCLOAK_USUARIO_ADMIN_PASSWORD= .env | cut -d= -f2- | tr -d '\r')" \
  --env-var "passwordConsultor=$(grep ^KEYCLOAK_USUARIO_CONSULTOR_PASSWORD= .env | cut -d= -f2- | tr -d '\r')" \
  --env-var "n8nApiKey=$(grep ^N8N_LOG_API_KEY= .env | cut -d= -f2- | tr -d '\r')"
```

## Qué hace, en orden

Trabaja con una persona ficticia, el documento `9999980001` (variable `docPrueba`). Al empezar borra la que haya quedado de una corrida interrumpida, y al terminar la deja borrada, así que se puede repetir.

| Carpeta | Qué prueba |
| --- | --- |
| 00 Autenticación y preparación | Keycloak rechaza una contraseña incorrecta; limpia la persona de prueba |
| 01 ms-crear | CP-01 crear (201), CP-02 documento repetido (409), CP-03 campos inválidos (400, con el campo de cada error), CP-08 sin token (401) y como consultor (403) |
| 02 ms-modificar | Búsqueda previa, 404, CP-04 modificar el correo (200), CP-03, CP-08 |
| 03 ms-consultar | Health sin token, consultar con los dos roles, 400 y 404, CP-08 |
| 04 ms-log | Filtros por tipo, documento y fechas, solos y combinados (CP-06), rango sin resultados, filtros inválidos (400), paginación; el log tiene el CREAR (CP-01), el ERROR del 409 (CP-02) y el valor anterior y nuevo del MODIFICAR (CP-04); registro de n8n con y sin llave de API |
| 05 ms-borrar | Búsqueda previa, 404, borrar (204), CP-08 |
| 06 Después de borrar | CP-05: la persona ya no se consulta, pero su historial en el log sigue completo, con los datos que tenía |

CP-08 se repite en cada servicio: sin token responde 401 y con el rol consultor en una ruta de escritura responde 403.

## Lo que no cubre

- **La foto** (JPG o PNG, máximo 2 MB): Postman necesita elegir un archivo del disco. Se prueba con la pantalla Crear personas y con `bash services/ms-crear/verificar.sh`.
- **CP-07, apagar ms-consultar:** a mano. `docker compose stop ms-consultar` y se envía «Health sin token» de la carpeta 03: debe responder 404 desde Traefik. Con `docker compose up -d ms-consultar` vuelve a 200.
- **CP-09 y CP-10, el chat de n8n:** se prueban con `bash n8n/verificar-chat.sh`.

## Si algo falla

- **Todo responde 401:** el script no pudo sacar el token. Abre la consola de Postman (**View → Show Postman Console**): dirá «Falta passwordAdmin…» o «No se pudo obtener el token». Revisa las contraseñas del entorno (son las de `.env`, no las de la consola de Keycloak) y que Keycloak esté `healthy`.
- **«n8n: llave incorrecta» o «registrar una consulta» fallan:** revisa `n8nApiKey`. Debe ser exactamente `N8N_LOG_API_KEY`. Si la cambiaste en `.env`, recrea el contenedor con `docker compose up -d ms-log`.
- **Falla solo el primer «CP-01 Crear»:** casi seguro quedó una persona `9999980001` de otra corrida y la limpieza del inicio no corrió. Vuelve a correr la colección desde el principio.
