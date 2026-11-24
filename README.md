# Gestión de Datos Personales

Proyecto final de Diseño de Software II (Universidad del Norte, periodo 202630).
Equipo: Carlos Ruidiaz, Claudia Elias, Juan Fernandez y Daniel Mendez. Profesor: Pierre Julliard Amador.

Aplicación para crear, modificar, consultar y borrar datos personales usando el número de documento como llave. Responde preguntas en lenguaje natural sobre esos datos con un agente RAG en n8n y registra toda transacción en un log de auditoría consultable. Cada opción del menú es un microservicio y todo corre en contenedores con Docker Compose.

## Funciones

- **Inicio de sesión único (SSO)** con Keycloak y dos roles: `administrador` (todas las opciones) y `consultor` (consultar, consulta en lenguaje natural y log).
- **Crear, modificar, consultar y borrar personas**, con las validaciones del enunciado en el navegador y en el servidor, y foto JPG o PNG de hasta 2 MB.
- **Importar personas** desde un Excel con su zip de fotos (en Crear) y **borrar todas** (en Borrar), cada persona con su registro en el log.
- **Log de auditoría** de todas las transacciones, incluidas las rechazadas y las preguntas del chat, con filtros por tipo, documento y fechas.
- **Consulta en lenguaje natural** en el chat de n8n: un agente con Google Gemini que combina SQL de solo lectura y búsqueda vectorial (RAG).
- **Consultar en un contenedor independiente**, que el administrador apaga y enciende desde la aplicación sin afectar lo demás.

## Arquitectura

| Contenedor | Tecnología | Ruta o puerto | Responsabilidad |
| --- | --- | --- | --- |
| `gateway` | Traefik | puerto 80 | Enruta por prefijo de ruta y detecta en vivo los contenedores activos |
| `frontend` | React + Vite + TypeScript, servido con Nginx | `/` | Interfaz web |
| `keycloak` | Keycloak (OpenID Connect) | puerto 8080 | Login, roles y tokens JWT |
| `ms-crear` | NestJS | `/api/crear` | Crear e importar personas |
| `ms-modificar` | NestJS | `/api/modificar` | Buscar y modificar personas |
| `ms-consultar` | NestJS (perfil `consultar`) | `/api/consultar` | Consultar personas. Se habilita y deshabilita |
| `ms-borrar` | NestJS | `/api/borrar` | Buscar y borrar personas |
| `ms-log` | NestJS | `/api/log` | Consultar el log y recibir los registros del chat |
| `ms-control` y `docker-proxy` | NestJS y HAProxy | `/api/control` | Apagar y encender Consultar desde la aplicación |
| `postgres` | PostgreSQL 16 + pgvector | solo red interna | Personas, log y vectores |
| `n8n` | n8n con Google Gemini | puerto 5678 | Chat RAG e indexación de embeddings |

![Vista general de contenedores](docs/diseno/figuras/fig1.png)

El detalle está en el [documento de diseño](docs/diseno/documento_diseno.md) y las decisiones de implementación en [docs/decisiones.md](docs/decisiones.md).

## Requisitos

- Docker Desktop (en Windows, con WSL2 y virtualización activada), con al menos 8 GB de RAM en el equipo.
- Git. En Windows, los scripts de comprobación se ejecutan con Git Bash.
- Puertos libres: 80 (aplicación), 8080 (Keycloak) y 5678 (n8n).
- Conexión a internet y una llave de API gratuita de Google Gemini, para la consulta en lenguaje natural.
- Node.js 22 o superior, solo para correr las pruebas fuera de los contenedores.

## Cómo arrancarlo

```bash
git clone <url-del-repositorio>
cd gestion-datos-personales
cp .env.example .env        # completar llaves y contraseñas
docker compose --profile consultar up -d --build
```

Son obligatorias en `.env`: `POSTGRES_PASSWORD`, las seis `DB_PASSWORD_*`, las tres de Keycloak, `N8N_LOG_API_KEY` y `N8N_ENCRYPTION_KEY`. Para el chat hacen falta además `GEMINI_API_KEY` y `N8N_CHAT_URL` (su valor está en `.env.example`).

La aplicación queda en <http://localhost>. Después, una sola vez, se configura n8n:

1. Crear la cuenta de administrador de n8n en <http://localhost:5678>. Es local, no es una cuenta de n8n.io.
2. Ejecutar `bash n8n/configurar.sh`: carga las credenciales desde `.env`, importa los flujos y publica los de indexación y chat.

La guía paso a paso, con la prueba completa en un equipo limpio y los problemas frecuentes, está en [docs/guia-configuracion.md](docs/guia-configuracion.md).

