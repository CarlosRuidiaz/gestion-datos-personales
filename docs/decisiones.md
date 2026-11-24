# Decisiones de implementación

Decisiones que precisan o complementan el [documento de diseño](diseno/documento_diseno.md), con su motivo. Están agrupadas por tema.

## Elección de tecnologías

- **React y NestJS.** NestJS aporta validación con DTO (class-validator), Swagger automático y una estructura modular que facilita tener varios microservicios parecidos.
- **Traefik como gateway, en lugar de Nginx.** Traefik descubre los contenedores en tiempo real: cuando se apaga ms-consultar, su ruta desaparece sin reiniciar el gateway. Con Nginx, el proxy falla al arrancar si falta un servicio.
- **PostgreSQL con pgvector.** Un solo contenedor guarda los datos relacionales y los vectores del RAG, y n8n tiene nodos nativos para Postgres y PGVector.
- **Keycloak como SSO.** Es un proveedor de identidad estándar (OpenID Connect), corre en un contenedor y no depende de internet ni de permisos de la universidad. La autenticación está aislada en el guard de la librería común, así que cambiar de proveedor no afecta al resto del sistema. Microsoft Entra se descartó porque registrar la aplicación en el directorio de la universidad depende de permisos de TI.
- **Google Gemini.** Tiene nivel gratuito para chat y embeddings, con nodos nativos en n8n. Se usa el modelo Flash-Lite porque tiene más cuota diaria. Groq es gratuito para chat pero no ofrece embeddings.
- **Sin modelo local (Ollama).** No se puede garantizar un equipo con recursos suficientes para correrlo.
- **Solo datos ficticios.** El nivel gratuito de Gemini puede usar los datos enviados para mejorar el servicio.
- **Despliegue local con Docker Desktop.** Es lo que plantea el diseño. En la nube haría falta HTTPS, porque el login con PKCE solo funciona en HTTPS o en localhost.

## Versiones e infraestructura

| Decisión | Motivo |
| --- | --- |
| NestJS 11, TypeORM 0.3, TypeScript 5.9, Jest 29 y Node 24 en todos los servicios. En el frontend, React 19, Vite 7, React Router 7, Vitest 4 y `keycloak-js` 26. No se usan las versiones mayores más nuevas | Son versiones estables, con más documentación y ejemplos que las mayores recién publicadas |
| Imágenes fijadas: `traefik:v3.6`, `pgvector/pgvector:pg16`, `quay.io/keycloak/keycloak:26.8` y `n8nio/n8n:2.48.7` | Traefik anterior a 3.6 no se conecta al Docker Engine 29. El diseño pide PostgreSQL 16. n8n 2.48.7 es la versión marcada como estable |
| Repositorio con workspaces de npm (`libs/*` y `services/*`) y un solo `package-lock.json`. Los servicios se construyen con el contexto de Docker en la raíz; el frontend tiene su propio `package-lock.json` | Es la forma más simple de compartir la librería común sin publicarla. El frontend no comparte código con los servicios |
| Redes con nombre fijo (`gdp_frontal`, `gdp_datos`) | Traefik necesita saber por qué red llegar a cada contenedor |
| La ruta del frontend en Traefik es `PathPrefix(/) && !PathPrefix(/api)`, con prioridad 1 | Con ms-consultar apagado, `/api/consultar/health` responde 404 desde Traefik en lugar de la página de la aplicación, así el frontend sabe que Consultar no está |
| El frontend lee su configuración de `/config.js`, que Nginx genera al arrancar desde `.env` | La misma imagen sirve en cualquier equipo cambiando solo `.env`. Son datos públicos: el cliente `frontend` no tiene secreto |

## Base de datos

| Decisión | Motivo |
| --- | --- |
| El esquema lo define `database/init.sql`; TypeORM va con `synchronize: false` | Los usuarios de los servicios no pueden crear ni alterar tablas |
| Las contraseñas de los usuarios de base de datos salen de `.env` y las asigna `database/init-usuarios.sh` | Ninguna contraseña queda en el repositorio |
| `persona` tiene restricciones CHECK que repiten las validaciones (listas, sin números, correo, celular, fecha no futura, foto JPG o PNG de hasta 2 MB) | Última barrera si alguien se salta el frontend y los DTO |
| Los servicios que escriben en el log no usan `RETURNING`: la auditoría inserta con una consulta parametrizada propia | Esos usuarios solo tienen INSERT sobre `log_transaccion`, y `save()` e `insert()` de TypeORM agregan `RETURNING id` |
| `persona_embedding` usa las columnas del nodo PGVector de n8n (`id`, `text`, `metadata`, `embedding`), sin dimensión fija y sin índice vectorial. Su dueño es `usr_n8n` | La administra n8n. Con pocas personas la búsqueda exacta es inmediata, y el índice HNSW de pgvector no admite más de 2000 dimensiones |
| ms-borrar no bloquea la fila con `SELECT ... FOR UPDATE`: si el `DELETE` no afecta ninguna fila, responde 404 | `FOR UPDATE` exige permiso de UPDATE, y `usr_borrar` solo tiene SELECT y DELETE |

