#!/usr/bin/env bash
# Verifica ms-log de extremo a extremo: gateway, token, filtros del log, paginación
# y el registro de las consultas en lenguaje natural con la llave de API de n8n.
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   bash services/ms-log/verificar.sh
#
# Los registros de prueba se insertan directamente en la base de datos con fechas de enero
# de 2020 y los documentos ficticios 99999999xx, para no depender de los demás servicios.
# Limpia lo que crea. Si ms-borrar está arriba, comprueba además el historial de un borrado real.

source "$(dirname "$0")/../verificar-comun.sh"

URL="$APP/api/log"
URL_NL="$APP/api/log/consulta-nl"
DOC_A=9999999951
DOC_B=9999999952
DOC_BORRADO=9999999953
LLAVE=$(env_var N8N_LOG_API_KEY)
MARCA='[verificación ms-log]'

[ -n "$LLAVE" ] || { echo "Falta N8N_LOG_API_KEY en .env."; exit 1; }

# Borra lo de limpiar_pruebas y además los registros de n8n que crea esta verificación.
limpiar_log() {
    limpiar_pruebas
    sql "DELETE FROM log_transaccion WHERE usuario = 'n8n' AND fecha_hora >= '$INICIO';" >/dev/null
}

# consultar TOKEN [PARAMETROS]  → imprime «cuerpo<salto>código»
consultar() { curl -s -w '\n%{http_code}' ${1:+-H "Authorization: Bearer $1"} "$URL?${2:-}"; }
# registrar_nl LLAVE ARCHIVO_JSON  → imprime «cuerpo<salto>código». El cuerpo va en un archivo UTF-8:
# en Windows, los acentos pasados como argumento llegan dañados.
registrar_nl() {
    curl -s -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' ${1:+-H "X-API-Key: $1"} \
        --data-binary "@$2" "$URL_NL"
}
# Cuántos registros trae una respuesta, y el tipo del primero y del último.
cuantos() { printf '%s' "$1" | grep -o '"id":"' | wc -l | tr -d ' '; }
tipos()   { printf '%s' "$1" | grep -o '"tipo":"[A-Z_]*"' | sed 's/"tipo":"\([A-Z_]*\)"/\1/' | paste -sd, -; }
total()   { printf '%s' "$1" | sed -n 's/.*"total":\([0-9]*\).*/\1/p'; }
registros_nl() { sql "SELECT count(*) FROM log_transaccion WHERE usuario = 'n8n' AND fecha_hora >= '$INICIO'"; }
registros_de_prueba_hechos_por_usuarios() {
    sql "SELECT count(*) FROM log_transaccion WHERE usuario IN ('admin.prueba', 'consultor.prueba') AND fecha_hora >= '$INICIO' AND numero_documento IS NULL"
}

esperar_servicio "$URL/docs-json"
cargar_tokens
limpiar_log

# Cuatro registros con horas cerca del cambio de día en Bogotá (UTC-5), para probar los límites:
#   A: CREAR      10-ene-2020 23:30     A: MODIFICAR  11-ene-2020 00:30
#   B: BORRAR     11-ene-2020 12:00     B: CONSULTAR  12-ene-2020 08:00
sql "INSERT INTO log_transaccion (fecha_hora, tipo, numero_documento, usuario, resultado, detalle) VALUES
     ('2020-01-10 23:30:00-05', 'CREAR',     '$DOC_A', 'admin.prueba',     'EXITO', '{\"nuevo\": {}}'),
     ('2020-01-11 00:30:00-05', 'MODIFICAR', '$DOC_A', 'admin.prueba',     'EXITO', '{\"cambios\": {}}'),
     ('2020-01-11 12:00:00-05', 'BORRAR',    '$DOC_B', 'admin.prueba',     'EXITO', '{\"anterior\": {}}'),
     ('2020-01-12 08:00:00-05', 'CONSULTAR', '$DOC_B', 'consultor.prueba', 'ERROR', '{\"estado\": 404}')" >/dev/null

echo "Permisos:"
igual "sin token responde 401" 401 "$(codigo "$(consultar "" "documento=$DOC_A")")"
igual "el consultor puede ver el log" 200 "$(codigo "$(consultar "$TOKEN_CONSULTOR" "documento=$DOC_A")")"
igual "el administrador puede ver el log" 200 "$(codigo "$(consultar "$TOKEN_ADMIN" "documento=$DOC_A")")"
igual "consultar el log no se registra en el log" 0 "$(registros_de_prueba_hechos_por_usuarios)"

