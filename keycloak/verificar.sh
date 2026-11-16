#!/usr/bin/env bash
# Verifica la configuración de Keycloak: realm, clientes, roles, usuarios de prueba y PKCE.
# Uso, desde la raíz del repositorio y con el contenedor keycloak arriba (en Windows, con Git Bash):
#
#   bash keycloak/verificar.sh
#
# Lee las contraseñas de los usuarios de prueba del archivo .env. No imprime tokens ni contraseñas.

cd "$(dirname "$0")/.." || exit 1
[ -f .env ] || { echo "No existe .env. Copia .env.example como .env y complétalo."; exit 1; }

# Lee una variable de .env sin ejecutar el archivo.
env_var() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | tr -d '\r'; }

KC=$(env_var KEYCLOAK_PUBLIC_URL);  KC=${KC:-http://localhost:8080}
REALM=$(env_var KEYCLOAK_REALM);    REALM=${REALM:-gestion-personas}
CLIENTE=$(env_var KEYCLOAK_CLIENT_ID); CLIENTE=${CLIENTE:-frontend}
CLAVE_ADMIN=$(env_var KEYCLOAK_USUARIO_ADMIN_PASSWORD)
CLAVE_CONSULTOR=$(env_var KEYCLOAK_USUARIO_CONSULTOR_PASSWORD)
BASE="$KC/realms/$REALM"
OIDC="$BASE/protocol/openid-connect"
REDIRECT="http://localhost/"

fallos=0
bien()  { echo "  bien   $1"; }
fallo() { echo "  FALLO  $1"; fallos=$((fallos + 1)); }
# comprobar DESCRIPCION CONDICION...
comprobar() { desc="$1"; shift; if "$@"; then bien "$desc"; else fallo "$desc"; fi; }
contiene()    { case "$1" in *"$2"*) return 0 ;; *) return 1 ;; esac; }
no_contiene() { ! contiene "$1" "$2"; }

