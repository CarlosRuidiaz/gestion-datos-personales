#!/usr/bin/env bash
# Configuración de n8n desde la línea de comandos (tareas T14 y T15). Se puede ejecutar las veces que haga falta.
#
#   bash n8n/configurar.sh
#
# 1. Crea o actualiza las credenciales de PostgreSQL (usr_n8n), de Gemini y de la llave de ms-log
#    (cabecera X-API-Key con N8N_LOG_API_KEY) con los valores de .env.
#    Los valores pasan por la entrada estándar al contenedor y n8n los guarda cifrados con
#    N8N_ENCRYPTION_KEY: no quedan en ningún archivo del repositorio ni en la línea de comandos.
# 2. Importa todos los flujos de n8n/workflows (reemplaza los que ya existan con el mismo id).
# 3. Publica los flujos que se activan solos (webhook o chat) y reinicia n8n para que los cargue.
#
# No crea la cuenta de administrador de n8n: esa se crea en http://localhost:5678 la primera vez.
set -euo pipefail
# En Git Bash (Windows), evita que las rutas del contenedor (/workflows) se conviertan en rutas de Windows.
export MSYS_NO_PATHCONV=1
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
[ -f .env ] || { echo "No existe .env. Copia .env.example como .env y complétalo."; exit 1; }

env_var() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | tr -d '\r'; }
# Quita de la salida de la CLI de n8n las advertencias de configuración y de licencia.
sin_avisos() { grep -v -i -e deprecat -e '^ *- ' -e '^$' -e 'license SDK' || true; }

# Identificadores fijos: los flujos exportados hacen referencia a estas credenciales por su id.
ID_CRED_POSTGRES=gdpCredPostgres1
ID_CRED_GEMINI=gdpCredGemini001
ID_CRED_LOG=gdpCredMsLogKey1
# Flujos que deben quedar publicados (activos): el webhook de indexación (T14) y el chat (T15).
PUBLICAR=(gdpIndexarPerson gdpChatConsulta1)
# Id del webhook del chat (fijo en n8n/workflows/chat-consulta.json): la URL del chat no cambia entre equipos.
CHAT_URL=http://localhost:5678/webhook/6f1c2a10-0015-4a00-8000-000000000001/chat

DB_PASS=$(env_var DB_PASSWORD_N8N)
GEMINI=$(env_var GEMINI_API_KEY)
LLAVE_LOG=$(env_var N8N_LOG_API_KEY)
DB_NOMBRE=$(env_var POSTGRES_DB); DB_NOMBRE=${DB_NOMBRE:-gestion_personas}
[ -n "$DB_PASS" ] || { echo "Falta DB_PASSWORD_N8N en .env."; exit 1; }
[ -n "$GEMINI" ] || { echo "Falta GEMINI_API_KEY en .env (se obtiene gratis en Google AI Studio)."; exit 1; }
[ -n "$LLAVE_LOG" ] || { echo "Falta N8N_LOG_API_KEY en .env (la misma que usa ms-log)."; exit 1; }

estado=$(docker compose ps n8n --format '{{.Status}}' 2>/dev/null || true)
case "$estado" in
    *healthy*) ;;
    *) echo "n8n no está arriba y sano. Arráncalo con: docker compose up -d n8n (y espera unos segundos)"; exit 1 ;;
esac

echo "1. Credenciales"
# El script de node lee las cuatro líneas de la entrada estándar y arma el JSON dentro del contenedor.
printf '%s\n%s\n%s\n%s\n' "$DB_PASS" "$GEMINI" "$DB_NOMBRE" "$LLAVE_LOG" | docker compose exec -T n8n sh -c '
    umask 077
    node -e "
        const [clave, llave, base, llaveLog] = require(\"fs\").readFileSync(0, \"utf8\").split(\"\n\");
        const credenciales = [
            { id: \"'"$ID_CRED_POSTGRES"'\", name: \"PostgreSQL (usr_n8n)\", type: \"postgres\",
              data: { host: \"postgres\", port: 5432, database: base, user: \"usr_n8n\", password: clave, ssl: \"disable\" } },
            { id: \"'"$ID_CRED_GEMINI"'\", name: \"Google Gemini\", type: \"googlePalmApi\",
              data: { host: \"https://generativelanguage.googleapis.com\", apiKey: llave } },
            { id: \"'"$ID_CRED_LOG"'\", name: \"Llave de ms-log\", type: \"httpHeaderAuth\",
              data: { name: \"X-API-Key\", value: llaveLog } },
        ];
        require(\"fs\").writeFileSync(\"/tmp/credenciales.json\", JSON.stringify(credenciales));
    "
    n8n import:credentials --input=/tmp/credenciales.json; codigo=$?
    rm -f /tmp/credenciales.json
    exit $codigo
' 2>&1 | sin_avisos

echo "2. Flujos"
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows 2>&1 | sin_avisos

echo "3. Publicación"
for id in "${PUBLICAR[@]}"; do
    docker compose exec -T n8n n8n publish:workflow --id="$id" 2>&1 | sin_avisos
done

# El n8n que está corriendo registra el webhook unos segundos después de publicar.
# Un aviso vacío responde 400 cuando el flujo ya está activo (y 404 mientras no lo está).
for _ in $(seq 1 30); do
    codigo=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:5678/webhook/indexar-persona \
        -H 'Content-Type: application/json' -d '{}' || true)
    [ "$codigo" = "400" ] && break
    sleep 2
done
[ "$codigo" = "400" ] || { echo "El webhook de indexación no quedó activo (respondió $codigo). Revisa: docker compose logs n8n"; exit 1; }

# El chat responde 404 mientras no está activo. Activo, sin sesión de n8n responde otro código (401 o una redirección).
for _ in $(seq 1 30); do
    codigo=$(curl -s -o /dev/null -w '%{http_code}' "$CHAT_URL" || true)
    [ "$codigo" != "404" ] && [ "$codigo" != "000" ] && break
    sleep 2
done
case "$codigo" in
    404|000) echo "El chat no quedó activo (respondió $codigo). Revisa: docker compose logs n8n"; exit 1 ;;
esac

echo "Listo. Flujos en n8n:"
docker compose exec -T n8n n8n list:workflow 2>/dev/null | sin_avisos
echo "Webhook de indexación activo en http://localhost:5678/webhook/indexar-persona"
echo "Chat activo en $CHAT_URL (se entra con la cuenta de administrador de n8n)"
if [ "$(env_var N8N_CHAT_URL)" != "$CHAT_URL" ]; then
    echo "Para que el menú de la aplicación abra el chat, pon en .env: N8N_CHAT_URL=$CHAT_URL"
    echo "y recrea el frontend: docker compose up -d frontend"
fi