echo "Filtros (CP-06):"
r=$(cuerpo "$(consultar "$TOKEN_ADMIN" "documento=$DOC_A")")
igual "por documento: solo sus registros" 2 "$(total "$r")"
igual "del más reciente al más antiguo" "MODIFICAR,CREAR" "$(tipos "$r")"
comprobar "cada registro trae fecha en ISO 8601" contiene "$r" '"fechaHora":"2020-01-11T05:30:00.000Z"'
comprobar "y el resto de sus columnas" contiene "$r" '"usuario":"admin.prueba","resultado":"EXITO","detalle":{"cambios":{}},"pregunta":null,"respuesta":null'
r=$(cuerpo "$(consultar "$TOKEN_ADMIN" "documento=$DOC_A&tipo=CREAR")")
igual "por documento y tipo" "1|CREAR" "$(total "$r")|$(tipos "$r")"
r=$(cuerpo "$(consultar "$TOKEN_ADMIN" "desde=2020-01-11&hasta=2020-01-11")")
igual "un solo día, en hora de Bogotá (excluye las 23:30 del día anterior)" "2|BORRAR,MODIFICAR" "$(total "$r")|$(tipos "$r")"
r=$(cuerpo "$(consultar "$TOKEN_ADMIN" "desde=01-ene-2020&hasta=10-ene-2020")")
igual "fechas escritas como dd-mmm-yyyy, y «hasta» incluye todo el día" "1|CREAR" "$(total "$r")|$(tipos "$r")"
r=$(cuerpo "$(consultar "$TOKEN_ADMIN" "desde=2020-01-12&hasta=2020-01-31")")
igual "rango hasta fin de mes" "1|CONSULTAR" "$(total "$r")|$(tipos "$r")"
r=$(cuerpo "$(consultar "$TOKEN_ADMIN" "tipo=BORRAR&desde=2020-01-01&hasta=2020-01-31")")
igual "tipo y fechas combinados" "1|BORRAR" "$(total "$r")|$(tipos "$r")"
r=$(cuerpo "$(consultar "$TOKEN_ADMIN" "tipo=CREAR&documento=$DOC_B")")
igual "sin coincidencias: total 0 y lista vacía" '0|"registros":[]' "$(total "$r")|$(printf '%s' "$r" | grep -o '"registros":\[\]')"
igual "filtros vacíos cuentan como no enviados" 200 "$(codigo "$(consultar "$TOKEN_ADMIN" "tipo=&documento=&desde=&hasta=")")"

echo "Paginación:"
r=$(cuerpo "$(consultar "$TOKEN_ADMIN" "documento=$DOC_A&tamano=1&pagina=2")")
igual "página 2 de tamaño 1: el registro más antiguo" "2|1|CREAR" "$(total "$r")|$(cuantos "$r")|$(tipos "$r")"
comprobar "informa la página y el tamaño" contiene "$r" '"pagina":2,"tamano":1'
r=$(cuerpo "$(consultar "$TOKEN_ADMIN" "documento=$DOC_A")")
comprobar "sin indicarlos: página 1 de 20" contiene "$r" '"pagina":1,"tamano":20'

echo "Filtros inválidos:"
r=$(consultar "$TOKEN_ADMIN" "tipo=OTRO")
igual "tipo que no existe: 400" 400 "$(codigo "$r")"
comprobar "con el campo y su mensaje" contiene "$(cuerpo "$r")" '"errores":[{"campo":"tipo"'
igual "documento con letras: 400" 400 "$(codigo "$(consultar "$TOKEN_ADMIN" "documento=99ABC")")"
r=$(consultar "$TOKEN_ADMIN" "desde=2020-13-01")
igual "fecha que no existe: 400" 400 "$(codigo "$r")"
comprobar "en el campo desde" contiene "$(cuerpo "$r")" '"campo":"desde"'
igual "fecha escrita que no existe (31-feb-2020): 400" 400 "$(codigo "$(consultar "$TOKEN_ADMIN" "hasta=31-feb-2020")")"
igual "texto que no es una fecha: 400" 400 "$(codigo "$(consultar "$TOKEN_ADMIN" "desde=ayer")")"
r=$(consultar "$TOKEN_ADMIN" "desde=2020-02-01&hasta=2020-01-01")
igual "«desde» posterior a «hasta»: 400" 400 "$(codigo "$r")"
comprobar "en el campo hasta" contiene "$(cuerpo "$r")" '"campo":"hasta"'
igual "tamaño de página mayor que 100: 400" 400 "$(codigo "$(consultar "$TOKEN_ADMIN" "tamano=500")")"
igual "página 0: 400" 400 "$(codigo "$(consultar "$TOKEN_ADMIN" "pagina=0")")"
igual "y nada de eso queda en el log" 0 "$(registros_de_prueba_hechos_por_usuarios)"

