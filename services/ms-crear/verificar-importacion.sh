#!/usr/bin/env bash
# Verifica de extremo a extremo la importación de personas desde un Excel con sus fotos, por el
# gateway y con tokens reales, y los permisos y la confirmación de «Borrar todas».
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   bash services/ms-crear/verificar-importacion.sh
#
# Usa un Excel y un zip ficticios con el formato del profesor (documentos 99999999xx) y limpia lo que crea.
# No ejecuta «Borrar todas» de verdad, porque borraría las personas de tu base: eso se prueba en la pantalla.

source "$(dirname "$0")/../verificar-comun.sh"

URL="$APP/api/crear/personas/importacion"
BORRAR="$APP/api/borrar/personas"

esperar_servicio "$APP/api/crear/docs-json"
cargar_tokens
limpiar_pruebas
crear_carpeta_temporal
node "$(dirname "$0")/archivos-importacion-prueba.mjs" "$DIR_TMP"
ARCHIVOS=(-F "datos=@$DIR_TMP/grupo_prueba.xlsx" -F "fotos=@$DIR_TMP/archivos_jpg.zip")
resumen() { cuerpo "$1" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));const s=r.resumen;console.log([s.listas,s.creadas,s.existentes,s.invalidas,s.conFoto].join(" "))'; }
estados() { cuerpo "$1" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(r.filas.map(f=>f.estado).join(" "))'; }
personas_de_prueba() { sql "SELECT count(*) FROM persona WHERE numero_documento LIKE '99999999%'"; }
logs_de_prueba() { sql "SELECT count(*) FROM log_transaccion WHERE numero_documento LIKE '99999999%'"; }

echo "Permisos"
igual "sin token: 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "${ARCHIVOS[@]}" "$URL/revision")"
igual "consultor: 403" 403 "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_CONSULTOR" "${ARCHIVOS[@]}" "$URL")"
igual "sin archivo de datos: 400" 400 "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" -F "fotos=@$DIR_TMP/archivos_jpg.zip" "$URL/revision")"

echo "Revisión (no guarda nada)"
r=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "${ARCHIVOS[@]}" "$URL/revision")
igual "200" 200 "$(codigo "$r")"
igual "listas, creadas, existentes, inválidas, con foto" "4 0 0 1 3" "$(resumen "$r")"
igual "estado de cada fila" "lista lista lista invalida lista" "$(estados "$r")"
comprobar "explica la fila inválida con el mensaje del formulario" contiene "$(cuerpo "$r")" 'El segundo nombre no puede tener más de 30 caracteres'
comprobar "avisa la foto que no vino" contiene "$(cuerpo "$r")" 'No está entre las fotos subidas'
igual "no creó personas" 0 "$(personas_de_prueba)"
igual "no escribió en el log" 0 "$(logs_de_prueba)"

echo "Importación"
r=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "${ARCHIVOS[@]}" "$URL")
igual "200" 200 "$(codigo "$r")"
igual "listas, creadas, existentes, inválidas, con foto" "0 4 0 1 3" "$(resumen "$r")"
igual "personas creadas" 4 "$(personas_de_prueba)"
igual "con foto JPG" 3 "$(sql "SELECT count(*) FROM persona WHERE numero_documento LIKE '99999999%' AND foto_tipo = 'image/jpeg'")"
igual "fecha dd-mmm-aaaa convertida" 1965-03-16 "$(sql "SELECT fecha_nacimiento FROM persona WHERE numero_documento = '9999999941'")"
igual "segundo nombre vacío queda NULL" t "$(sql "SELECT segundo_nombre IS NULL FROM persona WHERE numero_documento = '9999999943'")"
igual "un CREAR con éxito por persona, a nombre del administrador" 4 \
    "$(sql "SELECT count(*) FROM log_transaccion WHERE tipo = 'CREAR' AND resultado = 'EXITO' AND usuario = 'admin.prueba' AND numero_documento LIKE '99999999%'")"
igual "la fila inválida queda en el log como CREAR con error" "CREAR|ERROR" \
    "$(sql "SELECT tipo || '|' || resultado FROM log_transaccion WHERE numero_documento = '9999999944'")"
comprobar "el error dice el archivo y la línea" contiene \
    "$(sql "SELECT detalle::text FROM log_transaccion WHERE numero_documento = '9999999944'")" 'grupo_prueba.xlsx, línea 5'

echo "Importar el mismo archivo otra vez"
r=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "${ARCHIVOS[@]}" "$URL")
igual "las que ya existen no se duplican" "0 0 4 1 0" "$(resumen "$r")"
igual "siguen siendo 4" 4 "$(personas_de_prueba)"

echo "Borrar todas: permisos y confirmación (sin borrar)"
igual "sin confirmación: 400" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $TOKEN_ADMIN" "$BORRAR")"
igual "confirmación equivocada: 400" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $TOKEN_ADMIN" "$BORRAR?confirmacion=si")"
igual "consultor: 403" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $TOKEN_CONSULTOR" "$BORRAR?confirmacion=BORRAR%20TODAS")"
igual "no se borró nada" 4 "$(personas_de_prueba)"

limpiar_pruebas
terminar "importación desde Excel con fotos y permisos de Borrar todas"
