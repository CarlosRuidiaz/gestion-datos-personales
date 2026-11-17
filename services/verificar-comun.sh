#!/usr/bin/env bash
# Funciones compartidas por los scripts verificar.sh de los microservicios.
# No se ejecuta sola: cada services/ms-*/verificar.sh la carga con «source».
#
# Las verificaciones llaman a la API por el gateway (http://localhost), con tokens reales
# de los usuarios de prueba, y miran el log directamente en PostgreSQL.

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
[ -f .env ] || { echo "No existe .env. Copia .env.example como .env y complétalo."; exit 1; }

# Lee una variable de .env sin ejecutar el archivo.
env_var() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | tr -d '\r'; }

APP=$(env_var APP_PUBLIC_URL);      APP=${APP:-http://localhost}
KC=$(env_var KEYCLOAK_PUBLIC_URL);  KC=${KC:-http://localhost:8080}
REALM=$(env_var KEYCLOAK_REALM);    REALM=${REALM:-gestion-personas}

fallos=0
bien()  { echo "  bien   $1"; }
fallo() { echo "  FALLO  $1"; fallos=$((fallos + 1)); }
# comprobar DESCRIPCION CONDICION...
comprobar() { desc="$1"; shift; if "$@"; then bien "$desc"; else fallo "$desc"; fi; }
contiene()    { case "$1" in *"$2"*) return 0 ;; *) return 1 ;; esac; }
no_contiene() { ! contiene "$1" "$2"; }
# igual DESCRIPCION ESPERADO REAL
igual() { if [ "$2" = "$3" ]; then bien "$1"; else fallo "$1 (se esperaba «$2», resultó «$3»)"; fi; }

# Token de un usuario de prueba, por el cliente «pruebas» de Keycloak.
pedir_token() {
    curl -s -X POST "$KC/realms/$REALM/protocol/openid-connect/token" \
        --data-urlencode "grant_type=password" --data-urlencode "client_id=pruebas" \
        --data-urlencode "username=$1" --data-urlencode "password=$2" |
        sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}
cargar_tokens() {
    TOKEN_ADMIN=$(pedir_token admin.prueba "$(env_var KEYCLOAK_USUARIO_ADMIN_PASSWORD)")
    TOKEN_CONSULTOR=$(pedir_token consultor.prueba "$(env_var KEYCLOAK_USUARIO_CONSULTOR_PASSWORD)")
    if [ -z "$TOKEN_ADMIN" ] || [ -z "$TOKEN_CONSULTOR" ]; then
        echo "Keycloak no entregó los tokens de prueba. ¿Está arriba? Revisa con: bash keycloak/verificar.sh"
        exit 1
    fi
}

# Consulta SQL como superusuario dentro del contenedor postgres. Imprime el resultado sin adornos.
sql() { printf '%s\n' "$1" | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -v ON_ERROR_STOP=1'; }

# Último registro del log de un documento: tipo|usuario|resultado|estado
ultimo_log() {
    sql "SELECT tipo || '|' || usuario || '|' || resultado || '|' || coalesce(detalle ->> 'estado', '') FROM log_transaccion WHERE numero_documento = '$1' ORDER BY id DESC LIMIT 1"
}
cuenta_log() { sql "SELECT count(*) FROM log_transaccion WHERE numero_documento = '$1'"; }
# Último registro del log de un usuario, tenga o no documento: tipo|documento|resultado|estado
ultimo_log_de_usuario() {
    sql "SELECT tipo || '|' || coalesce(numero_documento, '') || '|' || resultado || '|' || coalesce(detalle ->> 'estado', '') FROM log_transaccion WHERE usuario = '$1' ORDER BY id DESC LIMIT 1"
}
# Momento en que empezó la verificación, para limpiar solo lo que ella crea.
INICIO=$(sql "SELECT now()")

# Borra las personas y los registros de log de los documentos de prueba (99999999xx).
# La aplicación no puede borrar el log; el superusuario solo se usa aquí para dejar la base como estaba.
limpiar_pruebas() {
    sql "DELETE FROM persona WHERE numero_documento LIKE '99999999%';
         DELETE FROM log_transaccion WHERE numero_documento LIKE '99999999%' OR detalle ->> 'documentoRecibido' LIKE '99999999%'
            OR (usuario IN ('admin.prueba', 'consultor.prueba') AND numero_documento IS NULL AND fecha_hora >= '$INICIO');" >/dev/null
}

# Espera a que una URL responda con el código indicado (por defecto 200), hasta 60 segundos.
esperar_servicio() {
    for _ in $(seq 1 30); do
        [ "$(curl -s -o /dev/null -w '%{http_code}' "$1")" = "${2:-200}" ] && return 0
        sleep 2
    done
    echo "El servicio no respondió en $1. ¿Está arriba? Revisa con: docker compose ps"
    exit 1
}

# Carpeta temporal. En Git Bash se convierte a ruta de Windows, que es la que entiende curl.
crear_carpeta_temporal() {
    [ -n "${DIR_TMP:-}" ] && return 0
    DIR_TMP=$(mktemp -d)
    command -v cygpath >/dev/null 2>&1 && DIR_TMP=$(cygpath -m "$DIR_TMP")
    return 0
}

# Arma en el arreglo FORM los campos (-F) de una persona de prueba válida para curl.
# Uso: formulario_persona DOCUMENTO [campo=valor ...]   (campo=__OMITIR__ no envía ese campo)
# Cada valor se escribe en un archivo UTF-8 y curl lo lee de ahí: en Windows, los acentos
# pasados como argumento llegan dañados.
formulario_persona() {
    crear_carpeta_temporal
    local -A campos=(
        [tipoDocumento]="Cédula" [numeroDocumento]="$1" [primerNombre]="Prueba" [segundoNombre]=""
        [apellidos]="De Verificación" [fechaNacimiento]="05-mar-2003" [genero]="No binario"
        [correo]="prueba.verificacion@example.com" [celular]="3000000000"
    )
    shift
    local par campo
    for par in "$@"; do campos["${par%%=*}"]="${par#*=}"; done
    FORM=()
    for campo in "${!campos[@]}"; do
        [ "${campos[$campo]}" = "__OMITIR__" ] && continue
        printf '%s' "${campos[$campo]}" > "$DIR_TMP/campo_$campo.txt"
        FORM+=(-F "$campo=<$DIR_TMP/campo_$campo.txt")
    done
}

# Imagen PNG mínima válida (1x1) y archivos de prueba para la foto.
crear_fotos_de_prueba() {
    crear_carpeta_temporal
    printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82' > "$DIR_TMP/foto.png"
    printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > "$DIR_TMP/foto.jpg"
    # Más de 2 MB con cabecera de PNG, y un archivo que no es una imagen.
    { head -c 8 "$DIR_TMP/foto.png"; head -c 2200000 /dev/zero; } > "$DIR_TMP/grande.png"
    printf '%%PDF-1.7 esto no es una imagen' > "$DIR_TMP/falsa.png"
}

terminar() {
    [ -n "${DIR_TMP:-}" ] && rm -rf "$DIR_TMP"
    echo
    if [ "$fallos" -eq 0 ]; then
        echo "TODO BIEN: $1"
    else
        echo "HAY $fallos FALLO(S)."
        exit 1
    fi
}
