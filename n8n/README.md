# n8n

Consulta en lenguaje natural con RAG (sección 7 del diseño). Corre en el contenedor `n8n` (imagen `n8nio/n8n:2.48.7`), en <http://localhost:5678>.

| Archivo | Qué es |
| --- | --- |
| `workflows/indexar-persona.json` | Flujo **Indexar persona** (T14): webhook que actualiza el vector de una persona |
| `workflows/reindexar-todo.json` | Flujo **Reindexar todo** (T14): reconstruye todos los vectores, de ejecución manual |
| `workflows/chat-consulta.json` | Flujo **Consulta en lenguaje natural** (T15): chat con el agente RAG, publicado |
| `configurar.sh` | Carga las credenciales desde `.env`, importa los flujos y publica los que se activan solos |
| `verificar.sh` | Prueba la indexación de extremo a extremo, con Gemini y PostgreSQL reales |
| `verificar-chat.sh` | Prueba el chat: barrera de la herramienta SQL, preguntas de la sección 7.1 del diseño, CP-09, CP-10 y registro en ms-log |

La guía completa de instalación y configuración inicial en un equipo limpio está en [`docs/guia-configuracion.md`](../docs/guia-configuracion.md) (tarea T20).

## Puesta en marcha

Requisitos en `.env`: `N8N_ENCRYPTION_KEY` (obligatoria, sin ella `docker compose` no arranca), `DB_PASSWORD_N8N`, `GEMINI_API_KEY` (gratis en Google AI Studio), `N8N_LOG_API_KEY` (la misma que usa ms-log) y `N8N_CHAT_URL` (el valor de `.env.example`).

```bash
docker compose up -d n8n       # o el arranque completo de CONTEXTO.md
bash n8n/configurar.sh         # credenciales, flujos y publicación (se puede repetir)
bash n8n/verificar.sh          # indexación: termina con TODO BIEN
bash n8n/verificar-chat.sh     # chat: pide tu cuenta de n8n y termina con TODO BIEN
```

`configurar.sh` crea tres credenciales con id fijo, que los flujos usan por ese id:

| Credencial | Id | Datos |
| --- | --- | --- |
| PostgreSQL (usr_n8n) | `gdpCredPostgres1` | host `postgres`, base `POSTGRES_DB`, usuario `usr_n8n`, contraseña `DB_PASSWORD_N8N` |
| Google Gemini | `gdpCredGemini001` | `GEMINI_API_KEY` |
| Llave de ms-log | `gdpCredMsLogKey1` | cabecera `X-API-Key` con `N8N_LOG_API_KEY` |

Los valores llegan al contenedor por la entrada estándar y n8n los guarda cifrados con `N8N_ENCRYPTION_KEY` en el volumen `n8n_data`. Ni los flujos exportados ni el repositorio tienen contraseñas o llaves; `verificar.sh` lo comprueba. Si cambias una contraseña en `.env`, vuelve a ejecutar `configurar.sh`. No cambies `N8N_ENCRYPTION_KEY` después de configurar: n8n dejaría de poder leer sus credenciales y habría que borrar el volumen `n8n_data`.

### La cuenta de administrador de n8n

La primera vez que abres <http://localhost:5678>, n8n pide crear la cuenta de administrador (*owner*). `configurar.sh` no la crea porque lleva una contraseña personal. Lo que hay que saber:

- **Es local.** Vive solo en tu volumen `n8n_data`, no es una cuenta de n8n.io ni de ningún servicio en internet, y cada integrante crea la suya en su equipo. No se comparte ni se sube al repositorio.
- **El correo solo sirve para iniciar sesión.** n8n no envía ningún correo de confirmación (no tiene correo configurado). Puedes usar tu correo institucional u otro que recuerdes. La contraseña pide al menos 8 caracteres, con un número y una mayúscula.
- Después del registro n8n puede ofrecer una encuesta y una licencia gratuita por correo: las dos son opcionales y se pueden saltar.
- Si olvidas la contraseña: `docker compose exec n8n n8n user-management:reset` borra la cuenta (los flujos y las credenciales se conservan) y vuelves a crearla en el navegador.
- Los flujos importados por `configurar.sh` aparecen en esa cuenta, en *Overview*. El chat se protege con esta cuenta (sección 7.1 del diseño): para usarlo hay que haber iniciado sesión en <http://localhost:5678> en el mismo navegador.
- Con `docker compose down -v` se borra el volumen `n8n_data` y con él la cuenta, las credenciales y los flujos: hay que volver a crear la cuenta y ejecutar `configurar.sh`.

