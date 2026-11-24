#!/bin/sh
# Deja la base SOLO con los datos del profesor (tareas T25, T28 y T29): vacía las personas, el log y el
# índice del chat, carga los datos (con sus fotos) y reindexa el chat en n8n.
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   bash database/cargar-datos-profesor.sh --revisar   # solo muestra qué se cargaría; no toca la base
#   bash database/cargar-datos-profesor.sh             # pide confirmación
#   bash database/cargar-datos-profesor.sh --si        # sin preguntar (en la sustentación)
#
# Los datos se leen de la carpeta database/datos-profesor/, con los archivos tal como llegan por correo:
# el Excel (.xlsx) o CSV y, si hay, el .zip de fotos (o las fotos sueltas). Si la carpeta no existe, se
# usa database/datos-profesor.sql (escrito a mano desde la plantilla). Nada de eso se sube al repositorio.
# Las filas inválidas quedan fuera con su motivo y las demás se cargan. El vaciado y la carga van en una
# sola transacción: si algo falla, la base queda como estaba.

set -e

CARPETA=database/datos-profesor
SQL=database/datos-profesor.sql
MODO="${1:-}"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

if [ -d "$CARPETA" ]; then
    if ! command -v node >/dev/null 2>&1; then
        echo "Para leer $CARPETA hace falta Node.js 22 o superior (el mismo de los microservicios)."
        exit 1
    fi
    echo "Leyendo $CARPETA/..."
    node database/datos-profesor.mjs "$CARPETA" > "$TMP" || { echo "No se cargó nada."; exit 1; }
    echo
elif [ -f "$SQL" ]; then
    if grep -q "'1000000001', 'Cédula', 'Nombre'" "$SQL"; then
        echo "$SQL todavía tiene la fila de ejemplo de la plantilla. Reemplázala por los datos del profesor."
        exit 1
    fi
    cp "$SQL" "$TMP"
    echo "Personas en $SQL: $(grep -c "^    ('" "$SQL")"
else
    echo "No hay datos del profesor. Crea la carpeta $CARPETA y pon ahí su Excel y el zip de fotos tal como llegaron"
    echo "(o copia database/datos-profesor.plantilla.sql como $SQL y llénalo a mano)."
    exit 1
fi

if [ "$MODO" = "--revisar" ]; then
    echo "Revisión terminada. No se cambió nada en la base."
    exit 0
fi

if [ "$MODO" != "--si" ]; then
    echo "Esto BORRA todas las personas, todo el log y el índice del chat, y deja solo los datos de arriba."
    printf "Escribe SI para continuar: "
    read -r respuesta
    [ "$respuesta" = "SI" ] || { echo "Cancelado. No se cambió nada."; exit 1; }
fi

echo "Vaciando y cargando..."
{
    echo 'BEGIN;'
    echo 'TRUNCATE persona, log_transaccion RESTART IDENTITY;'
    echo 'DELETE FROM persona_embedding;'
    cat "$TMP"
    echo 'COMMIT;'
    echo 'SELECT count(*) AS personas_cargadas, count(foto) AS con_foto FROM persona;'
} | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q' || {
    echo "No se cargó nada y la base quedó como estaba (mira el error de arriba)."
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
