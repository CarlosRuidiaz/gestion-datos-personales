# database

Scripts de la base de datos PostgreSQL 16 con pgvector.

- `init.sql`: se ejecuta solo la primera vez que arranca el contenedor `postgres` (cuando el volumen `pgdata` está vacío). Hoy solo activa la extensión `vector`. La tarea **T03** lo completa con las tablas `persona`, `log_transaccion` y `persona_embedding`, la vista `vista_personas`, los índices, los usuarios de base de datos y sus permisos (secciones 6.2 y 6.3 del diseño).
- La tarea **T17** agrega aquí el script de datos de prueba (unas 20 personas ficticias).

Si cambias `init.sql` y ya habías arrancado la base de datos, hay que recrear el volumen para que se vuelva a ejecutar (esto borra los datos locales):

```bash
docker compose down -v
docker compose up -d
```
