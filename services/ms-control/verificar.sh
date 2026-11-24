#!/usr/bin/env bash
# Verifica ms-control de extremo a extremo: permisos, apagar y encender ms-consultar desde la API,
# que el contenedor quede detenido de verdad y que las demás opciones sigan funcionando (CP-07).
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   docker compose --profile consultar up -d --build
#   bash services/ms-control/verificar.sh
#
# Al final deja ms-consultar encendido.

source "$(dirname "$0")/../verificar-comun.sh"

URL="$APP/api/control/consultar"
HEALTH_CONSULTAR="$APP/api/consultar/health"

trap 'docker compose up -d ms-consultar >/dev/null 2>&1' EXIT

esperar_servicio "$APP/api/control/health"
cargar_tokens

# pedir METODO RUTA [TOKEN] → imprime «cuerpo<salto>código»
pedir() { curl -s -w '\n%{http_code}' -X "$1" ${3:+-H "Authorization: Bearer $3"} "$URL$2"; }
codigo() { printf '%s\n' "$1" | tail -n 1; }
cuerpo() { printf '%s\n' "$1" | sed '$d'; }
estado_contenedor() { docker compose ps -a --format '{{.State}}' ms-consultar | head -n 1; }

echo "Permisos"
igual "sin token: 401" 401 "$(codigo "$(pedir GET '')")"
igual "consultor: 403" 403 "$(codigo "$(pedir GET '' "$TOKEN_CONSULTOR")")"
igual "consultor no puede apagar: 403" 403 "$(codigo "$(pedir POST /apagar "$TOKEN_CONSULTOR")")"
igual "health de ms-control sin token: 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/control/health")"

echo "docker-proxy solo deja listar, detener y arrancar"
# desde_control METODO RUTA → código HTTP que docker-proxy le responde a ms-control
desde_control() {
    docker compose exec -T ms-control node -e \
        "fetch('http://docker-proxy:2375$2',{method:'$1'}).then(r=>console.log(r.status)).catch(()=>console.log('error'))"
}
igual "listar contenedores: 200" 200 "$(desde_control GET /containers/json)"
igual "inspeccionar un contenedor (vería sus contraseñas): 403" 403 "$(desde_control GET /containers/postgres/json)"
igual "crear un contenedor: 403" 403 "$(desde_control POST /containers/create)"
igual "exec en un contenedor: 403" 403 "$(desde_control POST /containers/postgres/exec)"
igual "listar imágenes: 403" 403 "$(desde_control GET /images/json)"
igual "borrar un contenedor: 403" 403 "$(desde_control DELETE /containers/postgres)"

echo "Estado inicial"
esperar_servicio "$HEALTH_CONSULTAR"
r=$(pedir GET '' "$TOKEN_ADMIN")
igual "administrador: 200" 200 "$(codigo "$r")"
comprobar "informa encendido" contiene "$(cuerpo "$r")" '"encendido":true'

echo "Apagar"
r=$(pedir POST /apagar "$TOKEN_ADMIN")
igual "apagar: 200" 200 "$(codigo "$r")"
comprobar "responde apagado" contiene "$(cuerpo "$r")" '"encendido":false'
igual "el contenedor quedó detenido en Docker" exited "$(estado_contenedor)"
esperar_servicio "$HEALTH_CONSULTAR" 404
bien "la ruta /api/consultar desapareció del gateway (404)"
igual "apagar otra vez no falla: 200" 200 "$(codigo "$(pedir POST /apagar "$TOKEN_ADMIN")")"

echo "Las demás opciones siguen funcionando (CP-07)"
igual "ms-log responde" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "$APP/api/log")"
igual "ms-modificar responde (404 de persona inexistente)" 404 \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "$APP/api/modificar/personas/9999999949")"
igual "ms-borrar responde (404 de persona inexistente)" 404 \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "$APP/api/borrar/personas/9999999949")"

echo "Encender"
r=$(pedir POST /encender "$TOKEN_ADMIN")
igual "encender: 200" 200 "$(codigo "$r")"
comprobar "responde encendido" contiene "$(cuerpo "$r")" '"encendido":true'
igual "el contenedor está en ejecución" running "$(estado_contenedor)"
esperar_servicio "$HEALTH_CONSULTAR"
bien "Consultar vuelve a responder por el gateway"

terminar
