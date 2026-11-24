#!/bin/sh
# Carga las 20 personas ficticias de prueba y su registro CREAR en el log.
# Uso, desde la raíz del repositorio y con el contenedor postgres arriba (en Windows, con Git Bash):
#
#   bash database/cargar-datos-prueba.sh
#
# Se puede repetir: no duplica personas ni registros de log.
# Después de cargar, ejecuta «Reindexar todo» en n8n para que el chat conozca a las personas nuevas
# (ver n8n/README.md).

set -e

docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q' < database/datos-prueba.sql
echo "Listo. Falta ejecutar «Reindexar todo» en n8n."
