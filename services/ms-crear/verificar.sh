#!/usr/bin/env bash
# Verifica ms-crear de extremo a extremo: gateway, token, validaciones, foto y log.
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   bash services/ms-crear/verificar.sh
#
# Usa los documentos ficticios 99999999xx y limpia lo que crea.

source "$(dirname "$0")/../verificar-comun.sh"

URL="$APP/api/crear/personas"
DOC=9999999911
DOC_FOTO=9999999912
DOC_JSON=9999999913

esperar_servicio "$APP/api/crear/docs-json"
cargar_tokens
crear_fotos_de_prueba
limpiar_pruebas

# crear TOKEN DOCUMENTO [campo=valor ...] [-- opciones extra de curl]  → imprime «cuerpo<salto>código»
crear() {
    local token="$1" doc="$2"; shift 2
    local campos=()
    while [ $# -gt 0 ] && [ "$1" != "--" ]; do campos+=("$1"); shift; done
    [ "${1:-}" = "--" ] && shift
    formulario_persona "$doc" "${campos[@]}"
    curl -s -w '
%{http_code}' -X POST "$URL" ${token:+-H "Authorization: Bearer $token"} "${FORM[@]}" "$@"
}

echo "Permisos:"
r=$(crear "" $DOC)
igual "sin token responde 401" 401 "$(codigo "$r")"
igual "y no deja nada en el log" 0 "$(cuenta_log $DOC)"
r=$(crear "$TOKEN_CONSULTOR" $DOC)
igual "el consultor recibe 403" 403 "$(codigo "$r")"
# El 403 se decide antes de leer el formulario, así que ese registro queda sin número de documento.
igual "y el intento queda en el log" "CREAR||ERROR|403" "$(ultimo_log_de_usuario consultor.prueba)"

echo "Validaciones:"
r=$(crear "$TOKEN_ADMIN" $DOC "celular=123" "correo=sin-arroba" "primerNombre=Ana3")
igual "datos inválidos: responde 400" 400 "$(codigo "$r")"
comprobar "informa el campo celular"        contiene "$(cuerpo "$r")" '"campo":"celular"'
comprobar "informa el campo correo"         contiene "$(cuerpo "$r")" '"campo":"correo"'
comprobar "informa el campo primerNombre"   contiene "$(cuerpo "$r")" 'El primer nombre no puede contener números'
igual "y el rechazo queda en el log" "CREAR|admin.prueba|ERROR|400" "$(ultimo_log $DOC)"
r=$(crear "$TOKEN_ADMIN" $DOC "fechaNacimiento=01-ene-2999")
comprobar "rechaza una fecha de nacimiento futura" contiene "$(cuerpo "$r")" 'no puede ser futura'
r=$(crear "$TOKEN_ADMIN" "99ABC")
igual "rechaza un documento con letras" 400 "$(codigo "$r")"
r=$(crear "$TOKEN_ADMIN" $DOC "apellidos=__OMITIR__" "genero=Otro")
comprobar "rechaza un campo obligatorio ausente" contiene "$(cuerpo "$r")" 'Los apellidos son obligatorios'
comprobar "rechaza un género fuera de la lista" contiene "$(cuerpo "$r")" '"campo":"genero"'

echo "Crear:"
r=$(crear "$TOKEN_ADMIN" $DOC)
igual "persona válida sin foto: responde 201" 201 "$(codigo "$r")"
comprobar "devuelve la persona, con la fecha como yyyy-mm-dd" contiene "$(cuerpo "$r")" '"fechaNacimiento":"2003-03-05"'
comprobar "el segundo nombre vacío queda en null"           contiene "$(cuerpo "$r")" '"segundoNombre":null'
comprobar "indica que no tiene foto"                        contiene "$(cuerpo "$r")" '"tieneFoto":false'
igual "guarda bien los acentos" "De Verificación|Cédula" "$(sql "SELECT apellidos || '|' || tipo_documento FROM persona WHERE numero_documento = '$DOC'")"
igual "queda guardada en la base de datos" 1 "$(sql "SELECT count(*) FROM persona WHERE numero_documento = '$DOC'")"
igual "y su registro de éxito queda en el log" "CREAR|admin.prueba|EXITO|" "$(ultimo_log $DOC)"
igual "el log guarda los datos nuevos" "Prueba" "$(sql "SELECT detalle -> 'nuevo' ->> 'primerNombre' FROM log_transaccion WHERE numero_documento = '$DOC' AND resultado = 'EXITO'")"

r=$(crear "$TOKEN_ADMIN" $DOC)
igual "documento repetido: responde 409" 409 "$(codigo "$r")"
igual "y el intento queda en el log" "CREAR|admin.prueba|ERROR|409" "$(ultimo_log $DOC)"
igual "sigue habiendo una sola persona" 1 "$(sql "SELECT count(*) FROM persona WHERE numero_documento = '$DOC'")"

echo "Foto:"
r=$(crear "$TOKEN_ADMIN" $DOC_FOTO -- -F "foto=@$DIR_TMP/grande.png;type=image/png")
igual "foto de más de 2 MB: responde 400" 400 "$(codigo "$r")"
comprobar "con el mensaje del campo foto" contiene "$(cuerpo "$r")" 'La foto no puede superar los 2 MB'
r=$(crear "$TOKEN_ADMIN" $DOC_FOTO -- -F "foto=@$DIR_TMP/falsa.png;type=image/png")
igual "archivo que no es imagen aunque diga serlo: responde 400" 400 "$(codigo "$r")"
comprobar "con el mensaje del campo foto" contiene "$(cuerpo "$r")" 'La foto debe ser una imagen JPG o PNG'
igual "ninguno de los dos intentos creó la persona" 0 "$(sql "SELECT count(*) FROM persona WHERE numero_documento = '$DOC_FOTO'")"
r=$(crear "$TOKEN_ADMIN" $DOC_FOTO -- -F "foto=@$DIR_TMP/foto.png;type=application/octet-stream")
igual "foto PNG válida: responde 201" 201 "$(codigo "$r")"
comprobar "indica que tiene foto" contiene "$(cuerpo "$r")" '"tieneFoto":true'
igual "guarda la foto con su tipo real" "image/png|$(wc -c < "$DIR_TMP/foto.png" | tr -d ' ')" "$(sql "SELECT foto_tipo || '|' || octet_length(foto) FROM persona WHERE numero_documento = '$DOC_FOTO'")"
comprobar "el log no guarda la foto" no_contiene "$(sql "SELECT detalle::text FROM log_transaccion WHERE numero_documento = '$DOC_FOTO' AND resultado = 'EXITO'")" '"foto"'

echo "JSON (sin foto):"
r=$(curl -s -w '\n%{http_code}' -X POST "$URL" -H "Authorization: Bearer $TOKEN_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"tipoDocumento\":\"Tarjeta de identidad\",\"numeroDocumento\":\"$DOC_JSON\",\"primerNombre\":\"Otra\",\"apellidos\":\"Prueba\",\"fechaNacimiento\":\"2010-12-31\",\"genero\":\"Femenino\",\"correo\":\"otra@example.com\",\"celular\":\"3000000001\"}")
igual "también acepta JSON: responde 201" 201 "$(codigo "$r")"

echo "Documentación:"
comprobar "publica OpenAPI en /api/crear/docs-json" contiene "$(curl -s "$APP/api/crear/docs-json")" '"/api/crear/personas"'

limpiar_pruebas
terminar "ms-crear funciona como dice el diseño."
