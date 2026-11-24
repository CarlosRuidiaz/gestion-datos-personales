# CONTEXTO DEL PROYECTO

> Este es el documento de contexto del repositorio. Cualquier integrante del equipo, o la IA que use, debe leerlo completo antes de trabajar.
> Uso: haz `git pull`, abre tu IA en la carpeta del repositorio y pídele «Lee CONTEXTO.md y dime en qué estado está el proyecto y qué me toca hacer».

**Última actualización:** 2026-11-23, por Juan Fernández (tarea T18)
**Fase actual:** Fase 2 · Frentes paralelos (microservicios, frontend, n8n y calidad)

---

## 1. Qué es este proyecto

Aplicación de Gestión de Datos Personales, proyecto final de Diseño de Software II (Universidad del Norte, periodo 202630). Equipo: Carlos Ruidiaz, Claudia Elias, Juan Fernandez y Daniel Mendez.

Permite crear, modificar, consultar y borrar personas (la llave es el número de documento), responde preguntas en lenguaje natural sobre esos datos con un agente RAG en n8n y registra toda transacción en un log de auditoría consultable. Todo corre en contenedores con Docker Compose.

Documentos de referencia dentro del repositorio:

- `docs/enunciado.md`: enunciado y rúbrica del profesor. Manda sobre todo lo demás.
- `docs/diseno/documento_diseno.md`: documento de diseño entregado. La implementación debe coincidir con él.
- `docs/notas_del_equipo.md`: decisiones y acuerdos que complementan el diseño.

## 2. Arquitectura en breve

| Contenedor | Tecnología | Ruta o puerto | Responsabilidad |
| --- | --- | --- | --- |
| gateway | Traefik | puerto 80 | Enruta por prefijo de ruta y detecta contenedores activos |
| frontend | React + Vite + TypeScript, servido con Nginx | / | Interfaz web |
| keycloak | Keycloak (OIDC) | puerto 8080 | Login, roles administrador y consultor, tokens JWT |
| ms-crear | NestJS | /api/crear | Crear personas |
| ms-modificar | NestJS | /api/modificar | Buscar y modificar personas |
| ms-consultar | NestJS (perfil `consultar`) | /api/consultar | Consultar personas. Se habilita y deshabilita |
| ms-borrar | NestJS | /api/borrar | Buscar y borrar personas |
| ms-log | NestJS | /api/log | Consultar el log y recibir los registros de n8n |
| postgres | PostgreSQL 16 + pgvector | solo red interna | Personas, log, vectores |
| n8n | n8n | puerto 5678 | Chat RAG, indexación de embeddings |

Reglas de diseño que no se deben romper sin registrar una decisión en la sección 7:

- Cada microservicio escribe su log en la misma transacción que la operación (módulo de auditoría en `libs/common`).
- Cada microservicio usa su propio usuario de base de datos con permisos mínimos. Nadie puede modificar ni borrar el log.
- La herramienta SQL del agente de n8n solo lee `vista_personas`.
- El webhook a n8n se llama después del commit y sin esperar respuesta.
- Solo datos ficticios.

## 3. Cómo ejecutar el proyecto

> Esta sección se mantiene al día con lo que realmente funciona. Si cambias cómo se arranca algo, actualízala en tu misma rama.

Requisitos: Docker Desktop (con WSL2 en Windows) y Git. Los puertos 80 y 8080 deben estar libres. Para programar los microservicios hace falta además Node.js 22 o superior (se usa Node 24 en los contenedores).

```bash
cp .env.example .env        # completar llaves y contraseñas (hoy son obligatorias POSTGRES_PASSWORD, las seis DB_PASSWORD_*, las tres de Keycloak, N8N_LOG_API_KEY y N8N_ENCRYPTION_KEY; para indexar hace falta GEMINI_API_KEY)
docker compose --profile consultar up -d --build
```

