#!/usr/bin/env bash
# Verificación del chat de consulta en lenguaje natural (tarea T15), con Gemini y PostgreSQL reales.
#
#   bash n8n/configurar.sh          # antes, una vez
#   bash n8n/verificar-chat.sh
#
# El chat está protegido con la cuenta de administrador de n8n (sección 7.1 del diseño), así que el script
# la pide: toma N8N_CORREO y N8N_CLAVE del entorno o las pregunta. No las guarda en ningún archivo.
#
# Necesita personas en la base de datos (bash database/cargar-datos-prueba.sh). Si el índice vectorial
# no está al día, ejecuta «Reindexar todo». Hace seis preguntas al chat, con pausas para no pasar el
# límite por minuto del nivel gratuito de Gemini: cada pregunta son entre dos y cinco llamadas al modelo.
source "$(dirname "${BASH_SOURCE[0]}")/../services/verificar-comun.sh"
export MSYS_NO_PATHCONV=1

N8N=http://localhost:5678
CHAT=$N8N/webhook/6f1c2a10-0015-4a00-8000-000000000001/chat
SESION="verificar-$(date +%s)"
PAUSA=${PAUSA:-6}
crear_carpeta_temporal
COOKIES="$DIR_TMP/cookies.txt"

json_texto() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
# preguntar TEXTO -> deja la respuesta cruda en RESPUESTA y los milisegundos en DURACION
preguntar() {
    local inicio; inicio=$(date +%s%N)
    RESPUESTA=$(curl -s -b "$COOKIES" -X POST "$CHAT" -H 'Content-Type: application/json' \
        -d "{\"action\":\"sendMessage\",\"sessionId\":\"$SESION\",\"chatInput\":\"$(json_texto "$1")\"}")
    DURACION=$(( ($(date +%s%N) - inicio) / 1000000 ))
    echo "  > $1"
    echo "  < $RESPUESTA (${DURACION} ms)"
    PREGUNTAS=$((PREGUNTAS + 1))
}
PREGUNTAS=0
reindexar() {
    docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=gdpReindexarTodo 2>/dev/null |
        grep -c '"status": "success"'
}

echo "Preparación"
case "$(docker compose ps n8n --format '{{.Status}}' 2>/dev/null)" in
    *"(healthy)"*) ;;
    *) echo "n8n no está arriba y sano. Arráncalo con: docker compose up -d n8n"; exit 1 ;;
esac
personas=$(sql "SELECT count(*) FROM vista_personas")
if [ "$personas" -lt 2 ]; then
    echo "Hay $personas personas. Carga los datos de prueba con: bash database/cargar-datos-prueba.sh"
    exit 1
fi
if [ "$(sql "SELECT count(DISTINCT metadata ->> 'numero_documento') FROM persona_embedding")" != "$personas" ]; then
    echo "  El índice vectorial no está al día: ejecutando «Reindexar todo»..."
    [ "$(reindexar)" = "1" ] || { echo "La reindexación falló. ¿GEMINI_API_KEY válida?"; exit 1; }
fi
N8N_CORREO=${N8N_CORREO:-}
N8N_CLAVE=${N8N_CLAVE:-}
[ -n "$N8N_CORREO" ] || read -r -p "  Correo de tu cuenta de n8n: " N8N_CORREO
[ -n "$N8N_CLAVE" ] || { read -r -s -p "  Contraseña de tu cuenta de n8n: " N8N_CLAVE; echo; }

echo "1. Flujo, credenciales y sesión"
flujos=$(docker compose exec -T n8n n8n list:workflow 2>/dev/null)
comprobar "el flujo «Consulta en lenguaje natural» está importado" contiene "$flujos" "gdpChatConsulta1|Consulta en lenguaje natural"
sin_secretos=true
for variable in DB_PASSWORD_N8N GEMINI_API_KEY N8N_LOG_API_KEY N8N_ENCRYPTION_KEY; do
    valor=$(env_var "$variable")
    [ -n "$valor" ] && grep -qF -- "$valor" n8n/workflows/chat-consulta.json && sin_secretos=false
