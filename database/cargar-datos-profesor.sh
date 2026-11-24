#!/bin/sh
# Deja la base SOLO con los datos del profesor (tarea T25): vacía las personas, el log y el índice
# del chat, carga database/datos-profesor.sql y reindexa el chat en n8n.
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   bash database/cargar-datos-profesor.sh        # pide confirmación
#   bash database/cargar-datos-profesor.sh --si   # sin preguntar (en la sustentación)
#
# database/datos-profesor.sql se crea a partir de database/datos-profesor.plantilla.sql y no se sube
# al repositorio. Todo el vaciado y la carga van en una sola transacción: si una fila no cumple las
# validaciones, la base queda como estaba.

set -e

ARCHIVO=database/datos-profesor.sql

if [ ! -f "$ARCHIVO" ]; then
    echo "Falta $ARCHIVO. Cópialo de database/datos-profesor.plantilla.sql y pon ahí los datos del correo."
    exit 1
fi
if grep -q "'1000000001', 'Cédula', 'Nombre'" "$ARCHIVO"; then
    echo "$ARCHIVO todavía tiene la fila de ejemplo de la plantilla. Reemplázala por los datos del profesor."
    exit 1
fi

if [ "$1" != "--si" ]; then
    echo "Esto BORRA todas las personas, todo el log y el índice del chat, y deja solo los datos de $ARCHIVO."
    printf "Escribe SI para continuar: "
    read -r respuesta
    [ "$respuesta" = "SI" ] || { echo "Cancelado. No se cambió nada."; exit 1; }
fi

echo "Vaciando y cargando..."
{
    echo 'BEGIN;'
    echo 'TRUNCATE persona, log_transaccion RESTART IDENTITY;'
    echo 'DELETE FROM persona_embedding;'
    cat "$ARCHIVO"
    echo 'COMMIT;'
} | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q' || {
    echo "No se cargó nada y la base quedó como estaba: una fila no cumple las validaciones (mira el error de arriba)."
    echo "Corrígela o quítala de $ARCHIVO. Las personas inválidas a propósito se prueban en el formulario."
    exit 1
}

echo "Reindexando el chat en n8n (puede tardar un minuto)..."
if MSYS_NO_PATHCONV=1 docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5690 n8n \
    n8n execute --id=gdpReindexarTodo >/dev/null 2>&1; then
    echo "Listo: la base y el chat quedaron solo con los datos del profesor."
else
    echo "Los datos quedaron cargados, pero no se pudo reindexar el chat."
    echo "Abre «Reindexar todo» en n8n (http://localhost:5678) y pulsa Execute workflow."
    exit 1
fi
