# Preparación de la sustentación

Guía para ensayar y presentar la demostración. El estado de las tareas está en [`CONTEXTO.md`](../CONTEXTO.md). Este documento solo dice cómo es la sustentación, qué debe estar listo y quién prepara qué.

## 1. Cómo es la sustentación

Lo que sigue lo contó un compañero de otro grupo que ya presentó (2026-11-23):

- El profesor pide la **demostración** casi desde el principio. Le importa que todo funcione en vivo, más que las diapositivas.
- Antes de empezar hay que tener **precargados los datos que mandó por correo** (unas 15 personas). En algún momento pide **borrar todo y dejar solo esas 15**, y sobre ellas hace las preguntas al chat. Él ya conoce las respuestas y las va comparando.
- Él dicta el recorrido y pregunta mientras avanza:
  1. **Iniciar sesión.** Pregunta cómo se hizo el SSO.
  2. **Crear** una persona con los datos que él dicta.
  3. **Modificar**, **consultar** y **borrar**.
  4. **Ver el log después de cada cambio.** Lo pide siempre, así que hay que tenerlo a mano.
  5. **Chat en lenguaje natural** sobre las 15 personas. Pregunta cómo funciona.
- Trae **datos inválidos a propósito**. Por ejemplo, un segundo nombre de más de 30 caracteres. La aplicación debe rechazarlo con un mensaje claro.
- Quiere un **botón en la aplicación para deshabilitar Consultar**, con el resto del sistema funcionando. A ese grupo le pidió un interruptor en la interfaz: no le bastó que lo apagaran desde el backend. Quiere que todo sea muy fácil de usar.
- Si la aplicación responde sola a todo, hace pocas preguntas. Si algo falla o falta, pregunta por todo.

## 2. Qué falta para estar listos

| Pendiente | Tarea | Estado |
| --- | --- | --- |
| Interruptor de Consultar en la aplicación | T24 | Ver tablero |
| Script para dejar la base solo con los datos del profesor | T25 | Espera los datos del correo |
| Mensaje de error visible para nombres de más de 30 caracteres | T26 | Ver tablero |
| Rediseño visual | T23 | Ver tablero (no es requisito para presentar) |

### 2.1 T24: interruptor de Consultar

Hoy Consultar se apaga con `docker compose stop ms-consultar` (decisión DD-04 del diseño). El profesor quiere hacerlo desde la aplicación, así que el botón debe **detener y arrancar de verdad el contenedor**. Si lo revisa en Docker, tiene que verlo detenido.

Propuesta:

- **`ms-control`**, un microservicio NestJS pequeño, en `services/ms-control/`.
  - Rutas detrás de Traefik en `/api/control`:
    - `GET /api/control/consultar` devuelve `{ encendido, replicas }`.
    - `POST /api/control/consultar/apagar` y `POST /api/control/consultar/encender`.
  - Solo para el rol `administrador`, con el guard JWT de `@gdp/common`.
  - Cada apagado y encendido queda en el log, como el resto de transacciones (hay que decidir el tipo, por ejemplo `CONTROL`. La restricción `log_tipo_chk` de `database/init.sql` solo admite los cinco tipos actuales, así que hay que ampliarla; también el filtro de tipo de la pantalla del log y ms-log).
- **Acceso a Docker a través de un proxy del socket**, por ejemplo `tecnativa/docker-socket-proxy` con `CONTAINERS=1` y `POST=1`.
  - `ms-control` no monta `/var/run/docker.sock`: le habla al proxy por una red interna propia.
  - El proxy no publica puertos.
- **Cómo detiene y arranca:** busca los contenedores con la etiqueta `com.docker.compose.service=ms-consultar` y los detiene o arranca todos. Así también funciona con varias réplicas.
  - El botón solo enciende contenedores que ya existen. Por eso el sistema se arranca como siempre, con `--profile consultar`.
  - Traefik quita y vuelve a poner la ruta solo.
- **Frontend:** un interruptor «Consultar: encendido / apagado» visible solo para el administrador, en el menú principal.
  - Al cambiarlo, vuelve a revisar `/api/consultar/health`, para que la opción pase a «no disponible» o vuelva sin recargar la página.
  - Mientras el contenedor arranca, muestra «Encendiendo…» hasta que el health responda 200.
- **Registro:** es un cambio al diseño (DD-04 pasa de «comando» a «comando o botón»). Se anota en la sección 7 de `CONTEXTO.md`.
- **Comprobación:**
  - Agregar a `services/ms-consultar/verificar.sh`, o a un `verificar.sh` propio, una prueba que apague y encienda desde la API.
  - Comprobar que Crear, Modificar, Borrar, Log y el chat siguen funcionando con Consultar apagado (CP-07).

### 2.2 T25: datos del profesor

Cuando lleguen los datos del correo:

- Se guardan en `database/datos-profesor.sql`, con el mismo formato que `datos-prueba.sql`. Son datos que dio el profesor para la prueba, no datos personales reales del equipo.
- Se agrega `database/cargar-datos-profesor.sh`, que hace esto en orden:
  1. Vacía `persona`, `persona_embedding` y `log_transaccion`.
  2. Carga las personas con su registro `CREAR` en el log.
  3. Recuerda ejecutar «Reindexar todo» en n8n.
