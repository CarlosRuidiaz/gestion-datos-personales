#!/bin/sh
# Asigna las contraseñas de los usuarios de base de datos por servicio (tarea T03).
# Se ejecuta una sola vez, después de init.sql, cuando el volumen pgdata está vacío.
# Las contraseñas vienen de las variables DB_PASSWORD_* del archivo .env, que
# docker-compose.yml pasa al contenedor postgres. Así ninguna queda en el repositorio.
set -eu

asignar() {
    usuario="$1"
    clave="$2"
    if [ -z "$clave" ]; then
        echo "init-usuarios: falta la contraseña de $usuario en .env" >&2
        exit 1
    fi
    # psql escapa el valor con :'clave', así que admite cualquier carácter.
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
         -v usuario="$usuario" -v clave="$clave" <<'SQL'
ALTER ROLE :"usuario" PASSWORD :'clave';
SQL
    echo "init-usuarios: contraseña asignada a $usuario"
}

asignar usr_crear     "${DB_PASSWORD_CREAR:-}"
asignar usr_modificar "${DB_PASSWORD_MODIFICAR:-}"
asignar usr_consultar "${DB_PASSWORD_CONSULTAR:-}"
asignar usr_borrar    "${DB_PASSWORD_BORRAR:-}"
asignar usr_log       "${DB_PASSWORD_LOG:-}"
asignar usr_n8n       "${DB_PASSWORD_N8N:-}"
