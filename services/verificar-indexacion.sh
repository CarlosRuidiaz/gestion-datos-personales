#!/usr/bin/env bash
# Verifica que ms-crear, ms-modificar y ms-borrar avisan a n8n después de cada cambio,
# con el contrato de n8n/README.md, sin esperar la respuesta y sin fallar si n8n no está.
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   bash services/verificar-indexacion.sh
#
# Parte 1 (siempre): reemplaza n8n por un «espía» (services/espia-webhook.js) que registra
# cada aviso, recreando los tres servicios con N8N_WEBHOOK_INDEXACION_URL apuntando a él.
# Al terminar los deja como estaban. Parte 2 (si n8n está configurado y hay GEMINI_API_KEY):
# el camino real, comprobando que el vector de la persona aparece y desaparece.
# Usa los documentos ficticios 99999999xx y limpia lo que crea.

source "$(dirname "$0")/verificar-comun.sh"

ESPIA=gdp-espia-n8n
URL_ESPIA="http://$ESPIA:8080/webhook/indexar-persona"
SERVICIOS="ms-crear ms-modificar ms-borrar"
DOC=9999999951
DOC_LENTO=9999999952
DOC_CAIDO=9999999953
DOC_REAL=9999999954

restaurar() {
    docker rm -f "$ESPIA" >/dev/null 2>&1
    docker compose up -d $SERVICIOS >/dev/null 2>&1
}
trap restaurar EXIT

cargar_tokens
crear_fotos_de_prueba
limpiar_pruebas

# crear DOCUMENTO [campo=valor ...] / modificar DOCUMENTO [campo=valor ...] [-- opciones de curl]
crear() {
    local doc="$1"; shift
    formulario_persona "$doc" "$@"
    curl -s -o /dev/null -w '%{http_code}' -X POST "$APP/api/crear/personas" -H "Authorization: Bearer $TOKEN_ADMIN" "${FORM[@]}"
}
modificar() {
    local doc="$1"; shift
    local campos=("numeroDocumento=__OMITIR__")
    while [ $# -gt 0 ] && [ "$1" != "--" ]; do campos+=("$1"); shift; done
    [ "${1:-}" = "--" ] && shift
    formulario_persona "$doc" "${campos[@]}"
    curl -s -o /dev/null -w '%{http_code}' -X PUT "$APP/api/modificar/personas/$doc" -H "Authorization: Bearer $TOKEN_ADMIN" "${FORM[@]}" "$@"
}
borrar() { curl -s -o /dev/null -w '%{http_code}' -X DELETE "$APP/api/borrar/personas/$1" -H "Authorization: Bearer $TOKEN_ADMIN"; }

avisos() { docker logs "$ESPIA" 2>/dev/null | grep '^{'; }
# avisos_de DOCUMENTO → operaciones recibidas para ese documento, separadas por comas
avisos_de() { avisos | grep "\\\\\"numeroDocumento\\\\\":\\\\\"$1\\\\\"" | sed -n 's/.*operacion\\":\\"\([A-Z]*\)\\".*/\1/p' | paste -sd, -; }
# espera_avisos DOCUMENTO ESPERADO: hasta 10 segundos a que lleguen los avisos esperados
espera_avisos() { for _ in $(seq 1 20); do [ "$(avisos_de "$1")" = "$2" ] && break; sleep 0.5; done; avisos_de "$1"; }
# sin_avisos_nuevos DOCUMENTO ESPERADO: espera un poco y confirma que no llegó nada más
sin_avisos_nuevos() { sleep 2; avisos_de "$1"; }

echo "Preparando el espía en lugar de n8n:"
docker rm -f "$ESPIA" >/dev/null 2>&1
docker run -d --name "$ESPIA" --network gdp_frontal node:24-alpine node -e "$(cat "$(dirname "$0")/espia-webhook.js")" >/dev/null
N8N_WEBHOOK_INDEXACION_URL="$URL_ESPIA" docker compose up -d $SERVICIOS >/dev/null 2>&1
for s in crear modificar borrar; do esperar_servicio "$APP/api/$s/docs-json"; done
comprobar "los tres servicios apuntan al espía" test "$(for s in $SERVICIOS; do docker compose exec -T $s printenv N8N_WEBHOOK_INDEXACION_URL; done | tr -d '\r' | sort -u)" = "$URL_ESPIA"

echo "Crear:"
igual "crear una persona: responde 201" 201 "$(crear $DOC)"
igual "avisa CREAR" "CREAR" "$(espera_avisos $DOC CREAR)"
a=$(avisos | grep "$DOC" | head -n 1)
comprobar "con POST a /webhook/indexar-persona"  contiene "$a" '"metodo":"POST","ruta":"/webhook/indexar-persona"'
comprobar "en JSON"                              contiene "$a" '"tipo":"application/json"'
comprobar "con el contrato exacto: documento y operación" contiene "$a" "\"cuerpo\":\"{\\\"numeroDocumento\\\":\\\"$DOC\\\",\\\"operacion\\\":\\\"CREAR\\\"}\""
igual "documento repetido (409): no avisa" 409 "$(crear $DOC)"
igual "datos inválidos (400): no avisa" 400 "$(crear 9999999955 celular=123)"
igual "y no llegó ningún aviso más" "CREAR" "$(sin_avisos_nuevos $DOC)"
igual "ni para el documento rechazado" "" "$(avisos_de 9999999955)"

echo "Modificar:"
igual "buscar antes de modificar no avisa" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "$APP/api/modificar/personas/$DOC")"
igual "cambiar el correo: responde 200" 200 "$(modificar $DOC correo=nuevo.correo@example.com)"
igual "avisa MODIFICAR" "CREAR,MODIFICAR" "$(espera_avisos $DOC CREAR,MODIFICAR)"
igual "guardar sin cambios: responde 200" 200 "$(modificar $DOC correo=nuevo.correo@example.com)"
igual "cambiar solo la foto: responde 200" 200 "$(modificar $DOC correo=nuevo.correo@example.com -- -F "foto=@$DIR_TMP/foto.png;type=image/png")"
igual "ninguno de los dos avisa (la foto no se indexa)" "CREAR,MODIFICAR" "$(sin_avisos_nuevos $DOC)"
igual "datos inválidos (400): no avisa" 400 "$(modificar $DOC celular=123)"
igual "documento que no existe (404): no avisa" 404 "$(modificar 9999999959)"
igual "y no llegó nada" "CREAR,MODIFICAR" "$(sin_avisos_nuevos $DOC)"