- Se ensaya con las preguntas que se crea que hará el profesor, y se anotan aquí las respuestas esperadas.

Si en la sustentación pide «borrar todo», se corre este script. No hace falta borrar persona por persona.

### 2.3 T26: nombres demasiado largos

Hoy los campos de nombres y apellidos tienen `maxLength`, así que el navegador corta lo que se escribe o se pega en el carácter 30, y no aparece ningún error. El profesor podría pegar un nombre de 35 caracteres, ver que se guarda cortado y concluir que no hay validación.

Lo correcto es quitar ese corte (o subirlo a un límite holgado) para que aparezca el mensaje «El segundo nombre no puede tener más de 30 caracteres», que ya existe en `frontend/src/persona/validaciones.ts`. El backend ya lo rechaza (`libs/common`, con pruebas).

Pasa lo mismo con el celular y el documento: si se pega un celular de 11 dígitos, se corta a 10 y queda **válido**. Hay que revisar también el correo. Claudia está haciendo el rediseño (T23) sobre el mismo formulario, así que conviene coordinar con ella o hacerlo después de que fusione.

## 3. Antes de presentar

El día anterior:

- [ ] `git pull` en el equipo con el que se va a presentar.
- [ ] `docker compose --profile consultar up -d --build`, con todos los contenedores `healthy`.
- [ ] Cargar los datos del profesor (T25) y ejecutar «Reindexar todo» en n8n.
- [ ] Revisar que `GEMINI_API_KEY` esté en `.env` y que el chat responda. Llevar datos móviles por si falla el internet (riesgo de la sección 12 del diseño).
- [ ] Tener abiertas las pestañas:
  - la aplicación en <http://localhost>, con sesión de `admin.prueba`;
  - una ventana privada con `consultor.prueba`;
  - el chat de n8n;
  - Docker Desktop, para mostrar el contenedor de Consultar detenido.
- [ ] Preparar en un archivo aparte los datos para crear una persona válida y los casos inválidos:
  - segundo nombre de 31 caracteres;
  - nombre con números;
  - celular de 9 dígitos;
  - correo sin `@`;
  - fecha futura;
  - foto de más de 2 MB.
- [ ] Ensayar el recorrido completo una vez, cronometrado.

## 4. Guion de la demostración

Cada paso termina en el log cuando hay un cambio.

| Paso | Qué se muestra | Qué explicar si pregunta |
| --- | --- | --- |
| 1 | Iniciar sesión con el administrador | SSO con Keycloak: la aplicación redirige al login, Keycloak devuelve un token (OIDC con PKCE) y cada microservicio valida el token y el rol. El consultor ve menos opciones |
| 2 | Crear una persona con los datos que dicte | Validaciones en el formulario y de nuevo en el servicio. La foto es JPG o PNG de hasta 2 MB. La operación y su log van en la misma transacción |
| 3 | Log filtrado por documento | Filtros por tipo, documento y fechas. El log guarda quién, cuándo y qué |
| 4 | Intentar crear con datos inválidos | El mensaje dice qué campo falla. El backend también lo rechaza |
| 5 | Modificar la persona y ver el log | El log guarda el valor anterior y el nuevo de cada campo cambiado |
| 6 | Consultar la ficha | ms-consultar es un contenedor independiente |
| 7 | Apagar Consultar con el interruptor (T24) | La opción queda como no disponible y Crear, Modificar, Borrar y Log siguen funcionando. Mostrar en Docker el contenedor detenido y volver a encenderlo |
| 8 | Borrar con confirmación y ver el log | El detalle del log conserva los datos que tenía la persona |
| 9 | Dejar la base solo con sus datos (T25) | Script de carga y «Reindexar todo» |
| 10 | Chat en lenguaje natural | Agente de n8n con dos herramientas: SQL de solo lectura sobre `vista_personas` y búsqueda vectorial con pgvector (RAG). Gemini como modelo. Cada consulta queda en el log |
| 11 | Entrar como consultor | Solo ve Consultar, Consultar en lenguaje natural y Log (sección 2.2 del diseño) |

## 5. Preguntas probables

- **¿Cómo funciona el SSO?** Keycloak como proveedor de identidad (OIDC). Flujo de código con PKCE desde el navegador, token JWT con los roles, validado por cada microservicio con la llave pública del realm.
- **¿Por qué microservicios?** Uno por opción del menú, como pide el enunciado. Cada uno tiene su usuario de base de datos con permisos mínimos.
- **¿Cómo se apaga Consultar sin afectar lo demás?** Contenedor propio en su perfil de Compose. Traefik detecta en tiempo real si está o no. Las búsquedas previas de Modificar y Borrar no dependen de él.
- **¿Qué es el RAG aquí?** n8n indexa cada persona como texto con embeddings en `persona_embedding` (pgvector), cada vez que se crea, modifica o borra. El agente combina esa búsqueda con SQL para preguntas exactas (conteos, edades).
- **¿Cómo se garantiza que todo queda en el log?** La operación y el registro van en la misma transacción: si uno falla, no queda ninguno.
- **¿Dónde están las contraseñas?** Solo en `.env`, que no está en el repositorio. `.env.example` lista las variables sin valores.