Para ejecutar la reindexación completa: ábrela en n8n y pulsa *Execute workflow*, o desde la terminal:

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=gdpReindexarTodo
```

(El n8n que está corriendo ya ocupa el puerto 5679 de su task runner; la ejecución por línea de comandos necesita otro.) Hay que ejecutarla después de cargar los datos de prueba (T17) y cada vez que el índice quede desactualizado, por ejemplo si n8n estuvo apagado mientras se creaban personas.

## Cómo probarlo a mano

Desde T16, crear, modificar o borrar una persona en la aplicación ya avisa a n8n solo (lo comprueba `services/verificar-indexacion.sh`). Para probar el flujo sin la aplicación, el aviso se envía a mano. Desde PowerShell, en la raíz del repositorio:

0. Configura UTF-8 en la ventana de PowerShell (hay que hacerlo en cada ventana nueva). Windows PowerShell 5.1 pasa el texto a `docker` en ASCII, y sin esta línea la «é» de `Cédula` llega como `?`: PostgreSQL rechaza la fila con `violates check constraint "persona_tipo_doc_chk"`. La segunda parte hace que las tildes de las respuestas se vean bien:

   ```powershell
   $OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
   ```

1. Crea una persona de prueba en PostgreSQL. Usa siempre documentos que empiecen por `99999999`, que son los que limpian los scripts de verificación:

   ```powershell
   "INSERT INTO persona (numero_documento, tipo_documento, primer_nombre, apellidos, fecha_nacimiento, genero, correo, celular) VALUES ('9999999981', 'Cédula', 'Marta', 'Rojas Vega', '1995-08-12', 'Femenino', 'marta.prueba@ejemplo.com', '3011112233');" | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
   ```

2. Envía el aviso, como lo hará ms-crear. Debe responder con «Indexación en curso»:

   ```powershell
   Invoke-RestMethod -Method Post -Uri http://localhost:5678/webhook/indexar-persona -ContentType 'application/json' -Body '{"numeroDocumento":"9999999981","operacion":"CREAR"}'
   ```

3. Revisa el vector guardado (debe salir el texto de la persona y `3072`):

   ```powershell
   "SELECT text, vector_dims(embedding) FROM persona_embedding WHERE metadata->>'numero_documento' = '9999999981';" | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
   ```

4. En n8n, abre **Indexar persona** y la pestaña *Executions*: cada aviso es una ejecución, y en cada nodo se ven los datos que entraron y salieron. Si algo falla, el nodo en rojo dice por qué (por ejemplo, una llave de Gemini inválida).
5. Abre **Reindexar todo** y pulsa *Execute workflow*: debe terminar en verde y dejar un vector por persona.
6. Limpia lo que creaste:

   ```powershell
   "DELETE FROM persona WHERE numero_documento LIKE '99999999%'; DELETE FROM persona_embedding WHERE metadata->>'numero_documento' LIKE '99999999%';" | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
   ```

n8n guarda cada ejecución, con los datos de la persona, en `n8n_data`. Por eso, como en todo el proyecto, solo se usan datos ficticios.

## Contrato del webhook de indexación (para T16)

ms-crear, ms-modificar y ms-borrar avisan después del commit y sin esperar la respuesta (sección 7.2 del diseño). Dentro de la red de Docker la URL es `N8N_WEBHOOK_INDEXACION_URL` (`http://n8n:5678/webhook/indexar-persona`).

```http
POST /webhook/indexar-persona
Content-Type: application/json

{ "numeroDocumento": "1043123456", "operacion": "CREAR" }
```