# Token con usuario y contraseña, por el cliente de pruebas. Imprime la respuesta JSON.
pedir_token() {
    curl -s -X POST "$OIDC/token" \
        --data-urlencode "grant_type=password" --data-urlencode "client_id=$1" \
        --data-urlencode "username=$2" --data-urlencode "password=$3" --data-urlencode "scope=openid"
}
campo() { printf '%s' "$1" | sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p"; }
# Decodifica el cuerpo (payload) de un JWT.
cuerpo_jwt() {
    p=$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')
    while [ $(( ${#p} % 4 )) -ne 0 ]; do p="$p="; done
    printf '%s' "$p" | base64 -d 2>/dev/null
}
numero() { printf '%s' "$1" | sed -n "s/.*\"$2\":\([0-9]*\).*/\1/p"; }

echo "Realm:"
descubrimiento=$(curl -s "$BASE/.well-known/openid-configuration")
comprobar "el realm $REALM responde"                    contiene "$descubrimiento" '"issuer"'
comprobar "el emisor de los tokens es $BASE"            contiene "$descubrimiento" "\"issuer\":\"$BASE\""
comprobar "publica sus llaves para validar las firmas"  contiene "$(curl -s "$OIDC/certs")" '"kid"'

echo "admin.prueba (cliente pruebas):"
resp=$(pedir_token pruebas admin.prueba "$CLAVE_ADMIN")
token=$(campo "$resp" access_token)
cuerpo=$(cuerpo_jwt "$token")
comprobar "obtiene un token"                            test -n "$token"
comprobar "el token trae el rol administrador"          contiene "$cuerpo" '"administrador"'
comprobar "el token no trae el rol consultor"           no_contiene "$cuerpo" '"consultor"'
comprobar "el token trae el usuario"                    contiene "$cuerpo" '"preferred_username":"admin.prueba"'
comprobar "el emisor del token es el esperado"          contiene "$cuerpo" "\"iss\":\"$BASE\""
duracion=$(( $(numero "$cuerpo" exp) - $(numero "$cuerpo" iat) ))
comprobar "el token dura 5 minutos (dura $duracion s)"  test "$duracion" -eq 300

echo "consultor.prueba (cliente pruebas):"
resp=$(pedir_token pruebas consultor.prueba "$CLAVE_CONSULTOR")
cuerpo=$(cuerpo_jwt "$(campo "$resp" access_token)")
comprobar "el token trae el rol consultor"              contiene "$cuerpo" '"consultor"'
comprobar "el token no trae el rol administrador"       no_contiene "$cuerpo" '"administrador"'

echo "Rechazos:"
resp=$(pedir_token pruebas admin.prueba "clave-equivocada")
comprobar "rechaza una contraseña equivocada"           contiene "$resp" '"error":"invalid_grant"'
resp=$(pedir_token "$CLIENTE" admin.prueba "$CLAVE_ADMIN")
comprobar "el cliente $CLIENTE no acepta usuario y contraseña directos" contiene "$resp" '"error"'
sin_pkce=$(curl -s -o /dev/null -w '%{redirect_url}' -G "$OIDC/auth" \
    --data-urlencode "client_id=$CLIENTE" --data-urlencode "redirect_uri=$REDIRECT" \
    --data-urlencode "response_type=code" --data-urlencode "scope=openid")
comprobar "el cliente $CLIENTE rechaza un login sin PKCE" contiene "$sin_pkce" "error=invalid_request"
otra_uri=$(curl -s -o /dev/null -w '%{http_code}' -G "$OIDC/auth" \
    --data-urlencode "client_id=$CLIENTE" --data-urlencode "redirect_uri=http://sitio-ajeno.example/" \
    --data-urlencode "response_type=code" --data-urlencode "scope=openid" \
    --data-urlencode "code_challenge=abc" --data-urlencode "code_challenge_method=S256")
comprobar "rechaza una dirección de retorno no registrada (HTTP $otra_uri)" test "$otra_uri" = 400

echo "Login del frontend (código de autorización con PKCE):"
tarro=$(mktemp)
verificador=$(openssl rand -hex 32)
reto=$(printf '%s' "$verificador" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=\r\n')
pagina=$(curl -s -c "$tarro" -G "$OIDC/auth" \
    --data-urlencode "client_id=$CLIENTE" --data-urlencode "redirect_uri=$REDIRECT" \
    --data-urlencode "response_type=code" --data-urlencode "scope=openid" \
    --data-urlencode "code_challenge=$reto" --data-urlencode "code_challenge_method=S256")
accion=$(printf '%s' "$pagina" | tr '\n' ' ' | sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' | sed 's/&amp;/\&/g')
comprobar "muestra la página de inicio de sesión"       test -n "$accion"
retorno=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$tarro" -c "$tarro" -X POST "$accion" \
    --data-urlencode "username=admin.prueba" --data-urlencode "password=$CLAVE_ADMIN")
codigo=$(printf '%s' "$retorno" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')
comprobar "tras el login vuelve a la aplicación con un código" test -n "$codigo"
canje() {
    curl -s -X POST "$OIDC/token" \
        --data-urlencode "grant_type=authorization_code" --data-urlencode "client_id=$CLIENTE" \
        --data-urlencode "redirect_uri=$REDIRECT" --data-urlencode "code=$codigo" \
        --data-urlencode "code_verifier=$1"
}
resp=$(canje "$verificador")
cuerpo=$(cuerpo_jwt "$(campo "$resp" access_token)")
comprobar "cambia el código por un token con el rol administrador" contiene "$cuerpo" '"administrador"'
comprobar "entrega un token de renovación"              test -n "$(campo "$resp" refresh_token)"
rm -f "$tarro"

echo
if [ "$fallos" -eq 0 ]; then
    echo "TODO BIEN: Keycloak coincide con el diseño."
else
    echo "HAY $fallos FALLO(S)."
    exit 1
fi