**Usuarios de prueba:** `admin.prueba` (administrador) y `consultor.prueba` (consultor), con las contraseñas de `KEYCLOAK_USUARIO_ADMIN_PASSWORD` y `KEYCLOAK_USUARIO_CONSULTOR_PASSWORD`. La consola de Keycloak está en <http://localhost:8080>, con `KEYCLOAK_ADMIN` y `KEYCLOAK_ADMIN_PASSWORD`.

**Datos de prueba:** `bash database/cargar-datos-prueba.sh` carga 20 personas ficticias con su registro en el log. Después hay que ejecutar «Reindexar todo» en n8n.

La opción Consultar se habilita y deshabilita desde el menú principal (administrador) o por consola:

```bash
docker compose stop ms-consultar                            # deshabilitar
docker compose up -d ms-consultar                           # habilitar
docker compose up -d --scale ms-consultar=3 ms-consultar    # tres réplicas
```

Para apagar todo: `docker compose --profile consultar down`.

## Cómo comprobar que funciona

```bash
docker compose ps                                  # todos los contenedores en marcha; keycloak tarda cerca de un minuto
docker compose exec -T postgres sh < database/verificar.sh   # esquema, restricciones y permisos
bash keycloak/verificar.sh                         # realm, roles, usuarios de prueba y login con PKCE
npm install && npm test                            # pruebas unitarias de libs/common y de los servicios (sin contenedores)
(cd frontend && npm install && npm test)           # pruebas del frontend (Vitest, sin contenedores)
bash libs/common/pruebas-integracion.sh            # guard, validaciones y log transaccional contra PostgreSQL y Keycloak reales
bash services/ms-crear/verificar.sh                # cada microservicio de extremo a extremo, por el gateway y con tokens reales
bash services/ms-crear/verificar-importacion.sh    # importar un Excel y un zip de fotos ficticios, y «Borrar todas»
bash services/ms-modificar/verificar.sh
bash services/ms-borrar/verificar.sh
bash services/ms-consultar/verificar.sh            # incluido apagarlo, encenderlo y escalarlo
bash services/ms-log/verificar.sh                  # filtros, paginación y registro del chat con su llave
bash services/ms-control/verificar.sh              # interruptor de Consultar y lo que docker-proxy rechaza
bash services/verificar-indexacion.sh              # avisos a n8n de crear, modificar y borrar
bash frontend/verificar.sh                         # Nginx, config.js, convivencia con /api y login con PKCE
bash n8n/verificar.sh                              # indexación por webhook y reindexación completa, con Gemini real
bash n8n/verificar-chat.sh                         # chat: barrera SQL, preguntas de ejemplo, memoria y registro en el log
```

Cada script termina con `TODO BIEN`. La colección de Postman con todos los endpoints y permisos está en [tests/postman](tests/postman/README.md).

Notas:

- PostgreSQL no publica puertos. Para entrar a la base de datos se usa `docker compose exec postgres psql ...`.
- `database/init.sql` e `init-usuarios.sh` solo se ejecutan cuando el volumen `pgdata` está vacío. Si cambian, o si cambia una `DB_PASSWORD_*`, hay que recrear el volumen con `docker compose down -v` (borra los datos locales).
- Keycloak importa `keycloak/realm.json` solo si el realm no existe. Si cambia el archivo o una contraseña de los usuarios de prueba, hay que borrar el volumen `keycloak_data` (pasos en `keycloak/README.md`).

## Estructura del repositorio

```
frontend/         interfaz web (React, servida con Nginx)
services/         ms-crear, ms-modificar, ms-consultar, ms-borrar, ms-log y ms-control
libs/common/      entidad, DTO, guard JWT, auditoría transaccional y aviso a n8n compartidos
n8n/              flujos de n8n exportados en JSON y scripts de configuración
keycloak/         realm.json con clientes, roles y usuarios de prueba
database/         init.sql con tablas, vista, índices, usuarios y permisos; datos de prueba
tests/postman/    colección de Postman
docs/             enunciado, documento de diseño, decisiones y guía de configuración
docker-compose.yml
```

Cada carpeta tiene su propio `README.md` con el detalle.

## Documentación

- [docs/guia-configuracion.md](docs/guia-configuracion.md): instalación desde cero, configuración inicial de n8n, prueba completa y problemas frecuentes.
- [docs/enunciado.md](docs/enunciado.md): enunciado y rúbrica del profesor.
- [docs/diseno/documento_diseno.md](docs/diseno/documento_diseno.md): documento de diseño.
- [docs/decisiones.md](docs/decisiones.md): elección de tecnologías y decisiones de implementación.

## Datos y secretos

Solo se usan datos ficticios. Las llaves y contraseñas viven en `.env`, que no se sube al repositorio; `.env.example` lista las variables sin valores.