| Campo | Valores |
| --- | --- |
| `numeroDocumento` | Texto de 1 a 10 dígitos |
| `operacion` | `CREAR`, `MODIFICAR` o `BORRAR` |

| Respuesta | Cuándo |
| --- | --- |
| 202 `{ mensaje, numeroDocumento, operacion }` | Aviso válido. Responde antes de indexar (unos 200 ms) |
| 400 `{ mensaje }` | Falta un campo o no es válido |
| 404 | El flujo no está publicado (falta `configurar.sh`) |
| Sin respuesta | n8n está apagado. El servicio no debe fallar por esto: la persona ya quedó guardada y `Reindexar todo` corrige la diferencia |

El aviso solo lleva el documento: el flujo lee siempre los datos de la persona en `vista_personas`. Por eso `operacion` sirve para el registro de la ejecución y no cambia el resultado: si la persona existe, su vector queda al día; si no existe, su vector se borra. Repetir un aviso no causa daño.

## Qué hace cada flujo

**Indexar persona.** Valida el aviso y responde 202. Después borra el vector anterior de la persona y la busca en `vista_personas`. Si existe, arma su descripción, obtiene el embedding con Gemini (`gemini-embedding-001`, 3072 dimensiones) y lo guarda en `persona_embedding` con el nodo PGVector. Al final borra los vectores sobrantes del documento: todos si la persona ya no existe y, si llegaron varios avisos seguidos, los anteriores al más reciente.

**Reindexar todo.** Borra los vectores de personas que ya no existen, lee todas las personas, guarda un vector nuevo para cada una y, solo cuando terminó, borra los de antes. Si Gemini falla a mitad de camino, el índice anterior se conserva.

Ejemplo del texto que se indexa:

> Pedro Andrés Pérez Gómez. Cédula número 1043123456. Fecha de nacimiento: 05-mar-2003, 23 años. Género: Masculino. Correo: pedro@ejemplo.com. Celular: 3001234567.

La metadata de cada vector tiene `numero_documento`, `tipo_documento`, `nombre_completo`, `fecha_nacimiento` (dd-mmm-yyyy), `edad`, `genero`, `correo`, `celular` e `indexado_en` (momento de la indexación, en ISO 8601), todos como texto. La edad queda fija en el momento de indexar; las preguntas exactas sobre edades las resuelve la herramienta SQL de T15 sobre `vista_personas`.

## El chat (T15)

URL: <http://localhost:5678/webhook/6f1c2a10-0015-4a00-8000-000000000001/chat>. El id del webhook es fijo, así que la URL es la misma en todos los equipos. Es la que va en `N8N_CHAT_URL` y la que abre la opción del menú de la aplicación. Antes hay que iniciar sesión con la cuenta de administrador de n8n.

| Nodo | Qué hace |
| --- | --- |
| **Chat** | Chat Trigger con la página de chat de n8n, protegida con la cuenta de n8n. Responde con lo que devuelve el último nodo que se ejecuta |
| **Agente** | AI Agent con las instrucciones de sistema de la sección 7.1 del diseño, más indicaciones para escribir SQL, la fecha de hoy y el formato de cantidades y fechas. Como máximo 8 pasos por pregunta |
| **Modelo Gemini** | `models/gemini-3.5-flash-lite`, temperatura 0 (Flash-Lite por su cuota diaria, sección 12 del diseño) |
| **Memoria de sesión** | Las últimas 10 interacciones de cada sesión del chat, para preguntas como «¿y el mayor?». Vive en la memoria de n8n: se pierde al reiniciarlo |
| **consultar_personas** | Herramienta SQL con `usr_n8n`. Ver «Barrera de la herramienta SQL» |
| **buscar_personas_similares** | Herramienta vectorial: nodo PGVector sobre `persona_embedding` con `models/gemini-embedding-001`. Devuelve las 5 personas más parecidas con su metadata |
| **Registrar en el log** y **Responder** | Envían a ms-log la pregunta, la respuesta y `EXITO`, y devuelven la respuesta al chat |
| **Preparar error**, **Registrar error en el log** y **Responder error** | Si el modelo falla (cuota agotada, llave inválida, sin internet), registran `ERROR` con el motivo y le piden al usuario que intente más tarde |