echo "Borrar:"
igual "buscar antes de borrar no avisa" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "$APP/api/borrar/personas/$DOC")"
igual "borrar: responde 204" 204 "$(borrar $DOC)"
igual "avisa BORRAR" "CREAR,MODIFICAR,BORRAR" "$(espera_avisos $DOC CREAR,MODIFICAR,BORRAR)"
igual "borrar otra vez (404): no avisa" 404 "$(borrar $DOC)"
igual "y no llegó nada" "CREAR,MODIFICAR,BORRAR" "$(sin_avisos_nuevos $DOC)"

echo "n8n lento o apagado:"
docker exec "$ESPIA" wget -qO- --post-data=8000 http://localhost:8080/lento >/dev/null
inicio=$(date +%s%N)
igual "con n8n tardando 8 s en responder, crear responde 201" 201 "$(crear $DOC_LENTO)"
ms=$(( ($(date +%s%N) - inicio) / 1000000 ))
comprobar "sin esperarlo (tardó $ms ms)" test "$ms" -lt 3000
igual "y el aviso sí se envió" "CREAR" "$(espera_avisos $DOC_LENTO CREAR)"
docker rm -f "$ESPIA" >/dev/null 2>&1
igual "con n8n apagado, crear responde 201" 201 "$(crear $DOC_CAIDO)"
igual "la persona quedó guardada" 1 "$(sql "SELECT count(*) FROM persona WHERE numero_documento = '$DOC_CAIDO'")"
igual "con su registro en el log" "CREAR|admin.prueba|EXITO|" "$(ultimo_log $DOC_CAIDO)"
igual "modificar también responde 200" 200 "$(modificar $DOC_CAIDO correo=otro@example.com)"
igual "y borrar 204" 204 "$(borrar $DOC_CAIDO)"
# Sin el espía, el nombre no resuelve y el aviso se rinde al cumplir su límite de 5 segundos.
for _ in $(seq 1 20); do contiene "$(docker compose logs --since 2m ms-crear 2>&1)" "aviso CREAR de $DOC_CAIDO" && break; sleep 0.5; done
comprobar "el servicio deja una advertencia en su log" contiene "$(docker compose logs --since 2m ms-crear 2>&1)" "n8n no recibió el aviso CREAR de $DOC_CAIDO"

echo "Configuración normal:"
restaurar
for s in crear modificar borrar; do esperar_servicio "$APP/api/$s/docs-json"; done
comprobar "los tres servicios vuelven a apuntar a n8n" test "$(for s in $SERVICIOS; do docker compose exec -T $s printenv N8N_WEBHOOK_INDEXACION_URL; done | tr -d '\r' | sort -u)" = "$(env_var N8N_WEBHOOK_INDEXACION_URL)"

echo "Camino real con n8n y Gemini:"
vectores() { sql "SELECT count(*) FROM persona_embedding WHERE metadata->>'numero_documento' = '$1'"; }
espera_vectores() { for _ in $(seq 1 30); do [ "$(vectores "$1")" = "$2" ] && break; sleep 1; done; vectores "$1"; }
# Un aviso vacío responde 400 si el flujo está publicado y 404 si no (n8n/README.md).
publicado=$(docker compose exec -T n8n node -e 'fetch("http://localhost:5678/webhook/indexar-persona",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>console.log(r.status)).catch(()=>console.log(0))' 2>/dev/null | tr -d '\r')
if [ -z "$(env_var GEMINI_API_KEY)" ] || [ "$publicado" != 400 ]; then
    echo "  OMITIDO  falta GEMINI_API_KEY en .env o n8n no está configurado (bash n8n/configurar.sh)."
    echo "           La parte 1 ya comprobó los avisos; esta parte confirma que n8n los procesa."
else
    igual "crear una persona: responde 201" 201 "$(crear $DOC_REAL)"
    igual "n8n guarda su vector" 1 "$(espera_vectores $DOC_REAL 1)"
    igual "modificarla: responde 200" 200 "$(modificar $DOC_REAL correo=cambiado@example.com)"
    for _ in $(seq 1 30); do contiene "$(sql "SELECT text FROM persona_embedding WHERE metadata->>'numero_documento' = '$DOC_REAL'")" 'cambiado@example.com' && break; sleep 1; done
    comprobar "el vector se actualiza con el correo nuevo" contiene "$(sql "SELECT text FROM persona_embedding WHERE metadata->>'numero_documento' = '$DOC_REAL'")" 'cambiado@example.com'
    igual "sigue habiendo un solo vector" 1 "$(vectores $DOC_REAL)"
    igual "borrarla: responde 204" 204 "$(borrar $DOC_REAL)"
    igual "n8n quita su vector" 0 "$(espera_vectores $DOC_REAL 0)"
fi

sql "DELETE FROM persona_embedding WHERE metadata->>'numero_documento' LIKE '99999999%'" >/dev/null 2>&1
limpiar_pruebas
terminar "los servicios avisan a n8n como dice el diseño."
