# ms-consultar

Microservicio NestJS de la opción **Consultar Datos Personales**. Ruta en el gateway: `/api/consultar`. Usuario de base de datos: `usr_consultar`.

Aquí irá: `GET /api/consultar/personas/{documento}` y `GET /api/consultar/health` (sin token). Corre en el perfil `consultar` de Docker Compose para habilitarse y deshabilitarse según demanda.

Tarea del tablero que llena esta carpeta: **T08**. Ver `CONTEXTO.md` y las secciones 5.3 y 8.1 de `docs/diseno/documento_diseno.md`.