El registro va a `POST http://ms-log:3000/api/log/consulta-nl` con la credencial `gdpCredMsLogKey1`. La pregunta se recorta a 4000 caracteres y la respuesta a 20000, y la sesión del chat va en `detalle.sesion`. Si ms-log no responde, el flujo lo intenta tres veces y después entrega la respuesta de todos modos: la consulta ya se hizo y el usuario no debe quedarse sin ella.

Google ya retiró `gemini-2.5-flash-lite` para llaves nuevas (el 2026-11-23 respondía 404 y el chat decía que el modelo no respondió); por eso se usa `gemini-3.5-flash-lite`. Si vuelve a pasar, se cambia en el nodo **Modelo Gemini** por el Flash-Lite vigente (lista en Google AI Studio), se exporta el flujo y se registra la decisión en `CONTEXTO.md`.

Para probar un modelo de chat directamente, sin n8n (no imprime la llave):

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=$(grep ^GEMINI_API_KEY= .env | cut -d= -f2-)" -H 'Content-Type: application/json' -d '{"contents":[{"parts":[{"text":"hola"}]}]}'
```

Para listar los modelos disponibles con tu llave, cambia la URL por `https://generativelanguage.googleapis.com/v1beta/models?key=...` y filtra con `grep '"name"'`.

### Barrera de la herramienta SQL

El modelo escribe la consulta, pero esta no llega tal cual a PostgreSQL. Una expresión en el campo *Query* del nodo **consultar_personas** solo deja pasar una sentencia que cumpla todo esto:

- empieza por `SELECT` o `WITH`;
- nombra `vista_personas`;
- no tiene punto y coma en medio;
- no nombra `persona_embedding`, `log_transaccion`, `information_schema` ni funciones `pg_*`.

La sentencia se ejecuta como subconsulta: `SELECT * FROM (consulta) AS resultado LIMIT 100`. Sin punto y coma no se pueden encadenar sentencias, y PostgreSQL no admite `DELETE`, `INSERT` ni `UPDATE` dentro de una subconsulta. Lo que no cumple se cambia por una fila con la columna `error`, que el agente lee para corregirse.

La barrera hace falta porque `usr_n8n` es dueño de `persona_embedding`: sin ella, el modelo podría borrar el índice. Sobre `persona` y el log, la protección sigue siendo la base de datos, porque `usr_n8n` solo lee `vista_personas` (CP-10). `verificar-chat.sh` prueba la barrera sin el modelo: ejecuta la expresión del flujo exportado.

### Probar el chat a mano

1. Inicia sesión en <http://localhost:5678>.
2. Abre la URL del chat, o la opción «Consulta en lenguaje natural» del menú de la aplicación.
3. Prueba las preguntas de la sección 7.1 del diseño: «¿Cuál es el empleado más joven que se ha registrado?», luego «¿Y el mayor?», «¿Cuántas personas tienen tarjeta de identidad?», «¿Hay alguien que se llame parecido a Andrea Gomes?» y «¿Cuál es el salario de Pedro Pérez?».
4. En la aplicación, abre Consultar log con el tipo `CONSULTA_NL`: cada pregunta aparece con su respuesta.
5. En n8n, abre el flujo **Consulta en lenguaje natural** y su pestaña *Executions*: ahí se ve qué herramienta eligió el agente y la consulta SQL que escribió.

Para ver el camino de error: cambia `GEMINI_API_KEY` en `.env` por un valor inválido y ejecuta `configurar.sh`. Haz una pregunta: el chat debe pedirte que intentes más tarde, y en el log debe quedar `ERROR`. Después vuelve a poner la llave buena y ejecuta `configurar.sh` otra vez.

## Si cambias un flujo

Edítalo en n8n, expórtalo (*Download*) a `workflows/` con el mismo nombre de archivo y conserva el `id` del flujo y los ids de las credenciales. El código del nodo **Armar descripción** debe ser idéntico en los dos flujos: `verificar.sh` lo comprueba.
