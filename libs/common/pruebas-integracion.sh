#!/usr/bin/env bash
# Ejecuta las pruebas de integración de libs/common contra PostgreSQL y Keycloak reales.
# Uso, desde cualquier carpeta del repositorio (en Windows, con Git Bash):
#
#   bash libs/common/pruebas-integracion.sh
#
# Necesita los contenedores arriba (docker compose up -d) y el archivo .env.
# PostgreSQL no publica puertos, así que las pruebas corren dentro de un contenedor
# temporal de Node conectado a las redes del proyecto. Ese contenedor copia el
# repositorio (sin node_modules), instala las dependencias y ejecuta Jest.
# Usa los documentos ficticios 99999999xx y limpia lo que crea.
set -euo pipefail

cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "No existe .env. Copia .env.example como .env y complétalo."; exit 1; }

# En Git Bash, Docker necesita la ruta con formato de Windows.
RAIZ=$(pwd -W 2>/dev/null || pwd)

MSYS_NO_PATHCONV=1 docker run --rm \
    --network gdp_frontal --network gdp_datos \
    --env-file .env \
    -v "$RAIZ:/repo:ro" \
    node:24-alpine sh -c '
        set -e
        mkdir /trabajo
        cd /repo
        tar --exclude=./node_modules --exclude=./.git --exclude=./libs/common/node_modules --exclude=./libs/common/dist -cf - . | tar -xf - -C /trabajo
        cd /trabajo
        npm ci --no-audit --no-fund --loglevel=error
        npm run test:int -w @gdp/common
    '
