# Notas del equipo

Decisiones y acuerdos que se tomaron al diseñar el proyecto y que no están escritos, o están solo de forma breve, en el documento de diseño. Complementan el documento, no lo reemplazan.

## Equipo

Carlos Ruidiaz, Claudia Elias, Juan Fernandez y Daniel Mendez. Profesor: Pierre Julliard Amador.

## Fuentes de verdad, en orden

1. El enunciado del profesor (`docs/enunciado.md`). Si algo del diseño contradice el enunciado, manda el enunciado.
2. El documento de diseño entregado (`docs/diseno/documento_diseno.md`). Es lo que el profesor ya recibió, así que la implementación debe coincidir con él. Si durante la implementación hace falta apartarse del diseño, se registra la decisión y su motivo.
3. Estas notas.

## Por qué se eligió cada tecnología

- **React y NestJS.** El equipo ya los conoce. NestJS aporta validación con DTO (class-validator), Swagger automático y una estructura modular que facilita tener cinco microservicios parecidos.
- **Traefik en lugar de Nginx como gateway.** Traefik descubre los contenedores en tiempo real. Cuando se apaga ms-consultar, su ruta desaparece sin reiniciar el gateway. Con Nginx, el proxy falla al arrancar si falta un servicio.
- **PostgreSQL con pgvector.** Un solo contenedor guarda los datos relacionales y los vectores del RAG, y n8n tiene nodos nativos para Postgres y para PGVector.
- **Keycloak, con Roble como respaldo.** Keycloak es un SSO estándar (OpenID Connect), corre en contenedor y no depende de internet ni de permisos de la universidad. Roble es la plataforma de autenticación de Uninorte y la nombra el enunciado. Si Keycloak da demasiados problemas, se cambia a Roble, y como la autenticación está aislada en el guard de la librería común, el resto del sistema no cambia. Microsoft Entra se descartó porque registrar la aplicación en el directorio de la universidad depende de permisos de TI.
- **Gemini, con Groq como respaldo.** Nadie del equipo tiene presupuesto para APIs de pago. Gemini tiene nivel gratuito para chat y embeddings, con nodos nativos en n8n. Groq es gratis para chat pero no ofrece embeddings. Conviene usar el modelo Flash-Lite de Gemini porque tiene más cuota diaria. Una suscripción Pro de Claude no incluye acceso a la API, así que no sirve para conectar el sistema.
- **Ollama descartado.** El día de la presentación no se tiene garantizado un computador con recursos suficientes para correr un modelo local.

## Despliegue

- Todo se ejecuta en local con Docker Desktop. Es lo que se plantea en el documento.
- Desplegar en una máquina virtual de Azure for Students es una extensión opcional, solo si sobra tiempo al final. El mismo `docker-compose.yml` debe servir para eso. En la nube haría falta HTTPS (el login con PKCE solo funciona en HTTPS o en localhost).
- El equipo de la presentación debe probarse con anticipación: Docker Desktop con WSL2 y virtualización activada en la BIOS, y las imágenes ya descargadas.

## Datos

- Solo se usan datos ficticios, porque el nivel gratuito de Gemini puede usar los datos enviados para mejorar el servicio.
- Los datos de prueba deben tener fechas de nacimiento distintas, para que «el más joven» y «el mayor» tengan una sola respuesta correcta, y algunos nombres parecidos entre sí para probar la búsqueda vectorial.

## Detalles de diseño que conviene no perder

- La llave de búsqueda es solo el número de documento (no el par tipo y número).
- Cada microservicio tiene su propio prefijo de ruta (`/api/crear`, `/api/modificar`, `/api/consultar`, `/api/borrar`, `/api/log`). Modificar y Borrar hacen su propia búsqueda por documento para no depender de Consultar.
- El log se escribe en la misma transacción que la operación. Se registran también las búsquedas previas de Modificar y Borrar (tipo CONSULTAR) y las peticiones rechazadas con 400, 403, 404 y 409. Las de 401 no, porque no hay usuario.
- El aviso a n8n (webhook de indexación) se envía después de confirmar la transacción y sin esperar respuesta.
- La herramienta SQL del agente solo puede leer la vista `vista_personas`, con un usuario de base de datos de solo lectura.
- El frontend consulta `GET /api/consultar/health` para saber si mostrar Consultar como disponible.