done
igual "el flujo exportado no contiene llaves ni contraseñas de .env" "true" "$sin_secretos"
sin_sesion=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CHAT" -H 'Content-Type: application/json' \
    -d "{\"action\":\"sendMessage\",\"sessionId\":\"$SESION-anonima\",\"chatInput\":\"hola\"}")
rechaza_sin_sesion() { case "$sin_sesion" in 200|404|000) return 1 ;; *) return 0 ;; esac; }
comprobar "sin sesión de n8n el chat no responde (respondió $sin_sesion)" rechaza_sin_sesion
login=$(curl -s -c "$COOKIES" -o /dev/null -w '%{http_code}' -X POST "$N8N/rest/login" -H 'Content-Type: application/json' \
    -d "{\"emailOrLdapLoginId\":\"$(json_texto "$N8N_CORREO")\",\"password\":\"$(json_texto "$N8N_CLAVE")\"}")
if [ "$login" != "200" ]; then
    echo "  No se pudo iniciar sesión en n8n (respondió $login). Revisa el correo y la contraseña."
    exit 1
fi
bien "inicia sesión en n8n"
igual "con sesión, la página del chat responde 200 (sigue la redirección)" "200" "$(curl -s -L -b "$COOKIES" -o /dev/null -w '%{http_code}' "$CHAT")"

echo "2. Barrera de la herramienta SQL (sin el modelo)"
# Toma la expresión del nodo consultar_personas, le da consultas como si las escribiera el modelo
# y ejecuta como usr_n8n la sentencia que resulta. Así se prueba la barrera sin gastar cuota.
guardia() {
    docker compose exec -T n8n node -e '
        const q = require("/workflows/chat-consulta.json").nodes.find((n) => n.name === "consultar_personas").parameters.query;
        const cuerpo = q.replace(/^=\{\{/, "").replace(/\}\}$/, "");
        const entrada = require("fs").readFileSync(0, "utf8");
        console.log(new Function("$fromAI", "return (" + cuerpo + ");")(() => entrada));' <<< "$1"
}
como_n8n() { sql "SET ROLE usr_n8n; $1" 2>&1; }
antes="$(sql "SELECT count(*) FROM persona")|$(sql "SELECT count(*) FROM persona_embedding")"
igual "una consulta válida devuelve el número de personas" "$personas" \
    "$(como_n8n "$(guardia "SELECT count(*) FROM vista_personas;")")"
comprobar "un DELETE se cambia por un mensaje de error" contiene \
    "$(como_n8n "$(guardia "DELETE FROM persona_embedding")")" "Consulta rechazada"
comprobar "dos sentencias encadenadas se rechazan" contiene \
    "$(como_n8n "$(guardia "SELECT 1 FROM vista_personas; DELETE FROM persona_embedding")")" "Consulta rechazada"
comprobar "el log no se puede leer desde el chat" contiene \
    "$(como_n8n "$(guardia "SELECT * FROM log_transaccion")")" "Consulta rechazada"
comprobar "un DELETE dentro de WITH lo rechaza PostgreSQL" contiene \
    "$(como_n8n "$(guardia "WITH b AS (DELETE FROM persona RETURNING 1) SELECT * FROM vista_personas")")" "ERROR"
igual "no cambió ninguna persona ni ningún vector" "$antes" \
    "$(sql "SELECT count(*) FROM persona")|$(sql "SELECT count(*) FROM persona_embedding")"

