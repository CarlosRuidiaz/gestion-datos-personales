# CONTEXTO DEL PROYECTO

> Este es el documento de contexto del repositorio. Cualquier integrante del equipo, o la IA que use, debe leerlo completo antes de trabajar.
> Uso: haz `git pull`, abre tu IA en la carpeta del repositorio y pídele «Lee CONTEXTO.md y dime en qué estado está el proyecto y qué me toca hacer».

**Última actualización:** 2026-11-16, por Carlos Ruidiaz (tarea T03)
**Fase actual:** Fase 1 · Cimientos (base de datos, Keycloak y librería común)

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

Requisitos: Docker Desktop (con WSL2 en Windows) y Git. El puerto 80 debe estar libre.

```bash
cp .env.example .env        # completar llaves y contraseñas (hoy son obligatorias POSTGRES_PASSWORD y las seis DB_PASSWORD_*)
docker compose --profile consultar up -d --build
```

Qué arranca hoy (tarea T02): solo `gateway` (Traefik) y `postgres` (PostgreSQL 16 con pgvector). Los demás servicios están comentados al final de `docker-compose.yml` y cada tarea descomenta el suyo.

Cómo comprobar que funciona:

```bash
docker compose ps                      # gateway y postgres en estado healthy
curl -i http://localhost/              # 404 de Traefik: el gateway responde y aún no hay rutas
docker compose exec -T postgres sh < database/verificar.sh   # esquema, restricciones y permisos: termina con TODO BIEN
```

Si ya habías arrancado el proyecto antes de T03, tu base de datos local no tiene las tablas: completa las `DB_PASSWORD_*` en tu `.env` y recrea el volumen con `docker compose down -v` antes de volver a arrancar.

Notas:

- PostgreSQL no publica puertos. Para entrar a la base de datos se usa `docker compose exec postgres psql ...`.
- `database/init.sql` e `init-usuarios.sh` solo se ejecutan cuando el volumen `pgdata` está vacío. Si cambian, o si cambia una `DB_PASSWORD_*`, hay que recrear el volumen con `docker compose down -v` (borra los datos locales) y volver a arrancar.
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

**Todavía no existe:** Keycloak (T04), ningún microservicio, frontend ni flujo de n8n. La base de datos está vacía: los datos de prueba son la tarea T17.

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
| T04 | Keycloak: realm.json con cliente del frontend (PKCE), roles, usuarios de prueba e importación automática | keycloak/ | T02 | En curso | Carlos Ruidiaz | feat/T04-keycloak |
| T05 | `libs/common`: entidad Persona, DTO y validaciones, guard JWT con roles, módulo de auditoría transaccional | libs/common/ | T03, T04 | Pendiente | | |
| T06 | ms-crear | services/ms-crear/ | T05 | Pendiente | | |
| T07 | ms-modificar (búsqueda previa + actualización) | services/ms-modificar/ | T05 | Pendiente | | |
| T08 | ms-consultar con endpoint health y perfil de Compose | services/ms-consultar/ | T05 | Pendiente | | |
| T09 | ms-borrar (búsqueda previa + borrado) | services/ms-borrar/ | T05 | Pendiente | | |
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

1. **Antes de empezar:** `git pull` en `main` y leer este documento.
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
2. Pregunta al usuario su nombre y qué tarea va a trabajar, o recomiéndale la siguiente según la sección 5. No trabajes en tareas que están **En curso** con otro responsable.
3. Respeta el diseño. Si algo del diseño no se puede implementar tal cual, propón la alternativa, explica el motivo y, si el usuario la acepta, regístrala en la sección 7.
4. Trabaja solo en la carpeta de la tarea, salvo que el usuario indique otra cosa.
5. Si vas a retomar una tarea en curso, lee primero su nota de traspaso en la sección 6.1.
6. Antes de terminar cada sesión, aunque la tarea no esté terminada, actualiza la nota de traspaso de la tarea (qué quedó hecho, qué falta y qué debe saber quien la retome) y el resto del documento según la sección 8. Dile al usuario qué cambió.
7. Nunca escribas llaves, contraseñas ni datos personales reales en el repositorio.
