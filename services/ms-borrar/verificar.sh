#!/usr/bin/env bash
# Verifica ms-borrar de extremo a extremo: gateway, token, búsqueda previa, borrado y log.
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   bash services/ms-borrar/verificar.sh
#
# No depende de ms-crear ni de ms-consultar: las personas de prueba se insertan directamente
# en la base de datos. Usa los documentos ficticios 99999999xx y limpia lo que crea.

source "$(dirname "$0")/../verificar-comun.sh"

URL="$APP/api/borrar/personas"
DOC=9999999941
DOC_FOTO=9999999942
DOC_NO_EXISTE=9999999949

esperar_servicio "$APP/api/borrar/docs-json"
cargar_tokens
limpiar_pruebas
insertar_persona_de_prueba $DOC
insertar_persona_de_prueba $DOC_FOTO
sql "UPDATE persona SET foto = decode('89504e470d0a1a0a', 'hex'), foto_tipo = 'image/png' WHERE numero_documento = '$DOC_FOTO'" >/dev/null

# buscar / borrar TOKEN DOCUMENTO  → imprimen «cuerpo<salto>código»
buscar() { curl -s -w '\n%{http_code}' ${1:+-H "Authorization: Bearer $1"} "$URL/$2"; }
borrar() { curl -s -w '\n%{http_code}' -X DELETE ${1:+-H "Authorization: Bearer $1"} "$URL/$2"; }
existe() { sql "SELECT count(*) FROM persona WHERE numero_documento = '$1'"; }
detalle_log() { sql "SELECT detalle::text FROM log_transaccion WHERE numero_documento = '$1' ORDER BY id DESC LIMIT 1"; }

echo "Permisos:"
igual "buscar sin token responde 401" 401 "$(codigo "$(buscar "" $DOC)")"
igual "borrar sin token responde 401" 401 "$(codigo "$(borrar "" $DOC)")"
igual "y nada de eso queda en el log" 0 "$(cuenta_log $DOC)"
igual "el consultor recibe 403 al buscar" 403 "$(codigo "$(buscar "$TOKEN_CONSULTOR" $DOC)")"
igual "y el intento queda en el log como CONSULTAR" "CONSULTAR|consultor.prueba|ERROR|403" "$(ultimo_log $DOC)"
igual "el consultor recibe 403 al borrar" 403 "$(codigo "$(borrar "$TOKEN_CONSULTOR" $DOC)")"
igual "y el intento queda en el log como BORRAR" "BORRAR|consultor.prueba|ERROR|403" "$(ultimo_log $DOC)"
igual "la persona sigue ahí" 1 "$(existe $DOC)"

echo "Búsqueda previa:"
r=$(buscar "$TOKEN_ADMIN" $DOC_FOTO)
igual "persona existente: responde 200" 200 "$(codigo "$r")"
comprobar "devuelve sus datos para revisarlos"   contiene "$(cuerpo "$r")" '"apellidos":"De Verificación"'
comprobar "incluye la foto lista para mostrar"   contiene "$(cuerpo "$r")" '"foto":"data:image/png;base64,iVBORw0KGgo="'
igual "queda en el log como CONSULTAR" "CONSULTAR|admin.prueba|EXITO|" "$(ultimo_log $DOC_FOTO)"
comprobar "y el detalle dice que precede a un borrado" contiene "$(detalle_log $DOC_FOTO)" 'Búsqueda previa a un borrado'
igual "buscar no borra nada (si el usuario cancela, no se elimina)" 1 "$(existe $DOC_FOTO)"
r=$(buscar "$TOKEN_ADMIN" $DOC_NO_EXISTE)
igual "documento que no existe: responde 404" 404 "$(codigo "$r")"
igual "y queda en el log" "CONSULTAR|admin.prueba|ERROR|404" "$(ultimo_log $DOC_NO_EXISTE)"
comprobar "con el mismo contexto en el detalle" contiene "$(detalle_log $DOC_NO_EXISTE)" 'Búsqueda previa a un borrado'
igual "documento con letras: responde 400" 400 "$(codigo "$(buscar "$TOKEN_ADMIN" 99ABC)")"

echo "Borrar:"
r=$(borrar "$TOKEN_ADMIN" $DOC_FOTO)
igual "borrar una persona: responde 204" 204 "$(codigo "$r")"
igual "sin cuerpo" "" "$(cuerpo "$r")"
igual "ya no está en la base de datos" 0 "$(existe $DOC_FOTO)"
igual "queda en el log como BORRAR" "BORRAR|admin.prueba|EXITO|" "$(ultimo_log $DOC_FOTO)"
d=$(detalle_log $DOC_FOTO)
comprobar "el log guarda los datos que tenía"      contiene "$d" '"correo": "prueba.verificacion@example.com"'
comprobar "indica que tenía foto"                  contiene "$d" '"teniaFoto": true'
comprobar "sin guardar la imagen"                  no_contiene "$d" 'base64'
igual "su historial se conserva completo (CP-05)" "CONSULTAR,BORRAR" "$(sql "SELECT string_agg(tipo, ',' ORDER BY id) FROM log_transaccion WHERE numero_documento = '$DOC_FOTO'")"
r=$(borrar "$TOKEN_ADMIN" $DOC_FOTO)
igual "borrarla otra vez: responde 404" 404 "$(codigo "$r")"
igual "y el intento queda en el log" "BORRAR|admin.prueba|ERROR|404" "$(ultimo_log $DOC_FOTO)"
igual "documento con letras al borrar: responde 400" 400 "$(codigo "$(borrar "$TOKEN_ADMIN" 99ABC)")"
r=$(borrar "$TOKEN_ADMIN" $DOC)
igual "persona sin foto: responde 204" 204 "$(codigo "$r")"
comprobar "y el log indica que no tenía foto" contiene "$(detalle_log $DOC)" '"teniaFoto": false'

echo "Independencia y documentación:"
if [ -n "$(docker compose ps -q --status running ms-consultar)" ]; then
    docker compose stop ms-consultar >/dev/null 2>&1
    insertar_persona_de_prueba $DOC
    igual "funciona con ms-consultar apagado" 204 "$(codigo "$(borrar "$TOKEN_ADMIN" $DOC)")"
    docker compose up -d ms-consultar >/dev/null 2>&1
else
    insertar_persona_de_prueba $DOC
    igual "funciona sin ms-consultar" 204 "$(codigo "$(borrar "$TOKEN_ADMIN" $DOC)")"
fi
comprobar "publica OpenAPI en /api/borrar/docs-json" contiene "$(curl -s "$APP/api/borrar/docs-json")" '"/api/borrar/personas/{documento}"'

limpiar_pruebas
terminar "ms-borrar funciona como dice el diseño."