## Seguridad y Keycloak

| Decisión | Motivo |
| --- | --- |
| Keycloak en modo desarrollo (`start-dev`), con su base interna en el volumen `keycloak_data` | Es un despliegue local por HTTP; el modo producción exige HTTPS |
| El realm tiene dos clientes: `frontend` (código de autorización con PKCE obligatorio) y `pruebas` (tokens con usuario y contraseña, solo para Postman y scripts) | El flujo con PKCE necesita un navegador; sin el segundo cliente no se pueden automatizar las pruebas de la API |
| Las contraseñas de los usuarios de prueba salen de `.env`; `realm.json` solo tiene la referencia a la variable. Roles en minúscula: `administrador` y `consultor` | Ninguna contraseña en el repositorio |
| El guard JWT lee las llaves públicas por la URL interna (`http://keycloak:8080`) y valida el emisor público (`http://localhost:8080/realms/gestion-personas`). No exige audiencia. Roles en `realm_access.roles`, usuario en `preferred_username` | Keycloak tiene la URL pública fija para que el emisor sea el mismo desde el navegador y desde Docker. El token no trae `aud` |

## Microservicios y log

| Decisión | Motivo |
| --- | --- |
| El log de las peticiones rechazadas (400, 403, 404, 409 y 500) lo escribe un filtro global de `libs/common`; el de éxito, el servicio dentro de su transacción con `AuditoriaService`. Toda ruta protegida lleva `@Auditar(tipo)` | El 403 lo decide el guard antes de llegar al servicio, así que no se puede registrar desde el servicio |
| En las rutas con formulario `multipart`, el registro de un 403 queda sin número de documento | El guard rechaza la petición antes de leer el formulario. El usuario, el tipo y el resultado sí quedan |
| `@Auditar` acepta un contexto (`Búsqueda previa a una modificación` o `a un borrado`) que se guarda en el detalle del log | El diseño pide distinguir las búsquedas previas de Modificar y Borrar |
| Los errores de validación responden 400 con `errores: [{ campo, mensaje }]`, un mensaje por campo y en español. La fecha llega como `dd-mmm-yyyy` o `yyyy-mm-dd` y se guarda como `yyyy-mm-dd`. La foto llega como archivo `multipart` | Un solo formato para que el frontend muestre cada error junto a su campo |
| Todos los servicios devuelven una persona con la misma forma, `PersonaRespuesta`, con la foto como `data:image/...;base64,...` solo donde se pide | Un solo contrato para el frontend, y la foto sin una segunda petición |
| En `PUT /api/modificar/personas/{documento}` se envían todos los campos. La foto se conserva si no llega archivo y se quita con `eliminarFoto=true`. El documento del cuerpo se ignora. El log guarda el valor anterior y el nuevo de los campos que cambiaron | El diseño no detalla cómo quitar la foto ni el contenido del detalle |
| El log de un borrado guarda en el detalle los datos que tenía la persona (sin la foto) y si tenía foto | La persona deja de existir y el log es lo único que queda de ella |
| `GET /api/consultar/health` responde 200 si llega a la base de datos y 503 si no; con el contenedor apagado, Traefik responde 404. ms-consultar tiene healthcheck en Compose | Un servicio que no llega a la base tampoco puede consultar, y Traefik no envía peticiones a una réplica que está arrancando |
| `GET /api/log` responde `{ total, pagina, tamano, registros }`, del más reciente al más antiguo; `desde` y `hasta` son días completos en hora de Bogotá | El diseño pide una tabla paginada y no fija el formato |
| Consultar el log no se registra en el log | No es una transacción sobre los datos personales, y la columna `tipo` no tiene un valor para ello |
| `POST /api/log/consulta-nl` no usa token de Keycloak: lo protege la llave `N8N_LOG_API_KEY` en la cabecera `X-API-Key`, comparada en tiempo constante. n8n queda como usuario `n8n` | El diseño pide una llave de API para n8n |
| Los datos se cargan y se borran en bloque desde la aplicación: importar un Excel con su zip de fotos es parte de Crear, y «Borrar todas» es parte de Borrar. Cada persona se crea o se borra con el mismo código del formulario y deja su registro en el log | Nadie puede borrar el log. El enunciado fija las seis opciones del menú, así que no se agregó otra |

## Consultar: apagar y encender

| Decisión | Motivo |
| --- | --- |
| Consultar se apaga y se enciende también desde la aplicación: `ms-control`, solo para el administrador, detiene y arranca los contenedores de ms-consultar a través de `docker-proxy`. `docker compose stop ms-consultar` sigue funcionando | Se pide un interruptor en la interfaz y que el contenedor quede detenido de verdad |
| `docker-proxy` usa una configuración propia de HAProxy que solo permite listar, detener y arrancar contenedores | Con las variables de la imagen, detener y arrancar habría permitido también crear contenedores y exec, es decir, controlar el equipo |
| El apagado y el encendido no se registran en `log_transaccion`; quedan en la salida de `ms-control` con el usuario | El log es de transacciones sobre personas y su restricción solo admite cinco tipos |

