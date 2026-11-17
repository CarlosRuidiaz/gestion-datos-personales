#!/usr/bin/env bash
# Verifica ms-modificar de extremo a extremo: gateway, token, búsqueda previa, modificación, foto y log.
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   bash services/ms-modificar/verificar.sh
#
# No depende de ms-crear ni de ms-consultar: la persona de prueba se inserta directamente
# en la base de datos. Usa los documentos ficticios 99999999xx y limpia lo que crea.

source "$(dirname "$0")/../verificar-comun.sh"

URL="$APP/api/modificar/personas"
DOC=9999999921
DOC_NO_EXISTE=9999999929

esperar_servicio "$APP/api/modificar/docs-json"
cargar_tokens
crear_fotos_de_prueba
limpiar_pruebas
insertar_persona_de_prueba $DOC

# buscar TOKEN DOCUMENTO  → imprime «cuerpo<salto>código»
buscar() { curl -s -w '\n%{http_code}' ${1:+-H "Authorization: Bearer $1"} "$URL/$2"; }

# modificar TOKEN DOCUMENTO [campo=valor ...] [-- opciones extra de curl]  → imprime «cuerpo<salto>código»
modificar() {
    local token="$1" doc="$2"; shift 2
    local campos=("numeroDocumento=__OMITIR__")
    while [ $# -gt 0 ] && [ "$1" != "--" ]; do campos+=("$1"); shift; done
    [ "${1:-}" = "--" ] && shift
    formulario_persona "$doc" "${campos[@]}"
    curl -s -w '\n%{http_code}' -X PUT "$URL/$doc" ${token:+-H "Authorization: Bearer $token"} "${FORM[@]}" "$@"
}
en_bd() { sql "SELECT $1 FROM persona WHERE numero_documento = '$DOC'"; }
detalle_log() { sql "SELECT detalle::text FROM log_transaccion WHERE numero_documento = '$1' ORDER BY id DESC LIMIT 1"; }

echo "Permisos:"
igual "buscar sin token responde 401" 401 "$(codigo "$(buscar "" $DOC)")"
igual "modificar sin token responde 401" 401 "$(codigo "$(modificar "" $DOC)")"
igual "y nada de eso queda en el log" 0 "$(cuenta_log $DOC)"
igual "el consultor recibe 403 al buscar" 403 "$(codigo "$(buscar "$TOKEN_CONSULTOR" $DOC)")"
igual "y el intento queda en el log como CONSULTAR" "CONSULTAR|consultor.prueba|ERROR|403" "$(ultimo_log $DOC)"
igual "el consultor recibe 403 al modificar" 403 "$(codigo "$(modificar "$TOKEN_CONSULTOR" $DOC "correo=intruso@example.com")")"
igual "y el intento queda en el log como MODIFICAR" "MODIFICAR|consultor.prueba|ERROR|403" "$(ultimo_log $DOC)"
igual "el correo no cambió" "prueba.verificacion@example.com" "$(en_bd correo)"

echo "Búsqueda previa:"
r=$(buscar "$TOKEN_ADMIN" $DOC)
igual "persona existente: responde 200" 200 "$(codigo "$r")"
comprobar "devuelve sus datos"                    contiene "$(cuerpo "$r")" '"apellidos":"De Verificación"'
comprobar "incluye la foto (aquí todavía no tiene)" contiene "$(cuerpo "$r")" '"foto":null'
igual "queda en el log como CONSULTAR" "CONSULTAR|admin.prueba|EXITO|" "$(ultimo_log $DOC)"
comprobar "y el detalle dice que precede a una modificación" contiene "$(detalle_log $DOC)" 'Búsqueda previa a una modificación'
r=$(buscar "$TOKEN_ADMIN" $DOC_NO_EXISTE)
igual "documento que no existe: responde 404" 404 "$(codigo "$r")"
igual "y queda en el log" "CONSULTAR|admin.prueba|ERROR|404" "$(ultimo_log $DOC_NO_EXISTE)"
comprobar "con el mismo contexto en el detalle" contiene "$(detalle_log $DOC_NO_EXISTE)" 'Búsqueda previa a una modificación'
igual "documento con letras: responde 400" 400 "$(codigo "$(buscar "$TOKEN_ADMIN" 99ABC)")"

echo "Modificar:"
r=$(modificar "$TOKEN_ADMIN" $DOC "correo=nuevo.correo@example.com" "segundoNombre=Ñandú")
igual "cambia el correo y el segundo nombre: responde 200" 200 "$(codigo "$r")"
comprobar "devuelve la persona actualizada" contiene "$(cuerpo "$r")" '"correo":"nuevo.correo@example.com"'
igual "el cambio queda en la base de datos" "nuevo.correo@example.com|Ñandú" "$(en_bd "correo || '|' || segundo_nombre")"
igual "queda en el log como MODIFICAR" "MODIFICAR|admin.prueba|EXITO|" "$(ultimo_log $DOC)"
d=$(detalle_log $DOC)
comprobar "el log guarda el valor anterior" contiene "$d" '"anterior": {"correo": "prueba.verificacion@example.com", "segundoNombre": null}'
comprobar "y el valor nuevo"               contiene "$d" '"nuevo": {"correo": "nuevo.correo@example.com", "segundoNombre": "Ñandú"}'
comprobar "solo de los campos que cambiaron" no_contiene "$d" 'apellidos'
igual "actualiza la fecha de actualización" t "$(en_bd "fecha_actualizacion > fecha_creacion")"

r=$(modificar "$TOKEN_ADMIN" $DOC "correo=nuevo.correo@example.com" "segundoNombre=Ñandú" "numeroDocumento=9999999922")
igual "enviar otro número de documento no falla" 200 "$(codigo "$r")"
igual "pero el documento no cambia" "1|0" "$(sql "SELECT (SELECT count(*) FROM persona WHERE numero_documento = '$DOC') || '|' || (SELECT count(*) FROM persona WHERE numero_documento = '9999999922')")"
comprobar "y el log indica que no hubo cambios" contiene "$(detalle_log $DOC)" '"sinCambios": true'

echo "Rechazos:"
r=$(modificar "$TOKEN_ADMIN" $DOC "celular=123" "genero=Otro")
igual "datos inválidos: responde 400" 400 "$(codigo "$r")"
comprobar "informa el campo celular" contiene "$(cuerpo "$r")" '"campo":"celular"'
comprobar "informa el campo genero"  contiene "$(cuerpo "$r")" '"campo":"genero"'
igual "y el rechazo queda en el log" "MODIFICAR|admin.prueba|ERROR|400" "$(ultimo_log $DOC)"
igual "el celular no cambió" "3000000000" "$(en_bd celular)"
r=$(modificar "$TOKEN_ADMIN" $DOC_NO_EXISTE)
igual "documento que no existe: responde 404" 404 "$(codigo "$r")"
igual "y queda en el log" "MODIFICAR|admin.prueba|ERROR|404" "$(ultimo_log $DOC_NO_EXISTE)"

echo "Foto:"
MISMOS=("correo=nuevo.correo@example.com" "segundoNombre=Ñandú")
r=$(modificar "$TOKEN_ADMIN" $DOC "${MISMOS[@]}" -- -F "foto=@$DIR_TMP/grande.png;type=image/png")
igual "foto de más de 2 MB: responde 400" 400 "$(codigo "$r")"
comprobar "con el mensaje del campo foto" contiene "$(cuerpo "$r")" 'La foto no puede superar los 2 MB'
r=$(modificar "$TOKEN_ADMIN" $DOC "${MISMOS[@]}" -- -F "foto=@$DIR_TMP/foto.jpg;type=image/jpeg")
igual "agrega una foto JPG: responde 200" 200 "$(codigo "$r")"
igual "la guarda con su tipo real" "image/jpeg" "$(en_bd foto_tipo)"
comprobar "el log dice que se agregó, sin guardar la imagen" contiene "$(detalle_log $DOC)" '"foto": "agregada"'
comprobar "la búsqueda devuelve la foto lista para mostrar" contiene "$(cuerpo "$(buscar "$TOKEN_ADMIN" $DOC)")" '"foto":"data:image/jpeg;base64,'
r=$(modificar "$TOKEN_ADMIN" $DOC "${MISMOS[@]}" "apellidos=Otros Apellidos")
igual "modificar sin enviar foto conserva la que tenía" "image/jpeg" "$(en_bd foto_tipo)"
r=$(modificar "$TOKEN_ADMIN" $DOC "${MISMOS[@]}" "apellidos=Otros Apellidos" -- -F "foto=@$DIR_TMP/foto.png;type=image/png")
igual "reemplaza la foto por un PNG" "image/png" "$(en_bd foto_tipo)"
comprobar "el log dice que se reemplazó" contiene "$(detalle_log $DOC)" '"foto": "reemplazada"'
r=$(modificar "$TOKEN_ADMIN" $DOC "${MISMOS[@]}" "apellidos=Otros Apellidos" "eliminarFoto=true")
igual "eliminarFoto=true quita la foto" t "$(en_bd "foto IS NULL AND foto_tipo IS NULL")"
comprobar "el log dice que se eliminó" contiene "$(detalle_log $DOC)" '"foto": "eliminada"'

echo "JSON (sin foto):"
r=$(curl -s -w '\n%{http_code}' -X PUT "$URL/$DOC" -H "Authorization: Bearer $TOKEN_ADMIN" -H 'Content-Type: application/json' \
    -d '{"tipoDocumento":"Tarjeta de identidad","primerNombre":"Otra","apellidos":"Prueba","fechaNacimiento":"31-dic-2010","genero":"Femenino","correo":"otra@example.com","celular":"3000000001"}')
igual "también acepta JSON: responde 200" 200 "$(codigo "$r")"
igual "aplica todos los campos" "Tarjeta de identidad|Otra||2010-12-31|3000000001" "$(en_bd "tipo_documento || '|' || primer_nombre || '|' || coalesce(segundo_nombre, '') || '|' || fecha_nacimiento || '|' || celular")"

echo "Documentación:"
# Que la búsqueda previa funcione con ms-consultar apagado lo comprueba services/ms-consultar/verificar.sh.
comprobar "publica OpenAPI en /api/modificar/docs-json" contiene "$(curl -s "$APP/api/modificar/docs-json")" '"/api/modificar/personas/{documento}"'

limpiar_pruebas
terminar "ms-modificar funciona como dice el diseño."