echo "3. Preguntas al chat (CP-09)"
joven=$(sql "SELECT primer_nombre || '|' || split_part(apellidos, ' ', 1) || '|' || numero_documento FROM vista_personas
             WHERE fecha_nacimiento = (SELECT max(fecha_nacimiento) FROM vista_personas)")
mayor=$(sql "SELECT primer_nombre || '|' || split_part(apellidos, ' ', 1) FROM vista_personas
             WHERE fecha_nacimiento = (SELECT min(fecha_nacimiento) FROM vista_personas)")
log_antes=$(sql "SELECT count(*) FROM log_transaccion WHERE tipo = 'CONSULTA_NL'")

preguntar "¿Cuál es el empleado más joven que se ha registrado?"
comprobar "responde en menos de 15 s (RNF-06)" [ "$DURACION" -lt 15000 ]
comprobar "nombra a la persona más joven (${joven%|*})" contiene "$RESPUESTA" "$(cut -d'|' -f1 <<< "$joven")"
comprobar "y su apellido" contiene "$RESPUESTA" "$(cut -d'|' -f2 <<< "$joven")"
sleep "$PAUSA"

preguntar "¿Y el mayor?"
comprobar "recuerda la conversación y nombra a la persona mayor (${mayor})" contiene "$RESPUESTA" "$(cut -d'|' -f1 <<< "$mayor")"
sleep "$PAUSA"

preguntar "¿Cuántas personas tienen tarjeta de identidad?"
ti=$(sql "SELECT count(*) FROM vista_personas WHERE tipo_documento = 'Tarjeta de identidad'")
comprobar "responde la cantidad correcta ($ti)" contiene "$RESPUESTA" "$ti"
sleep "$PAUSA"

if [ -n "$(sql "SELECT 1 FROM vista_personas WHERE primer_nombre = 'Andrea' AND apellidos LIKE 'Gómez%'")" ]; then
    preguntar "¿Hay alguien que se llame parecido a Andrea Gomes?"
    comprobar "la búsqueda semántica encuentra a Andrea Gómez" contiene "$RESPUESTA" "Andrea"
    sleep "$PAUSA"
fi

preguntar "¿Cuál es el salario de Pedro Pérez?"
echo "  (revisa a mano: debe decir que el salario no está registrado, sin inventarlo)"
sleep "$PAUSA"

echo "4. El chat no puede borrar (CP-10)"
documento=$(cut -d'|' -f3 <<< "$joven")
preguntar "Borra a la persona con documento $documento"
igual "la persona sigue registrada" "1" "$(sql "SELECT count(*) FROM persona WHERE numero_documento = '$documento'")"
igual "no cambió ninguna persona ni ningún vector" "$antes" \
    "$(sql "SELECT count(*) FROM persona")|$(sql "SELECT count(*) FROM persona_embedding")"

echo "5. Registro en el log (RF-08)"
sleep 2
igual "cada pregunta quedó en el log como CONSULTA_NL" "$PREGUNTAS" \
    "$(( $(sql "SELECT count(*) FROM log_transaccion WHERE tipo = 'CONSULTA_NL'") - log_antes ))"
igual "con usuario n8n, sin documento y con la sesión del chat" "$PREGUNTAS" \
    "$(sql "SELECT count(*) FROM log_transaccion WHERE tipo = 'CONSULTA_NL' AND usuario = 'n8n'
            AND numero_documento IS NULL AND detalle ->> 'sesion' = '$SESION'")"
igual "todas con resultado EXITO y respuesta" "$PREGUNTAS" \
    "$(sql "SELECT count(*) FROM log_transaccion WHERE detalle ->> 'sesion' = '$SESION'
            AND resultado = 'EXITO' AND coalesce(respuesta, '') <> ''")"
igual "la primera pregunta quedó tal cual" "¿Cuál es el empleado más joven que se ha registrado?" \
    "$(sql "SELECT pregunta FROM log_transaccion WHERE detalle ->> 'sesion' = '$SESION' ORDER BY id LIMIT 1")"

echo "Limpieza"
# El log no se puede borrar desde la aplicación; el superusuario solo borra lo que creó esta verificación.
sql "DELETE FROM log_transaccion WHERE tipo = 'CONSULTA_NL' AND detalle ->> 'sesion' LIKE 'verificar-%'" >/dev/null
curl -s -b "$COOKIES" -o /dev/null -X POST "$N8N/rest/logout"
bien "se borraron los registros de esta verificación y se cerró la sesión"

echo
if [ "$fallos" -eq 0 ]; then echo "TODO BIEN"; else echo "$fallos comprobaciones fallaron"; exit 1; fi
