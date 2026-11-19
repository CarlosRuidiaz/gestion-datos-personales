# CONTEXTO DEL PROYECTO

> Este es el documento de contexto del repositorio. Cualquier integrante del equipo, o la IA que use, debe leerlo completo antes de trabajar.
> Uso: haz `git pull`, abre tu IA en la carpeta del repositorio y pídele «Lee CONTEXTO.md y dime en qué estado está el proyecto y qué me toca hacer».

**Última actualización:** 2026-11-17, por Carlos Ruidiaz (tarea T08)
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
cp .env.example .env        # completar llaves y contraseñas (hoy son obligatorias POSTGRES_PASSWORD, las seis DB_PASSWORD_* y las tres de Keycloak)
docker compose --profile consultar up -d --build
```

Qué arranca hoy: `gateway` (Traefik), `postgres` (PostgreSQL 16 con pgvector), `keycloak`, `ms-crear`, `ms-modificar` y, solo con `--profile consultar`, `ms-consultar`. Para apagar, encender o escalar Consultar: `docker compose stop ms-consultar`, `docker compose up -d ms-consultar` y `docker compose up -d --scale ms-consultar=3 ms-consultar`. Los demás servicios están comentados al final de `docker-compose.yml` y cada tarea agrega el suyo.

Cómo comprobar que funciona:

```bash
docker compose ps                      # gateway, postgres y keycloak en estado healthy (keycloak tarda cerca de un minuto)
curl -i http://localhost/              # 404 de Traefik: el gateway responde y aún no hay rutas
docker compose exec -T postgres sh < database/verificar.sh   # esquema, restricciones y permisos: termina con TODO BIEN
bash keycloak/verificar.sh             # realm, roles, usuarios de prueba y login con PKCE: termina con TODO BIEN (en Windows, con Git Bash)
npm install && npm run test:common     # pruebas unitarias de libs/common (no necesitan contenedores)
bash libs/common/pruebas-integracion.sh   # guard, validaciones y log transaccional contra PostgreSQL y Keycloak reales
bash services/ms-crear/verificar.sh     # ms-crear de extremo a extremo, por el gateway y con tokens reales
bash services/ms-modificar/verificar.sh # ms-modificar de extremo a extremo (no necesita ms-crear ni ms-consultar)
bash services/ms-consultar/verificar.sh # ms-consultar de extremo a extremo, incluido apagarlo, encenderlo y escalarlo
```

Si ya habías arrancado el proyecto antes de T03, tu base de datos local no tiene las tablas: completa las `DB_PASSWORD_*` en tu `.env` y recrea el volumen con `docker compose down -v` antes de volver a arrancar.

Usuarios de prueba de la aplicación: `admin.prueba` (rol `administrador`) y `consultor.prueba` (rol `consultor`). Sus contraseñas son las que pongas en `KEYCLOAK_USUARIO_ADMIN_PASSWORD` y `KEYCLOAK_USUARIO_CONSULTOR_PASSWORD`. La consola de Keycloak está en <http://localhost:8080> y se entra con `KEYCLOAK_ADMIN` y `KEYCLOAK_ADMIN_PASSWORD`.

Notas:

- PostgreSQL no publica puertos. Para entrar a la base de datos se usa `docker compose exec postgres psql ...`.
- `database/init.sql` e `init-usuarios.sh` solo se ejecutan cuando el volumen `pgdata` está vacío. Si cambian, o si cambia una `DB_PASSWORD_*`, hay que recrear el volumen con `docker compose down -v` (borra los datos locales) y volver a arrancar.
- Keycloak importa `keycloak/realm.json` solo si el realm no existe. Si cambia el archivo o una contraseña de los usuarios de prueba, hay que borrar el volumen `keycloak_data` (pasos en `keycloak/README.md`).
- Para apagar todo: `docker compose --profile consultar down`.

Configuración inicial de n8n (una sola vez): pendiente de documentar en la tarea T20.

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

**Todavía no existe:** ms-borrar, ms-log, frontend ni flujo de n8n. La base de datos está vacía: los datos de prueba son la tarea T17.

**En curso:** ver la columna Estado del tablero.

**Bloqueos o problemas conocidos:**
- (ninguno)

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
| T09 | ms-borrar (búsqueda previa + borrado) | services/ms-borrar/ | T05 | En curso | Carlos Ruidiaz | feat/T09-ms-borrar |
| T10 | ms-log: consulta con filtros y endpoint para n8n con llave de API | services/ms-log/ | T05 | Pendiente | | |
| T11 | Frontend base: login con Keycloak, menú por rol, Dockerfile con Nginx | frontend/ | T04 | Pendiente | | |
| T12 | Formulario de persona con validaciones (crear y modificar) | frontend/ | T11, T06, T07 | Pendiente | | |
| T13 | Pantallas de consultar, borrar y log | frontend/ | T11, T08, T09, T10 | Pendiente | | |
| T14 | n8n en Compose, flujo de indexación por webhook y flujo de reindexación completa | n8n/ | T03 | Pendiente | | |
| T15 | Flujo de chat: agente con herramientas SQL y vectorial, Gemini, memoria y registro en ms-log | n8n/ | T14, T10 | Pendiente | | |
| T16 | Llamadas al webhook de indexación desde ms-crear, ms-modificar y ms-borrar | services/ | T06, T07, T09, T14 | Pendiente | | |
| T17 | Script de datos de prueba (unas 20 personas ficticias) | database/ | T03 | Pendiente | | |
| T18 | Pruebas unitarias y de integración (Jest) | services/, libs/ | T06 a T10 | Pendiente | | |
| T19 | Colección de Postman con todos los endpoints y permisos | tests/postman/ | T06 a T10 | Pendiente | | |
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