Qué arranca hoy: `gateway` (Traefik), `postgres` (PostgreSQL 16 con pgvector), `keycloak`, `frontend` (la aplicación en <http://localhost>), `ms-crear`, `ms-modificar`, `ms-borrar`, `ms-log`, `n8n` (en <http://localhost:5678>) y, solo con `--profile consultar`, `ms-consultar`. Para apagar, encender o escalar Consultar: `docker compose stop ms-consultar`, `docker compose up -d ms-consultar` y `docker compose up -d --scale ms-consultar=3 ms-consultar`. Ya no queda ningún servicio comentado en `docker-compose.yml`.

Cómo comprobar que funciona:

```bash
docker compose ps                      # gateway, postgres, keycloak y n8n en estado healthy (keycloak tarda cerca de un minuto)
curl -i http://localhost/              # 200: el gateway responde y entrega la aplicación (en el navegador redirige al login de Keycloak)
docker compose exec -T postgres sh < database/verificar.sh   # esquema, restricciones y permisos: termina con TODO BIEN
bash keycloak/verificar.sh             # realm, roles, usuarios de prueba y login con PKCE: termina con TODO BIEN (en Windows, con Git Bash)
npm install && npm test                # pruebas unitarias de libs/common y de los cinco servicios (150 en total, sin contenedores); por separado: npm run test:common y npm run test:services
bash libs/common/pruebas-integracion.sh   # guard, validaciones y log transaccional contra PostgreSQL y Keycloak reales
bash services/ms-crear/verificar.sh     # ms-crear de extremo a extremo, por el gateway y con tokens reales
bash services/ms-modificar/verificar.sh # ms-modificar de extremo a extremo (no necesita ms-crear ni ms-consultar)
bash services/ms-borrar/verificar.sh    # ms-borrar de extremo a extremo (no necesita ms-crear ni ms-consultar)
bash services/ms-consultar/verificar.sh # ms-consultar de extremo a extremo, incluido apagarlo, encenderlo y escalarlo
bash services/ms-log/verificar.sh       # ms-log de extremo a extremo: filtros, paginación y registro de n8n con su llave
bash services/verificar-indexacion.sh   # avisos a n8n de crear, modificar y borrar (con un espía; y el camino real si hay GEMINI_API_KEY)
bash frontend/verificar.sh              # frontend: Nginx, config.js, convivencia con /api y login con PKCE como lo hace keycloak-js
npx newman run tests/postman/gdp.postman_collection.json -e tests/postman/gdp-local.postman_environment.json --env-var "passwordAdmin=..." ...   # colección de Postman (T19): todos los endpoints y permisos; el comando completo con las contraseñas de .env está en tests/postman/README.md
(cd frontend && npm install && npm test)   # menú por rol y pantallas (Vitest, sin contenedores)
bash n8n/configurar.sh                  # una vez, y cada vez que cambien los flujos o una contraseña: credenciales, flujos y webhook activo
bash n8n/verificar.sh                   # indexación por webhook, reindexación completa y permisos de usr_n8n, con Gemini real
bash database/cargar-datos-prueba.sh    # 20 personas ficticias con su registro CREAR en el log; se puede repetir. Después, «Reindexar todo» en n8n
```

Si ya habías arrancado el proyecto antes de T03, tu base de datos local no tiene las tablas: completa las `DB_PASSWORD_*` en tu `.env` y recrea el volumen con `docker compose down -v` antes de volver a arrancar.

Usuarios de prueba de la aplicación: `admin.prueba` (rol `administrador`) y `consultor.prueba` (rol `consultor`). Sus contraseñas son las que pongas en `KEYCLOAK_USUARIO_ADMIN_PASSWORD` y `KEYCLOAK_USUARIO_CONSULTOR_PASSWORD`. La consola de Keycloak está en <http://localhost:8080> y se entra con `KEYCLOAK_ADMIN` y `KEYCLOAK_ADMIN_PASSWORD`.

Notas:

- PostgreSQL no publica puertos. Para entrar a la base de datos se usa `docker compose exec postgres psql ...`.
- `database/init.sql` e `init-usuarios.sh` solo se ejecutan cuando el volumen `pgdata` está vacío. Si cambian, o si cambia una `DB_PASSWORD_*`, hay que recrear el volumen con `docker compose down -v` (borra los datos locales) y volver a arrancar.
- Keycloak importa `keycloak/realm.json` solo si el realm no existe. Si cambia el archivo o una contraseña de los usuarios de prueba, hay que borrar el volumen `keycloak_data` (pasos en `keycloak/README.md`).
- Para apagar todo: `docker compose --profile consultar down`.

Configuración inicial de n8n (una sola vez): `bash n8n/configurar.sh` carga las credenciales de PostgreSQL y Gemini desde `.env`, importa los flujos de `n8n/workflows` y publica el de indexación. La cuenta de administrador se crea a mano en <http://localhost:5678>. Detalles, y cómo ejecutar la reindexación completa, en `n8n/README.md`. La guía completa en un equipo limpio es la tarea T20.

## 4. Convenciones

- **Ramas:** una rama por tarea, con el ID de la tarea: `feat/T06-ms-crear`, `fix/T12-validacion-fecha`. Nunca se trabaja directo en `main`, salvo para reservar tareas (sección 6).
- **Commits:** en español, con prefijo: `feat:`, `fix:`, `docs:`, `chore:`, `test:`. Ejemplo: `feat(ms-crear): validar documento duplicado`.
- **Pull requests:** toda rama entra a `main` por pull request. No hace falta esperar la revisión de otro integrante: quien hace la tarea comprueba que funciona, abre el pull request y hace el merge. Pedir una revisión es opcional, y conviene cuando el cambio afecta a otros (sección 8, punto 4).
- **Nombres:** los nombres del dominio siguen el diseño, en español (`persona`, `numeroDocumento`, `log_transaccion`). En TypeScript se usa camelCase y en la base de datos snake_case.
- **Secretos:** nunca se suben llaves ni contraseñas. Solo `.env.example` con los nombres de las variables.
- **Zonas de trabajo:** cada tarea indica su carpeta. Tocar carpetas de otra tarea en curso requiere avisar al responsable.

## 5. Estado actual

**Hecho:**
- T01: estructura del monorepo con un `README.md` en cada carpeta que aún no tiene código, documentación copiada en `docs/`, `README.md`, `CONTEXTO.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.gitattributes` y `.env.example` con todas las variables previstas.
- T02: `docker-compose.yml` base con las redes `frontal` y `datos`, los volúmenes `pgdata`, `n8n_data` y `keycloak_data`, Traefik y PostgreSQL 16 con pgvector. Probado el 2026-11-16: los dos contenedores quedan `healthy`, Traefik responde en el puerto 80, la extensión `vector` funciona y PostgreSQL solo está en la red `datos`, sin puertos publicados. Keycloak, n8n, el frontend y los microservicios quedan como bloques comentados (incluido el perfil `consultar`).
- T03: `database/init.sql` con las tablas `persona`, `log_transaccion` y `persona_embedding`, la vista `vista_personas`, los índices del log, los seis usuarios de base de datos y sus permisos. `database/init-usuarios.sh` les asigna las contraseñas de `.env`. `database/verificar.sh` comprueba todo; probado el 2026-11-16 sin fallos. Lo que debe saber quien programe contra la base está en `database/README.md`.
- T04: Keycloak 26.8 en Compose con importación automática de `keycloak/realm.json`: realm `gestion-personas`, roles `administrador` y `consultor`, cliente `frontend` (código de autorización con PKCE obligatorio), cliente `pruebas` (tokens para Postman y scripts) y usuarios `admin.prueba` y `consultor.prueba` con contraseñas tomadas de `.env`. Tokens de 5 minutos. `keycloak/verificar.sh` comprueba todo, incluido el login completo con PKCE; probado el 2026-11-16 sin fallos. Lo que deben saber T05 y T11 está en `keycloak/README.md`.
- T05: librería `@gdp/common` en `libs/common` (workspaces de npm): entidades `Persona` y `LogTransaccion`, DTO con las validaciones de la sección 3.3, guard JWT con roles, filtro que registra en el log las peticiones rechazadas y `AuditoriaService` para registrar las exitosas dentro de su transacción. `ComunModule.forRoot()` lo configura todo con un solo import. Probado el 2026-11-16: 51 pruebas unitarias y 13 de integración contra PostgreSQL y Keycloak reales, sin fallos; además se construyó en Docker un servicio de ejemplo que respondió a través de Traefik. **Quien vaya a hacer un microservicio (T06 a T10) debe leer `libs/common/README.md`**: tiene las tres reglas y la plantilla probada (package.json, main.ts, Dockerfile).
- T06: `ms-crear` en Compose, con `POST /api/crear/personas` (formulario `multipart` con foto opcional, o JSON). Crea la persona y su log en una transacción; responde 201, 400 con la lista de campos, 403 y 409, y todos los rechazos quedan en el log. OpenAPI en `/api/crear/docs`. `services/ms-crear/verificar.sh` lo comprueba por el gateway (36 comprobaciones, sin fallos el 2026-11-16). `services/verificar-comun.sh` tiene las funciones que reutilizan los `verificar.sh` de los demás servicios. Falta el aviso a n8n, que es la tarea T16.
- T07: `ms-modificar` en Compose, con `GET` y `PUT /api/modificar/personas/{documento}`. La búsqueda previa es propia (no depende de ms-consultar), devuelve la foto y queda en el log como `CONSULTAR` con su contexto. La modificación y su log van en una transacción; el log guarda el valor anterior y el nuevo de los campos que cambiaron. La foto se reemplaza, se conserva o se quita con `eliminarFoto`. `services/ms-modificar/verificar.sh` lo comprueba por el gateway (50 comprobaciones, sin fallos el 2026-11-16). Falta el aviso a n8n (T16).
- T08: `ms-consultar` en el perfil `consultar` de Compose, con `GET /api/consultar/personas/{documento}` para los dos roles (ficha completa con foto, log `CONSULTAR` en la misma transacción) y `GET /api/consultar/health` sin token (200, o 503 si no llega a la base de datos; con el contenedor apagado, Traefik responde 404). Tiene healthcheck en Compose, así que Traefik solo usa réplicas listas. `services/ms-consultar/verificar.sh` lo comprueba por el gateway, incluido apagarlo, encenderlo y escalarlo a tres réplicas (27 comprobaciones, sin fallos el 2026-11-17).
- T09: `ms-borrar` en Compose, con `GET` y `DELETE /api/borrar/personas/{documento}`, solo para el administrador. La búsqueda previa es propia (no depende de ms-consultar), devuelve la foto para revisar antes de confirmar y queda en el log como `CONSULTAR` con el contexto «Búsqueda previa a un borrado». El borrado responde 204 y va con su log en una transacción; el detalle guarda los datos que tenía la persona, así su historial queda completo (CP-05). `services/ms-borrar/verificar.sh` lo comprueba por el gateway (34 comprobaciones, sin fallos el 2026-11-19). Falta el aviso a n8n (T16).
- T10: `ms-log` en Compose, con `GET /api/log` para los dos roles (filtros opcionales `tipo`, `documento`, `desde` y `hasta`, que se combinan; fechas como días completos en hora de Bogotá; paginación con `pagina` y `tamano`; del más reciente al más antiguo) y `POST /api/log/consulta-nl` para n8n, protegido con la llave `N8N_LOG_API_KEY` en la cabecera `X-API-Key` (registra `CONSULTA_NL` con pregunta, respuesta y resultado). Los contratos exactos, para T13 y T15, están en `services/ms-log/README.md`. `services/ms-log/verificar.sh` lo comprueba por el gateway (49 comprobaciones, sin fallos el 2026-11-21), incluido CP-05 y CP-06.
- T11: `frontend` (React 19, Vite 7, TypeScript 5.9) en Compose, servido con Nginx en <http://localhost>. Login con `keycloak-js` (código de autorización con PKCE, renovación automática del token, cierre de sesión), menú principal con solo las opciones del rol, rutas protegidas por rol, Consultar marcado «No disponible» si su health no responde, y el chat de n8n en una pestaña nueva (sin configurar hasta T15). Las cinco pantallas son marcadores que llenan T12 y T13; **quien haga T12 o T13 debe leer `frontend/README.md`**: tiene `pedirApi` para llamar a la API y dónde va cada pantalla. `frontend/verificar.sh` lo comprueba por el gateway (31 comprobaciones, sin fallos el 2026-11-21) y `npm test` dibuja el menú y las rutas por rol (18 pruebas). Probado en navegador hasta la página de login de Keycloak.
- T14: `n8n` 2.48.7 en Compose (puerto 5678, redes `frontal` y `datos`, healthcheck) con dos flujos en `n8n/workflows`. **Indexar persona** es el webhook `POST /webhook/indexar-persona` que llamarán ms-crear, ms-modificar y ms-borrar: responde 202 enseguida, lee la persona en `vista_personas`, arma su descripción, obtiene el embedding con Gemini (`gemini-embedding-001`, 3072 dimensiones) y deja un solo vector por persona en `persona_embedding` (o ninguno si fue borrada). **Reindexar todo**, de ejecución manual, reconstruye todos los vectores sin perder el índice anterior si Gemini falla. `n8n/configurar.sh` carga las credenciales desde `.env` sin escribirlas en el repositorio, importa y publica los flujos. **Quien haga T15 o T16 debe leer `n8n/README.md`**: tiene el contrato del webhook y cómo leer los vectores. `n8n/verificar.sh` lo comprueba con Gemini y PostgreSQL reales (44 comprobaciones, sin fallos el 2026-11-21), incluidos tres avisos simultáneos y los permisos de `usr_n8n` (CP-10).
- T12: pantallas **Crear personas** (`/crear`) y **Modificar datos personales** (`/modificar`) en el frontend, con un solo `FormularioPersona` que sigue el prototipo del enunciado (identificación con la foto a la derecha y, debajo de una línea, el contacto). Valida en el navegador las reglas de la sección 3.3 con los mismos mensajes del servidor, al salir de cada campo y al guardar; la fecha se elige en un calendario o se escribe como `dd-mmm-yyyy`, y la foto se revisa (JPG o PNG, 2 MB) antes de enviarla. Los 400 y el 409 de la API se muestran junto a su campo. Modificar empieza con una búsqueda por documento, el documento queda de solo lectura y la foto se reemplaza, se conserva o se quita. 44 pruebas nuevas en `npm test` (62 en total) y prueba completa en el navegador con `admin.prueba` el 2026-11-22: crear con y sin foto, errores en el navegador y del servidor, documento repetido, documento inexistente y dos modificaciones, con el log revisado en la base de datos. **Quien haga T13 debe leer `frontend/README.md`**: `BusquedaPorDocumento` y `Alerta` sirven para Consultar y Borrar.
- T17: `database/datos-prueba.sql` y `database/cargar-datos-prueba.sh`: 20 personas ficticias (17 con cédula y 3 con tarjeta de identidad, todos los géneros, con y sin segundo nombre, sin foto; incluye a Pedro Andrés Pérez Gómez y a Andrea Gómez Peña, los de los ejemplos del diseño) y un registro `CREAR` en el log por cada una, con el usuario `datos-prueba` y el mismo detalle que escribe ms-crear. Se ejecuta con el superusuario, en una sola sentencia SQL: una persona que ya existe no se vuelve a insertar ni recibe otro registro de log, así que repetir el script no duplica nada. No usa Keycloak, tokens ni microservicios. Probado el 2026-11-22 contra PostgreSQL 16 con el esquema de `init.sql`: primera carga (20 y 20), repetición sin cambios, persona existente creada por otro medio sin log nuevo, y persona borrada que vuelve a cargarse con su registro. Después de cargar hay que ejecutar «Reindexar todo» en n8n (sección 7.2 del diseño).
- T16: ms-crear, ms-modificar y ms-borrar avisan a n8n (`POST N8N_WEBHOOK_INDEXACION_URL` con `{ numeroDocumento, operacion }`) después de confirmar la transacción y sin esperar la respuesta, con `AvisoIndexacionService` de `libs/common`. Nunca falla la operación: si n8n está apagado, tarda más de 5 s o responde con error, el servicio responde igual y deja una advertencia en su log. Solo se avisa cuando la operación salió bien, y ms-modificar solo si cambió algún dato (no por la foto). `services/verificar-indexacion.sh` lo comprueba con un espía en lugar de n8n y, si n8n y Gemini están configurados, también el camino real (35 comprobaciones sin fallos el 2026-11-23; la parte real con Gemini queda pendiente de una `GEMINI_API_KEY`). 5 pruebas unitarias nuevas en `libs/common` (56 en total). **Para T18:** los servicios de crear, modificar y borrar reciben ahora `AvisoIndexacionService` en el constructor; en las pruebas unitarias se simula con `{ avisar: jest.fn() }`.
- T19: colección de Postman en `tests/postman` (`gdp.postman_collection.json` y `gdp-local.postman_environment.json`): 54 peticiones y 80 comprobaciones sobre los cinco microservicios, por el gateway y con tokens reales de Keycloak (cliente `pruebas`, usuarios `admin.prueba` y `consultor.prueba`, que un script de la colección renueva antes de los 5 minutos). Cubre CP-01 a CP-06 y CP-08, y el historial completo del log después de borrar (CP-05), sobre una persona ficticia propia, el documento `9999980001`, que borra al empezar y al terminar, así que se puede repetir. El entorno va con las contraseñas y la llave de API vacías: se llenan con las de `.env` y no se suben al repositorio. Se corre en Postman (*Run collection*) o con `npx newman run ...` (comando completo en `tests/postman/README.md`). No cubre la foto (se prueba con `bash services/ms-crear/verificar.sh` y la pantalla Crear), CP-07 (apagar ms-consultar, a mano) ni CP-09 y CP-10 (dependen de T15). Probado el 2026-11-22 con newman contra el sistema real: 54 peticiones y 80 comprobaciones sin fallos.
- T18: pruebas unitarias (Jest) de los cinco microservicios, que antes no tenían: 94 pruebas en `services/*/src/*.spec.ts` (ms-crear 11, ms-modificar 21, ms-consultar 11, ms-borrar 11, ms-log 40), que se suman a las 56 de `libs/common`. Prueban la lógica de cada servicio con una base de datos falsa (`services/pruebas-comunes.ts`), que anota en qué orden pasó todo: la operación y su log se escriben con el mismo manager de la transacción y antes del commit, el aviso a n8n va después y solo si la transacción se confirmó, y si el log falla la operación se deshace (DD-02, RF-08). Cubren CP-01, CP-02, CP-04 y CP-05 en la lógica, los 404 y los borrados simultáneos, la foto (agregada, reemplazada, eliminada o conservada), que el número de documento no se cambie, el health de ms-consultar (200 y 503), los filtros y la paginación de ms-log (CP-06) con su validación, la llave de API de n8n y los permisos de cada ruta (RNF-01: solo el administrador escribe; Consultar y el log los usan los dos roles; la ruta de n8n es pública para el guard JWT pero la protege su llave). Se ejecutan con `npm test` desde la raíz, o `npm test -w ms-crear` para un servicio. La configuración común está en `services/jest.base.js` y carga `@gdp/common` desde su código fuente, sin compilarlo antes. Las pruebas de integración (la operación y su log en la misma transacción contra PostgreSQL y Keycloak reales) siguen en `libs/common` (T05, `bash libs/common/pruebas-integracion.sh`), y cada servicio se comprueba de extremo a extremo con su `verificar.sh` y con la colección de Postman (T19). Se comprobó que las pruebas detectan errores: se rompió el código a propósito de 13 maneras (quitar la validación del documento repetido, escribir el log fuera de la transacción, quitar el bloqueo de la fila, avisar a n8n sin que cambiara nada, aceptar cualquier llave de API, entre otras) y en cada caso falló alguna prueba. Los `tsconfig.json` de los servicios excluyen los `*.spec.ts`, así que la imagen de Docker no los compila. Probado el 2026-11-23: `npm test` (150 pruebas, sin fallos) y compilación de la librería y de los cinco servicios.
- T13: pantallas **Consultar datos personales** (`/consultar`, los dos roles), **Borrar personas** (`/borrar`, administrador) y **Consultar log** (`/log`, los dos roles). Consultar y Borrar buscan por documento con la `BusquedaPorDocumento` de T12 y muestran una `FichaPersona` de solo lectura con la foto; Borrar pide confirmación nombrando a la persona (foco en «Cancelar») y solo entonces llama a `DELETE`. El log tiene filtros de tipo, documento y fechas que se combinan, tabla de 20 en 20 con fecha y hora en hora de Bogotá, un resumen legible del detalle y «Ver detalle completo». Si un servicio está apagado, `pedirApi` lo informa como «no disponible» y no como «persona inexistente». Ya no quedan pantallas en construcción. 20 pruebas nuevas en `npm test` (82 en total) y prueba completa en el navegador el 2026-11-23: con `admin.prueba`, consulta, documento inexistente, ms-consultar apagado y encendido (CP-07), borrado cancelado y confirmado, historial del borrado en el log (CP-05), paginación y filtros combinados con 25 registros de prueba (CP-06), sin resultados y fechas al revés; con `consultor.prueba`, menú de tres opciones, consulta, log y aviso de permiso en `/borrar`.

**Todavía no existe:** el flujo de chat de n8n (T15). La base de datos arranca vacía: los datos de prueba se cargan con `bash database/cargar-datos-prueba.sh` (T17), y después hay que ejecutar «Reindexar todo» en n8n.

**En curso:** ver la columna Estado del tablero.

**Bloqueos o problemas conocidos:**
- (ninguno)

**Avisos para el equipo:**
- 2026-11-21, T14 (Claudia Elias): cambió `docker-compose.yml` (sección 8, punto 4).
  - `N8N_ENCRYPTION_KEY` ahora es obligatoria: sin ella `docker compose` no arranca. Después del pull, pon en tu `.env` una cadena aleatoria larga (en Git Bash: `openssl rand -hex 32`) y no la cambies después. Para indexar hace falta además `GEMINI_API_KEY` (gratis en Google AI Studio).
  - Después de arrancar, ejecuta una vez `bash n8n/configurar.sh`. El puerto 5678 debe estar libre.
  - La cuenta de administrador de n8n es local: cada quien crea la suya en <http://localhost:5678>, con el correo y la contraseña que quiera. No es una cuenta de n8n.io, no envía correos y se pierde con `docker compose down -v`. Detalles y una prueba manual paso a paso en `n8n/README.md`.
  - T15 y T16 deben leer `n8n/README.md`, que tiene el contrato del webhook de indexación y cómo están guardados los vectores. Las decisiones están en la sección 7.
- 2026-11-21, T10 (Claudia Elias): cambiaron `docker-compose.yml` y dos contratos de API (sección 8, punto 4).
  - `N8N_LOG_API_KEY` ahora es obligatoria: sin ella `docker compose` no arranca, ni siquiera para levantar solo `postgres`. Después del pull, pon en tu `.env` una cadena aleatoria larga (en Git Bash: `openssl rand -hex 32`). Cada equipo usa la suya; en T15 la misma llave se configura dentro de n8n.
  - T13 (pantalla del log) y T15 (registro de las consultas de n8n) deben leer `services/ms-log/README.md`, que tiene los contratos de `GET /api/log` y `POST /api/log/consulta-nl`. Las decisiones están en la sección 7.

### Siguiente paso recomendado

La siguiente tarea a tomar es la primera del tablero que esté **Pendiente**, sin responsable y con todas sus dependencias en **Hecha**. Si hay varias disponibles, se prefiere la de la fase más temprana. La IA debe calcular esto leyendo el tablero, y no adivinarlo.

Fases: Fase 0, base del repositorio (T01 y T02). Fase 1, cimientos (T03 a T05). Fase 2, frentes paralelos (T06 a T19). Fase 3, integración y entrega (T20 y T21).

## 6. Tablero de tareas

Estados posibles: **Pendiente**, **En curso**, **Hecha**.

| ID | Tarea | Carpeta principal | Depende de | Estado | Responsable | Rama |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Estructura del monorepo, README, CONTEXTO.md, AGENTS.md, CLAUDE.md, .gitignore, .env.example | raíz, docs/ | | Hecha | Carlos Ruidiaz | main (commit inicial) |
| T02 | docker-compose.yml base: redes frontal y datos, volúmenes, Traefik, PostgreSQL con pgvector, perfil `consultar` | raíz | T01 | Hecha | Carlos Ruidiaz | main (commit inicial) |
| T03 | `database/init.sql`: tablas, vista_personas, índices, usuarios de BD y permisos | database/ | T02 | Hecha | Carlos Ruidiaz | feat/T03-base-de-datos |
| T04 | Keycloak: realm.json con cliente del frontend (PKCE), roles, usuarios de prueba e importación automática | keycloak/ | T02 | Hecha | Carlos Ruidiaz | feat/T04-keycloak |
| T05 | `libs/common`: entidad Persona, DTO y validaciones, guard JWT con roles, módulo de auditoría transaccional | libs/common/ | T03, T04 | Hecha | Carlos Ruidiaz | feat/T05-libs-common |
| T06 | ms-crear | services/ms-crear/ | T05 | Hecha | Carlos Ruidiaz | feat/T06-ms-crear |
| T07 | ms-modificar (búsqueda previa + actualización) | services/ms-modificar/ | T05 | Hecha | Carlos Ruidiaz | feat/T07-ms-modificar |
| T08 | ms-consultar con endpoint health y perfil de Compose | services/ms-consultar/ | T05 | Hecha | Carlos Ruidiaz | feat/T08-ms-consultar |
| T09 | ms-borrar (búsqueda previa + borrado) | services/ms-borrar/ | T05 | Hecha | Carlos Ruidiaz | feat/T09-ms-borrar |
| T10 | ms-log: consulta con filtros y endpoint para n8n con llave de API | services/ms-log/ | T05 | Hecha | Claudia Elias | feat/T10-ms-log |
| T11 | Frontend base: login con Keycloak, menú por rol, Dockerfile con Nginx | frontend/ | T04 | Hecha | Carlos Ruidiaz | feat/T11-frontend-base |
| T12 | Formulario de persona con validaciones (crear y modificar) | frontend/ | T11, T06, T07 | Hecha | Claudia Elias | feat/T12-formulario-persona |
| T13 | Pantallas de consultar, borrar y log | frontend/ | T11, T08, T09, T10 | Hecha | Claudia Elias | feat/T13-consultar-borrar-log |
| T14 | n8n en Compose, flujo de indexación por webhook y flujo de reindexación completa | n8n/ | T03 | Hecha | Claudia Elias | feat/T14-n8n-indexacion |
| T15 | Flujo de chat: agente con herramientas SQL y vectorial, Gemini, memoria y registro en ms-log | n8n/ | T14, T10 | Pendiente | | |
| T16 | Llamadas al webhook de indexación desde ms-crear, ms-modificar y ms-borrar | services/ | T06, T07, T09, T14 | Hecha | Carlos Ruidiaz | feat/T16-aviso-indexacion |
| T17 | Script de datos de prueba (unas 20 personas ficticias) | database/ | T03 | Hecha | Juan Fernández | feat/T17-datos-de-prueba |
| T18 | Pruebas unitarias y de integración (Jest) | services/, libs/ | T06 a T10 | Hecha | Juan Fernández | feat/T18-pruebas-jest |
| T19 | Colección de Postman con todos los endpoints y permisos | tests/postman/ | T06 a T10 | Hecha | Juan Fernández | feat/T19-coleccion-postman |
| T20 | Guía de configuración inicial de n8n y prueba completa en un equipo limpio | docs/ | T15, T16, T17 | Pendiente | | |
| T21 | Opcional: despliegue en Azure for Students | | T20 | Pendiente | | |

Después de T05, el trabajo se puede repartir en cuatro frentes paralelos con poco cruce: microservicios (T06 a T10), frontend (T11 a T13), n8n (T14 a T16) y calidad (T17 a T19).

### 6.1 Notas de traspaso

Una nota por cada tarea **En curso**, para que cualquiera (incluida otra persona o su IA) pueda retomarla sin preguntar. Se actualiza al cerrar cada sesión de trabajo, aunque la tarea no esté terminada, y se borra cuando la tarea pasa a **Hecha**.

Formato de cada nota:

```
#### TXX · Nombre de la tarea (Responsable, rama, AAAA-MM-DD)
- Hecho: qué quedó funcionando y probado.
- Falta: qué queda pendiente, en orden.
- Para retomar: archivos clave, comandos, decisiones a medias o problemas encontrados.
```

(No hay tareas en curso.)

## 7. Decisiones tomadas durante la implementación

Registro de cualquier decisión que cambie o precise el diseño. La más reciente arriba.

| Fecha | Decisión | Motivo | Quién |
| --- | --- | --- | --- |
| 2026-11-23 | Las pruebas unitarias de los servicios usan una base de datos falsa (`services/pruebas-comunes.ts`) y cargan `@gdp/common` desde `libs/common/src` con `moduleNameMapper` y `paths` (`services/tsconfig.test.json`), así `npm test` no necesita compilar la librería ni contenedores. Los `tsconfig.json` de los servicios excluyen `src/**/*.spec.ts`. No se agregaron dependencias: Jest, ts-jest y los tipos ya los instala `libs/common` (el `package-lock.json` no cambia) | Que cualquiera pueda correr las pruebas con `npm install && npm test`, y que la compilación de Docker (`tsc` con `types: ["node"]`) no falle por los archivos de prueba. Las pruebas de integración con la base de datos real siguen en `libs/common`, que ya las tenía desde T05 | Juan Fernández |
| 2026-11-23 | La pantalla del log muestra la fecha y hora en la zona `America/Bogota`, fija en el frontend, como `dd-mmm-yyyy hh:mm:ss`. Los filtros de fecha se eligen con un calendario y viajan como `yyyy-mm-dd` | ms-log interpreta `desde` y `hasta` como días completos en su `TZ` (America/Bogota). Mostrar la hora en esa misma zona hace que lo que se ve coincida con lo que se filtra, aunque el navegador esté en otra zona | Claudia Elias |
| 2026-11-23 | En el frontend, un 404 o un 502 sin cuerpo JSON se trata como «servicio no disponible» (`ErrorApi` con estado 503) | Con un microservicio apagado, Traefik responde 404 con texto plano. Sin esta regla, Consultar, Borrar o Modificar dirían «No hay una persona registrada» cuando el problema es que el servicio no está. Un 404 de un microservicio siempre trae JSON con su mensaje | Claudia Elias |
| 2026-11-23 | ms-modificar avisa a n8n solo si cambió algún dato de la persona. Cambiar solo la foto, o guardar sin cambios, no avisa. ms-crear y ms-borrar avisan siempre que la operación sale bien. Ningún rechazo (400, 403, 404, 409) avisa | La foto no forma parte del texto indexado (`n8n/README.md`), así que reindexar en esos casos solo gastaría cuota gratuita de Gemini sin cambiar el vector | Carlos Ruidiaz |
| 2026-11-23 | El aviso a n8n espera como máximo 5 segundos y nunca lanza errores; un fallo solo deja una advertencia en el log del contenedor. `N8N_WEBHOOK_INDEXACION_URL` es opcional en los servicios: vacía, no se avisa | El diseño pide que una falla de n8n no afecte la operación. El límite evita conexiones colgadas si n8n deja de responder | Carlos Ruidiaz |
| 2026-11-22 | Los datos de prueba (T17) se cargan directo a PostgreSQL con el superusuario, no por la API, e incluyen un registro `CREAR` en el log por cada persona insertada (usuario `datos-prueba`). El script es idempotente: usa `INSERT ... ON CONFLICT DO NOTHING` y escribe el log solo de las filas realmente insertadas | Funciona sin Keycloak, sin tokens y sin microservicios, así que no falla por algo ajeno. Cumple el RNF-02 (todas las transacciones en el log) y la pantalla del log (T13) tiene datos reales para las demostraciones. El usuario propio distingue estos registros de los de usuarios reales. Por la API habría que sacar tokens, hacer 20 llamadas y igual reindexar, porque los avisos a n8n aún no existen (T16). La prueba completa de T20 puede crear una o dos personas desde la interfaz para mostrar el recorrido real | Juan Fernández |
| 2026-11-22 | El frontend repite en `frontend/src/persona/` las listas, las reglas de la sección 3.3 y sus mensajes, y el manejo de la fecha de `libs/common`. Si cambia una regla en `libs/common`, hay que cambiarla también ahí. El correo se valida en el navegador con la regla de `persona_correo_chk`; el servidor es más estricto y su 400 se muestra junto al campo | El frontend no está en los workspaces de npm y no comparte código con los servicios (decisión de T11). Así el usuario lee el mismo mensaje venga el error del navegador o del servidor | Claudia Elias |
| 2026-11-22 | Después de un `PUT` exitoso, Modificar no vuelve a buscar la persona: arma la foto con el archivo enviado (o la quita) a partir de la respuesta, que no trae la imagen | Otra búsqueda dejaría en el log un `CONSULTAR` que el usuario no pidió | Claudia Elias |
| 2026-11-21 | n8n fijado en `n8nio/n8n:2.48.7`, la versión que n8n marca como `stable`. No se usa n8n 3 aunque ya existe. Base interna de n8n en SQLite, dentro del volumen `n8n_data` | Mismo criterio de versiones de la sección 7: una mayor nueva tiene poco recorrido. SQLite basta para un solo equipo y no mezcla los datos de n8n con los de la aplicación | Claudia Elias |
| 2026-11-21 | Contrato del webhook de indexación: `POST http://n8n:5678/webhook/indexar-persona` con `{ numeroDocumento, operacion }` (`CREAR`, `MODIFICAR` o `BORRAR`); responde 202 antes de indexar y 400 si el aviso no es válido. El flujo no usa los datos de la persona del aviso: la lee en `vista_personas` y, si no existe, borra su vector. El webhook no lleva llave. T16 depende de este contrato | Así el aviso no puede introducir datos falsos en el índice, repetirlo no hace daño y el orden de los avisos no importa. Sin llave, lo peor que puede hacer alguien desde el equipo es reindexar una persona que ya existe | Claudia Elias |
| 2026-11-21 | Embeddings con `models/gemini-embedding-001` (3072 dimensiones), un vector por persona. `persona_embedding` sigue sin dimensión fija y sin índice vectorial: con unas 20 personas la búsqueda exacta es inmediata, y el índice HNSW de pgvector no admite más de 2000 dimensiones. T15 debe usar el mismo modelo para buscar | Es el modelo de embeddings de Gemini disponible en n8n y en el nivel gratuito. Sin cambios en `init.sql` no hay que recrear `pgdata` | Claudia Elias |
| 2026-11-21 | La metadata de cada vector lleva `indexado_en`. Al terminar, el flujo de indexación borra las versiones anteriores del mismo documento, y la reindexación completa borra el índice viejo solo después de guardar el nuevo | Dos avisos casi simultáneos del mismo documento (crear y modificar enseguida) podían dejar dos vectores. Si Gemini falla a mitad de una reindexación, el índice anterior se conserva | Claudia Elias |
| 2026-11-21 | `n8n/configurar.sh` crea las credenciales de PostgreSQL (`usr_n8n`) y Gemini desde `.env` con la CLI de n8n, con ids fijos (`gdpCredPostgres1`, `gdpCredGemini001`) que los flujos exportados usan. También importa y publica los flujos. La cuenta de administrador de n8n sigue siendo manual | El diseño pide cargar credenciales e importar flujos a mano. Con el script esos pasos no tienen errores de tecleo, los flujos funcionan al importarlos y las pruebas se pueden automatizar. Los valores pasan al contenedor por la entrada estándar y n8n los guarda cifrados: no quedan en el repositorio | Claudia Elias |
| 2026-11-21 | La ruta del frontend en Traefik es `PathPrefix(/) && !PathPrefix(/api)`, con prioridad 1 | Si el frontend atendiera también `/api`, con ms-consultar apagado `/api/consultar/health` respondería 200 con la página de la aplicación, y el menú lo daría por disponible (rompería DD-04 y CP-07). Así, una ruta de un servicio apagado responde 404 desde Traefik | Carlos Ruidiaz |
| 2026-11-21 | Frontend: React 19, Vite 7, React Router 7, TypeScript 5.9, Vitest 4 y `keycloak-js` 26 (el adaptador oficial de Keycloak, que hace PKCE y renueva el token). No se usan Vite 8, React Router 8 ni TypeScript 7 aunque ya existen. El frontend no entra en los workspaces de npm: tiene su propio `package-lock.json` y se construye con el contexto en `frontend/` | Las mismas razones de la decisión de versiones de los servicios: versiones mayores recientes con poco recorrido. El frontend no comparte código con `libs/common` | Carlos Ruidiaz |
| 2026-11-21 | El frontend lee su configuración (URL de Keycloak, realm, cliente y `N8N_CHAT_URL`) de `/config.js`, que Nginx genera al arrancar desde `.env`, y no de variables de Vite fijadas al compilar | La misma imagen sirve en cualquier equipo o en Azure (T21) cambiando solo `.env`. Son datos públicos: el cliente `frontend` no tiene secreto | Carlos Ruidiaz |
| 2026-11-21 | `POST /api/log/consulta-nl` no usa token de Keycloak: va con `@Publico()` y un guard propio que compara la cabecera `X-API-Key` con `N8N_LOG_API_KEY` (comparación de tiempo constante). Sin llave o con una distinta responde 401 y no se registra. Con la llave correcta, n8n queda como usuario `n8n`, así un 400 sí queda en el log como `CONSULTA_NL` `ERROR`. Cuerpo: `pregunta` (obligatoria, hasta 4000), `respuesta` (opcional, hasta 20000), `resultado` (`EXITO` o `ERROR`) y `detalle` (objeto opcional). Responde 201, o 500 si no pudo escribir. T15 depende de este contrato | El diseño solo dice «llave de API de n8n». El usuario `n8n` es «la cuenta de n8n» de la sección 6.2 del diseño | Claudia Elias |
| 2026-11-21 | `GET /api/log` responde `{ total, pagina, tamano, registros }`, del más reciente al más antiguo, con `pagina` (desde 1) y `tamano` (por defecto 20, máximo 100). `desde` y `hasta` son días completos en la zona horaria `TZ` (`hasta` incluido), como `yyyy-mm-dd` o `dd-mmm-yyyy`; `desde` posterior a `hasta` responde 400. Cada registro trae `id` (texto), `fechaHora` (ISO 8601, UTC) y las demás columnas en camelCase. T13 depende de este contrato | La sección 8.2 del diseño pide una tabla paginada y no fija el formato | Claudia Elias |
| 2026-11-21 | Consultar el log (`GET /api/log`) no se registra en el log, y la ruta no lleva `@Auditar` | La columna `tipo` no tiene un valor para esa operación y agregarlo obligaría a cambiar el esquema y recrear `pgdata` en todos los equipos. Registrarla como `CONSULTAR` mezclaría la revisión del log con las consultas de personas. El RF-08 se refiere a las transacciones sobre los datos personales | Claudia Elias |
| 2026-11-18 | El registro de log de un borrado (`BORRAR`, `EXITO`) guarda en el detalle `anterior` (los datos que tenía la persona, sin la foto ni las fechas de creación y actualización) y `teniaFoto` | La persona deja de existir y el log es lo único que queda de ella; así su historial se puede leer completo (CP-05) sin guardar la imagen | Carlos Ruidiaz |
| 2026-11-18 | ms-borrar no bloquea la fila con `SELECT ... FOR UPDATE` antes de borrar: busca la persona, la borra y, si el `DELETE` no afectó ninguna fila (otro borrado simultáneo ganó), responde 404 | En PostgreSQL, `FOR UPDATE` exige permiso de UPDATE, y `usr_borrar` solo tiene SELECT y DELETE (sección 6.3 del diseño). Ningún servicio sin UPDATE sobre una tabla puede usar `lock: pessimistic_write` en ella | Carlos Ruidiaz |
| 2026-11-17 | `GET /api/consultar/health` comprueba la base de datos: responde 200 si llega a ella y 503 si no. Con el contenedor apagado, Traefik responde 404. El frontend (T11, T13) debe tratar cualquier respuesta distinta de 200 como «Consultar no disponible». ms-consultar tiene un healthcheck en Compose sobre esa ruta | Un servicio que corre pero no llega a la base de datos tampoco puede consultar. Con el healthcheck, Traefik no envía peticiones a una réplica que todavía está arrancando | Carlos Ruidiaz |
| 2026-11-16 | En `PUT /api/modificar/personas/{documento}` se envían todos los campos del formulario. La foto se conserva si no llega archivo, y se quita con `eliminarFoto=true`. Un número de documento en el cuerpo se ignora. El log guarda anterior y nuevo solo de los campos que cambiaron | El diseño no detalla cómo quitar la foto ni el contenido exacto del detalle. El frontend (T12) depende de este contrato | Carlos Ruidiaz |
| 2026-11-16 | Todos los servicios devuelven una persona con la misma forma, `PersonaRespuesta` (en `libs/common`): los campos del formulario, `fechaNacimiento` como `yyyy-mm-dd`, `tieneFoto` y, solo donde se pide, `foto` como texto `data:image/...;base64,...` listo para un `<img>` | Un solo contrato para el frontend (T12 y T13). La foto en la misma respuesta evita una segunda petición con token | Carlos Ruidiaz |
| 2026-11-16 | `@Auditar` acepta un segundo parámetro de contexto (`CONTEXTO_PREVIO_MODIFICAR`, `CONTEXTO_PREVIO_BORRAR`) que se guarda en el detalle del log | El diseño pide que el detalle de las búsquedas previas indique que preceden a una modificación o a un borrado | Carlos Ruidiaz |
| 2026-11-16 | En las rutas con formulario `multipart`, el registro de log de un 403 queda sin número de documento | El guard rechaza la petición antes de que se lea el formulario. El usuario, el tipo y el resultado sí quedan | Carlos Ruidiaz |
| 2026-11-16 | Cada microservicio tiene un `verificar.sh` que lo prueba por el gateway con tokens reales, apoyado en `services/verificar-comun.sh` | Comprobar cada servicio de extremo a extremo sin esperar a Postman (T19) ni a Jest (T18) | Carlos Ruidiaz |
| 2026-11-16 | Los errores de validación responden 400 con `errores: [{ campo, mensaje }]` (un mensaje por campo, en español). La API recibe la fecha como `dd-mmm-yyyy` o `yyyy-mm-dd` y la guarda como `yyyy-mm-dd`. La foto llega como archivo `multipart`, no en el DTO | Concreta la sección 8.1 del diseño. El frontend (T12) depende de este formato | Carlos Ruidiaz |
| 2026-11-16 | El log de las peticiones rechazadas (400, 403, 404, 409 y 500) lo escribe un filtro global de `libs/common`; los servicios solo lanzan la excepción. El log de éxito lo escribe el servicio dentro de su transacción con `AuditoriaService`. Toda ruta protegida debe llevar `@Auditar(tipo)` | El 403 lo decide el guard antes de llegar al servicio, así que no se puede registrar desde el servicio. Una sola regla para los cinco servicios | Carlos Ruidiaz |
| 2026-11-16 | El repositorio usa workspaces de npm (`libs/*` y `services/*`) con un solo `package-lock.json` en la raíz. Los servicios dependen de `@gdp/common` y se construyen con el contexto de Docker en la raíz. Hay un `.dockerignore` en la raíz que deja fuera `.env` | Es la forma más simple de compartir la librería sin publicarla. Plantilla probada en `libs/common/README.md` | Carlos Ruidiaz |
| 2026-11-16 | Versiones: NestJS 11, TypeORM 0.3, TypeScript 5.9, Jest 29 y Node 24. No se usan NestJS 12, TypeORM 1 ni TypeScript 7 aunque ya existen. Todos los servicios deben usar las mismas | Son versiones mayores muy recientes, con menos documentación y ejemplos; las elegidas son estables y las conocen bien el equipo y las IA que usamos | Carlos Ruidiaz |
| 2026-11-16 | El guard JWT (T05) lee las llaves públicas por la URL interna (`http://keycloak:8080`) pero valida el emisor público (`http://localhost:8080/realms/gestion-personas`). No exige audiencia: el token no trae `aud`. Roles en `realm_access.roles`, usuario en `preferred_username` | Keycloak tiene la URL pública fija (`KC_HOSTNAME`) para que el emisor sea el mismo desde el navegador y desde Docker. Comprobado en T04 | Carlos Ruidiaz |
| 2026-11-16 | El realm tiene un segundo cliente, `pruebas`, que entrega tokens con usuario y contraseña. Es solo para Postman y scripts (T18, T19). El cliente `frontend` no lo permite y exige PKCE | El flujo con PKCE necesita un navegador; sin este cliente no se pueden automatizar las pruebas de la API. Es un agregado al diseño, no cambia el login de la aplicación | Carlos Ruidiaz |
| 2026-11-16 | Las contraseñas de los usuarios de prueba de Keycloak salen de `.env` (`KEYCLOAK_USUARIO_*_PASSWORD`); `realm.json` solo tiene la referencia a la variable. Roles en minúscula: `administrador` y `consultor` | Ninguna contraseña en el repositorio | Carlos Ruidiaz |
| 2026-11-16 | Keycloak corre en modo desarrollo (`start-dev`), con su base interna en el volumen `keycloak_data`, imagen `quay.io/keycloak/keycloak:26.8` | Es un despliegue local por HTTP. El modo producción exige HTTPS | Carlos Ruidiaz |
| 2026-11-16 | Se quita la revisión obligatoria de los pull requests y el estado «En revisión». Quien termina una tarea la marca **Hecha** en su rama y hace el merge de su propio pull request | Evitar que las tareas queden bloqueadas esperando a otro integrante. La reserva de tareas en `main` se mantiene | Carlos Ruidiaz |
| 2026-11-16 | Los servicios que insertan en el log no pueden usar `RETURNING` (no tienen SELECT sobre `log_transaccion`). El módulo de auditoría de T05 debe insertar con una consulta parametrizada propia, porque `save()` e `insert()` de TypeORM agregan `RETURNING id` | Es consecuencia de los permisos de la sección 6.3 del diseño, que se respetan tal cual. Comprobado en T03 | Carlos Ruidiaz |
| 2026-11-16 | El esquema lo define `database/init.sql`. TypeORM va con `synchronize: false` | Los usuarios de los servicios no pueden crear ni alterar tablas | Carlos Ruidiaz |
| 2026-11-16 | `persona_embedding` usa las columnas del nodo PGVector de n8n (`id`, `text`, `metadata`, `embedding`), con el documento en `metadata`, y no fija la dimensión del vector. Su dueño es `usr_n8n` | El diseño dice que la administra n8n. La dimensión depende del modelo de embeddings que elija T14 | Carlos Ruidiaz |
| 2026-11-16 | `persona` tiene restricciones CHECK que repiten las validaciones de la sección 3.3 (listas, sin números, formato de correo y celular, fecha no futura, foto JPG o PNG de hasta 2 MB). `foto_tipo` guarda el tipo MIME | Última barrera si alguien se salta el frontend y los DTO. No reemplaza las validaciones de los servicios, que son las que dan los mensajes | Carlos Ruidiaz |
| 2026-11-16 | Las contraseñas de los usuarios de BD las asigna `database/init-usuarios.sh` desde `.env`; `init.sql` crea los usuarios sin contraseña. El contenedor `postgres` exige las seis `DB_PASSWORD_*` | Concreta la decisión de abajo: ninguna contraseña en el repositorio | Carlos Ruidiaz |
| 2026-11-16 | Las contraseñas de los usuarios de base de datos por servicio se definen en `.env` (`DB_PASSWORD_CREAR`, etc.). T03 debe crear los usuarios leyendo esas variables, no con contraseñas escritas en `init.sql` | El diseño pide que ninguna contraseña quede en el repositorio (sección 9) | Carlos Ruidiaz |
| 2026-11-16 | `database/init.sql` existe desde T02 y solo activa la extensión `vector`. T03 lo completa. Si cambia, hay que recrear el volumen `pgdata` | Permite montar el archivo desde ya y comprobar pgvector | Carlos Ruidiaz |
| 2026-11-16 | Las redes tienen nombre fijo (`gdp_frontal`, `gdp_datos`) y los microservicios se construyen con el contexto en la raíz del repositorio | Traefik necesita saber por qué red llegar a los contenedores, y cada Dockerfile debe poder copiar `libs/common` | Carlos Ruidiaz |
| 2026-11-16 | Imágenes fijadas: `traefik:v3.6` y `pgvector/pgvector:pg16` | Traefik anterior a 3.6 no se conecta al Docker Engine 29 de las versiones recientes de Docker Desktop. El diseño ya pide PostgreSQL 16 | Carlos Ruidiaz |

## 8. Protocolo de trabajo en equipo

1. **Antes de empezar:** `git pull` en `main` y leer este documento. Después del pull, compara tu `.env` con `.env.example` y agrega las variables nuevas (las tareas van sumando variables obligatorias, y sin ellas `docker compose` no arranca). Si cambió `package-lock.json`, ejecuta `npm install` en la raíz.
2. **Reservar una tarea:** en `main`, cambia el estado de la tarea a **En curso** y pon tu nombre y el nombre de la rama. Haz un commit que solo toque este archivo (`docs: reservar T07`) y súbelo de inmediato. Si el push falla porque alguien subió antes, haz pull: si la tarea ya tiene responsable, elige otra.
3. **Trabajar:** crea la rama de la tarea y trabaja solo en su carpeta principal.
4. **Cambios que afectan a otros:** si modificas `libs/common`, el esquema de base de datos, `docker-compose.yml` o un contrato de API, regístralo en la sección 7 y avisa al grupo antes de hacer merge.
5. **Pausar:** si dejas la tarea a medias, sube tu rama y actualiza su nota de traspaso (sección 6.1) en `main` con un commit que solo toque este archivo, para que el resto vea dónde quedó.
6. **Terminar:** en tu misma rama, actualiza este documento: estado **Hecha**, lo que quedó hecho en la sección 5, cómo ejecutarlo en la sección 3 si cambió, las decisiones en la sección 7, y borra la nota de traspaso de la tarea. Comprueba que lo que hiciste funciona, abre el pull request y haz tú mismo el merge. Si el pull request tiene conflictos, intégrale `main` a tu rama y resuélvelos antes.
7. **Edita solo tus filas y tus notas.** Cada quien modifica únicamente las filas de sus propias tareas. Así casi nunca hay conflictos en este archivo.
8. **Al cerrar una sesión de trabajo**, actualiza la fecha de «Última actualización» y la fase actual si cambió.

## 9. Instrucciones para la IA

Si eres un asistente de IA trabajando en este repositorio:

1. Lee este documento completo antes de proponer o escribir código. Después lee las secciones del diseño (`docs/diseno/documento_diseno.md`) que tienen que ver con la tarea.
2. Al iniciar la sesión, después del `git pull`, compara los nombres de las variables de `.env` con los de `.env.example` y dile al usuario cuáles le faltan o están vacías. Nunca muestres ni copies los valores de `.env`. Si falta el archivo, indícale que copie `.env.example`.
3. Pregunta al usuario su nombre y qué tarea va a trabajar, o recomiéndale la siguiente según la sección 5. No trabajes en tareas que están **En curso** con otro responsable.
4. Respeta el diseño. Si algo del diseño no se puede implementar tal cual, propón la alternativa, explica el motivo y, si el usuario la acepta, regístrala en la sección 7.
5. Trabaja solo en la carpeta de la tarea, salvo que el usuario indique otra cosa.
6. Si vas a retomar una tarea en curso, lee primero su nota de traspaso en la sección 6.1.
7. Antes de terminar cada sesión, aunque la tarea no esté terminada, actualiza la nota de traspaso de la tarea (qué quedó hecho, qué falta y qué debe saber quien la retome) y el resto del documento según la sección 8. Dile al usuario qué cambió.
8. Nunca escribas llaves, contraseñas ni datos personales reales en el repositorio.
