#!/usr/bin/env bash
# Verifica el frontend de extremo a extremo: Nginx detrás de Traefik, config.js generado
# desde .env, rutas de la aplicación, convivencia con /api y el login con PKCE tal como lo
# hace keycloak-js (retorno a la aplicación, CORS del canje y roles del token).
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   docker compose --profile consultar up -d --build
#   bash frontend/verificar.sh
#
# Apaga ms-consultar un momento para comprobar que su ruta no la atiende el frontend.

source "$(dirname "$0")/../services/verificar-comun.sh"

trap 'docker compose up -d ms-consultar >/dev/null 2>&1' EXIT

OIDC="$KC/realms/$REALM/protocol/openid-connect"
CLIENTE=$(env_var KEYCLOAK_CLIENT_ID); CLIENTE=${CLIENTE:-frontend}
RETORNO="$APP/"

esperar_servicio "$APP/"
cabeceras() { curl -s -D - -o /dev/null "$1" | tr -d '\r'; }
cabecera() { printf '%s' "$1" | grep -i "^$2:" | head -n 1 | cut -d' ' -f2-; }

echo "Aplicación:"
pagina=$(curl -s "$APP/")
comprobar "la raíz sirve la aplicación"                contiene "$pagina" '<div id="raiz">'
comprobar "y carga config.js antes que la aplicación"  contiene "$pagina" '<script src="/config.js">'
igual "index.html no queda en caché" "no-cache" "$(cabecera "$(cabeceras "$APP/")" Cache-Control)"
for ruta in crear modificar consultar borrar log una/ruta/inventada; do
    comprobar "/$ruta también devuelve la aplicación (React decide)" contiene "$(curl -s "$APP/$ruta")" '<div id="raiz">'
done
recurso=$(printf '%s' "$pagina" | sed -n 's/.*src="\(\/assets\/[^"]*\.js\)".*/\1/p' | head -n 1)
c=$(cabeceras "$APP$recurso")
comprobar "el JavaScript compilado responde ($recurso)" contiene "$c" "200 OK"
comprobar "y se guarda en caché un año (lleva hash)" contiene "$(cabecera "$c" Cache-Control)" "immutable"
igual "un recurso que no existe responde 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$APP/assets/no-existe.js")"

echo "config.js (desde .env):"
config=$(curl -s "$APP/config.js")
comprobar "apunta al Keycloak público"   contiene "$config" "\"keycloakUrl\": \"$KC\""
comprobar "con el realm de .env"         contiene "$config" "\"realm\": \"$REALM\""
comprobar "y el cliente público"         contiene "$config" "\"clientId\": \"$CLIENTE\""
comprobar "incluye la URL del chat de n8n (vacía hasta T15)" contiene "$config" "\"chatUrl\": \"$(env_var N8N_CHAT_URL)\""
comprobar "no contiene llaves ni contraseñas" no_contiene "$config" "$(env_var N8N_LOG_API_KEY)"
igual "nunca queda en caché" "no-store" "$(cabecera "$(cabeceras "$APP/config.js")" Cache-Control)"

echo "Convivencia con la API:"
igual "/api/log sigue yendo a ms-log (401 sin token)" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/log")"
comprobar "/api/consultar/health sigue yendo a ms-consultar" contiene "$(curl -s "$APP/api/consultar/health")" '"estado":"disponible"'
docker compose stop ms-consultar >/dev/null 2>&1
esperar_servicio "$APP/api/consultar/health" 404
r=$(curl -s -w '\n%{http_code}' "$APP/api/consultar/health")
igual "con ms-consultar apagado, health responde 404 (no la aplicación)" 404 "$(codigo "$r")"
comprobar "y no devuelve la página de la aplicación" no_contiene "$(cuerpo "$r")" '<div id="raiz">'
docker compose up -d ms-consultar >/dev/null 2>&1
esperar_servicio "$APP/api/consultar/health"
igual "al encenderlo vuelve a responder 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/consultar/health")"

echo "Login como lo hace keycloak-js (PKCE, retorno a $RETORNO):"
# login USUARIO CLAVE → deja en RESP la respuesta del canje del código por el token.
login() {
    local tarro verificador reto pagina accion retorno codigo
    tarro=$(mktemp)
    verificador=$(openssl rand -hex 32)
    reto=$(printf '%s' "$verificador" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=\r\n')
    pagina=$(curl -s -c "$tarro" -G "$OIDC/auth" \
        --data-urlencode "client_id=$CLIENTE" --data-urlencode "redirect_uri=$RETORNO" \
        --data-urlencode "response_type=code" --data-urlencode "response_mode=fragment" \
        --data-urlencode "scope=openid" --data-urlencode "state=prueba" --data-urlencode "nonce=prueba" \
        --data-urlencode "code_challenge=$reto" --data-urlencode "code_challenge_method=S256")
    accion=$(printf '%s' "$pagina" | tr '\n' ' ' | sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' | sed 's/&amp;/\&/g')
    retorno=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$tarro" -c "$tarro" -X POST "$accion" \
        --data-urlencode "username=$1" --data-urlencode "password=$2")
    RETORNO_LOGIN=$retorno
    codigo=$(printf '%s' "$retorno" | sed -n 's/.*[#&]code=\([^&]*\).*/\1/p')
    # El navegador hace el canje desde http://localhost: Keycloak debe permitirlo por CORS.
    RESP=$(curl -s -D - -X POST "$OIDC/token" -H "Origin: $APP" \
        --data-urlencode "grant_type=authorization_code" --data-urlencode "client_id=$CLIENTE" \
        --data-urlencode "redirect_uri=$RETORNO" --data-urlencode "code=$codigo" \
        --data-urlencode "code_verifier=$verificador" | tr -d '\r')
    rm -f "$tarro"
}
cuerpo_jwt() {
    local p; p=$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')
    while [ $(( ${#p} % 4 )) -ne 0 ]; do p="$p="; done
    printf '%s' "$p" | base64 -d 2>/dev/null
}
token_de() { printf '%s' "$1" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'; }

login admin.prueba "$(env_var KEYCLOAK_USUARIO_ADMIN_PASSWORD)"
comprobar "Keycloak vuelve a la aplicación con el código en el fragmento" contiene "$RETORNO_LOGIN" "$RETORNO#"
comprobar "el canje desde el navegador está permitido por CORS" contiene "$(cabecera "$RESP" Access-Control-Allow-Origin)" "$APP"
token=$(token_de "$RESP")
comprobar "el administrador recibe un token con su rol" contiene "$(cuerpo_jwt "$token")" '"administrador"'
comprobar "y una renovación para que la sesión no se corte a los 5 minutos" contiene "$RESP" '"refresh_token"'
igual "ese token sirve en la API por el gateway" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" "$APP/api/log")"

login consultor.prueba "$(env_var KEYCLOAK_USUARIO_CONSULTOR_PASSWORD)"
token=$(token_de "$RESP")
comprobar "el consultor recibe un token con su rol" contiene "$(cuerpo_jwt "$token")" '"consultor"'
comprobar "y sin el de administrador" no_contiene "$(cuerpo_jwt "$token")" '"administrador"'

echo "Cierre de sesión:"
c=$(curl -s -o /dev/null -w '%{http_code}' -G "$OIDC/logout" \
    --data-urlencode "client_id=$CLIENTE" --data-urlencode "post_logout_redirect_uri=$RETORNO")
comprobar "Keycloak acepta volver a la aplicación al cerrar sesión (HTTP $c)" test "$c" = 200 -o "$c" = 302

terminar "el frontend base funciona como dice el diseño."
