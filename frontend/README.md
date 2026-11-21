# frontend

Interfaz web en React con Vite y TypeScript, servida con Nginx detrás de Traefik en `/`.

Aquí irá: login con Keycloak (código de autorización con PKCE), menú por rol, formulario de persona, pantallas de consultar, borrar y log.

Tareas del tablero que llenan esta carpeta: **T11** (base, login, menú y Dockerfile), **T12** (formulario con validaciones) y **T13** (consultar, borrar y log). Ver `CONTEXTO.md`.

Para la pantalla del log (T13): el contrato de `GET /api/log` (filtros, paginación y forma de cada registro) está en `services/ms-log/README.md`.