echo "Registro de consultas en lenguaje natural (n8n):"
crear_carpeta_temporal
printf '{"pregunta":"%s ¿Cuál es el empleado más joven?","respuesta":"La persona más joven es Ana Peña.","resultado":"EXITO","detalle":{"sesion":"abc"}}' "$MARCA" > "$DIR_TMP/nl_exito.json"
printf '{"pregunta":"%s ¿Cuántas cédulas hay?","resultado":"ERROR","detalle":{"motivo":"Se agotó la cuota diaria del modelo"}}' "$MARCA" > "$DIR_TMP/nl_error.json"
printf '{"respuesta":"sin pregunta","resultado":"QUIZAS"}' > "$DIR_TMP/nl_invalida.json"

igual "sin llave responde 401" 401 "$(codigo "$(registrar_nl "" "$DIR_TMP/nl_exito.json")")"
igual "con una llave equivocada responde 401" 401 "$(codigo "$(registrar_nl "llave-equivocada" "$DIR_TMP/nl_exito.json")")"
r=$(curl -s -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN_ADMIN" \
    --data-binary "@$DIR_TMP/nl_exito.json" "$URL_NL")
igual "un token de Keycloak no reemplaza la llave: 401" 401 "$(codigo "$r")"
igual "y ninguno de esos intentos queda en el log" 0 "$(registros_nl)"

r=$(registrar_nl "$LLAVE" "$DIR_TMP/nl_exito.json")
igual "con la llave correcta responde 201" 201 "$(codigo "$r")"
igual "queda en el log como CONSULTA_NL de n8n, sin documento" "CONSULTA_NL||n8n|EXITO" \
    "$(sql "SELECT tipo || '|' || coalesce(numero_documento, '') || '|' || usuario || '|' || resultado FROM log_transaccion WHERE usuario = 'n8n' ORDER BY id DESC LIMIT 1")"
igual "con la pregunta y la respuesta completas, con tildes" "$MARCA ¿Cuál es el empleado más joven?|La persona más joven es Ana Peña." \
    "$(sql "SELECT pregunta || '|' || respuesta FROM log_transaccion WHERE usuario = 'n8n' ORDER BY id DESC LIMIT 1")"

r=$(registrar_nl "$LLAVE" "$DIR_TMP/nl_error.json")
igual "un intento fallido del modelo también se registra: 201" 201 "$(codigo "$r")"
igual "con resultado ERROR, sin respuesta y con el motivo" "ERROR||Se agotó la cuota diaria del modelo" \
    "$(sql "SELECT resultado || '|' || coalesce(respuesta, '') || '|' || (detalle ->> 'motivo') FROM log_transaccion WHERE usuario = 'n8n' ORDER BY id DESC LIMIT 1")"

r=$(registrar_nl "$LLAVE" "$DIR_TMP/nl_invalida.json")
igual "cuerpo inválido: 400" 400 "$(codigo "$r")"
comprobar "indica el campo pregunta" contiene "$(cuerpo "$r")" '"campo":"pregunta"'
comprobar "y el campo resultado" contiene "$(cuerpo "$r")" '"campo":"resultado"'
igual "y el rechazo queda en el log como CONSULTA_NL de n8n" "CONSULTA_NL|n8n|ERROR|400" \
    "$(sql "SELECT tipo || '|' || usuario || '|' || resultado || '|' || (detalle ->> 'estado') FROM log_transaccion WHERE usuario = 'n8n' ORDER BY id DESC LIMIT 1")"

r=$(cuerpo "$(consultar "$TOKEN_CONSULTOR" "tipo=CONSULTA_NL&desde=$(date +%Y-%m-%d)&hasta=$(date +%Y-%m-%d)&tamano=100")")
comprobar "las consultas en lenguaje natural se ven al filtrar por CONSULTA_NL" contiene "$r" "La persona más joven es Ana Peña."
comprobar "sin documento y con n8n como usuario" contiene "$r" '"numeroDocumento":null,"usuario":"n8n"'

echo "Historial de una persona borrada (CP-05):"
if [ -n "$(docker compose ps -q --status running ms-borrar)" ]; then
    insertar_persona_de_prueba $DOC_BORRADO
    curl -s -o /dev/null -H "Authorization: Bearer $TOKEN_ADMIN" "$APP/api/borrar/personas/$DOC_BORRADO"
    curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN_ADMIN" "$APP/api/borrar/personas/$DOC_BORRADO"
    r=$(cuerpo "$(consultar "$TOKEN_CONSULTOR" "documento=$DOC_BORRADO")")
    igual "después de borrarla, su historial sigue en el log" "2|BORRAR,CONSULTAR" "$(total "$r")|$(tipos "$r")"
    comprobar "con los datos que tenía" contiene "$r" '"correo":"prueba.verificacion@example.com"'
else
    echo "  (ms-borrar no está arriba: se omite)"
fi

echo "Documentación:"
d=$(curl -s "$URL/docs-json")
comprobar "publica OpenAPI en /api/log/docs-json" contiene "$d" '"/api/log"'
comprobar "con la ruta de n8n" contiene "$d" '"/api/log/consulta-nl"'

limpiar_log
terminar "ms-log funciona como dice el diseño."