## n8n y el chat

| Decisión | Motivo |
| --- | --- |
| Contrato del webhook de indexación: `POST /webhook/indexar-persona` con `{ numeroDocumento, operacion }`; responde 202 antes de indexar. El flujo lee a la persona en `vista_personas` y, si no existe, borra su vector | El aviso no puede introducir datos falsos en el índice, repetirlo no hace daño y el orden de los avisos no importa |
| Los servicios avisan a n8n después del commit, esperan como máximo 5 segundos y nunca fallan por el aviso. ms-modificar solo avisa si cambió algún dato (no por la foto) | Una falla de n8n no debe afectar la operación, y reindexar sin cambios gasta cuota gratuita |
| Embeddings con `gemini-embedding-001` (3072 dimensiones), un vector por persona. Cada vector lleva `indexado_en`, se borran las versiones anteriores y la reindexación completa solo borra el índice viejo cuando el nuevo está listo | Dos avisos casi simultáneos podían dejar dos vectores, y si Gemini falla a mitad de una reindexación el índice anterior se conserva |
| `n8n/configurar.sh` crea las credenciales desde `.env` con ids fijos e importa y publica los flujos. La cuenta de administrador de n8n se crea a mano | Sin errores de tecleo y sin credenciales en el repositorio |
| Base interna de n8n en SQLite, dentro del volumen `n8n_data` | Basta para un solo equipo y no mezcla los datos de n8n con los de la aplicación |
| Chat con id de webhook fijo y protegido con la cuenta de n8n | La URL es la misma en todos los equipos y el diseño pide proteger el chat con la autenticación de n8n |
| Modelo de chat `gemini-3.5-flash-lite` con temperatura 0 | Flash-Lite tiene más cuota diaria; `gemini-2.5-flash-lite` ya no está disponible para llaves nuevas |
| La herramienta SQL del agente solo deja pasar un `SELECT` o `WITH` sobre `vista_personas`, sin punto y coma ni tablas del sistema, y lo ejecuta como `SELECT * FROM (consulta) AS resultado LIMIT 100` | `usr_n8n` es dueño de `persona_embedding`, así que los permisos solos no le impedirían al modelo borrar el índice. PostgreSQL no admite DML dentro de una subconsulta |
| Las instrucciones del agente incluyen la fecha de hoy e indicaciones para escribir SQL (una sola consulta, qué significan «más joven» y «mayor», ILIKE para nombres) | Así el modelo genera SQL válido y las respuestas se pueden comprobar |
| Memoria de sesión de 10 interacciones, en la memoria de n8n | Basta para preguntas de seguimiento como «¿y el mayor?»; se pierde al reiniciar n8n |
| El chat registra cada consulta en ms-log. Si ms-log no responde después de tres intentos, entrega la respuesta de todos modos; si el modelo falla, registra `ERROR` | La consulta ya se hizo y negarle la respuesta al usuario no recupera el registro |

## Frontend

| Decisión | Motivo |
| --- | --- |
| El frontend repite en `frontend/src/persona/` las reglas de validación y sus mensajes | No comparte código con los servicios, y así el usuario lee el mismo mensaje venga el error del navegador o del servidor |
| Ningún campo de texto tiene `maxLength` | Si el navegador cortara lo escrito, un valor demasiado largo quedaría guardado cortado sin mostrar el error |
| Un 404 o un 502 sin cuerpo JSON se trata como «servicio no disponible» | Con un microservicio apagado, Traefik responde 404 con texto plano; un 404 de un microservicio siempre trae JSON |
| Después de modificar no se vuelve a buscar a la persona | Otra búsqueda dejaría en el log un `CONSULTAR` que el usuario no pidió |
| La pantalla del log muestra la hora en `America/Bogota` | Es la zona con la que ms-log interpreta los filtros de fecha |
| Estilos con CSS propio, una sola tipografía (Public Sans) servida desde la aplicación, sin bibliotecas de componentes. La ficha muestra el nombre completo y el celular agrupado | El cambio era solo de estilo, y las fuentes locales evitan depender de internet |

## Pruebas

| Decisión | Motivo |
| --- | --- |
| Cada microservicio tiene un `verificar.sh` que lo prueba de extremo a extremo por el gateway con tokens reales | Comprobar cada servicio completo, además de las pruebas unitarias y la colección de Postman |
| Las pruebas unitarias de los servicios usan una base de datos falsa (`services/pruebas-comunes.ts`) y cargan `@gdp/common` desde su código fuente. Los `tsconfig.json` de los servicios excluyen los `*.spec.ts` | `npm test` no necesita compilar la librería ni contenedores, y la imagen de Docker no compila las pruebas |
| Los datos de prueba (`database/cargar-datos-prueba.sh`) se cargan directo en PostgreSQL con su registro `CREAR` en el log, con el usuario `datos-prueba`, y el script se puede repetir | Funciona sin Keycloak ni microservicios y la pantalla del log tiene datos para las demostraciones |
