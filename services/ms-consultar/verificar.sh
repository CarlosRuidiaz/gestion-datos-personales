#!/usr/bin/env bash
# Verifica ms-consultar de extremo a extremo: gateway, token, consulta, foto, log,
# health y el encendido, apagado y escalado bajo demanda (DD-04).
# Uso, desde la raíz del repositorio y con todo arriba (en Windows, con Git Bash):
#
#   docker compose --profile consultar up -d --build
#   bash services/ms-consultar/verificar.sh
#
# Apaga y escala ms-consultar durante la prueba, y al final lo deja con una sola réplica encendida.
# Usa los documentos ficticios 99999999xx y limpia lo que crea.

source "$(dirname "$0")/../verificar-comun.sh"

URL="$APP/api/consultar/personas"
HEALTH="$APP/api/consultar/health"
DOC=9999999931
DOC_NO_EXISTE=9999999939

# Pase lo que pase, ms-consultar queda encendido con una réplica.
trap 'docker compose up -d --scale ms-consultar=1 ms-consultar >/dev/null 2>&1' EXIT

esperar_servicio "$HEALTH"
cargar_tokens
limpiar_pruebas
insertar_persona_de_prueba $DOC

# consultar TOKEN DOCUMENTO  → imprime «cuerpo<salto>código»
consultar() { curl -s -w '\n%{http_code}' ${1:+-H "Authorization: Bearer $1"} "$URL/$2"; }
detalle_log() { sql "SELECT coalesce(detalle::text, 'null') FROM log_transaccion WHERE numero_documento = '$1' ORDER BY id DESC LIMIT 1"; }
replicas() { docker compose ps --format '{{.Status}}' ms-consultar | grep -c '(healthy)'; }
# esperar_replicas N: hasta 60 segundos a que haya N réplicas sanas.
esperar_replicas() { for _ in $(seq 1 30); do [ "$(replicas)" = "$1" ] && return 0; sleep 2; done; }

echo "Health:"
r=$(curl -s -w '\n%{http_code}' "$HEALTH")
igual "responde 200 sin token" 200 "$(codigo "$r")"
comprobar "dice que está disponible" contiene "$(cuerpo "$r")" '"estado":"disponible"'

echo "Permisos:"
igual "consultar sin token responde 401" 401 "$(codigo "$(consultar "" $DOC)")"
igual "y no deja nada en el log" 0 "$(cuenta_log $DOC)"
r=$(consultar "$TOKEN_CONSULTOR" $DOC)
igual "el consultor puede consultar: responde 200" 200 "$(codigo "$r")"
igual "y queda en el log a su nombre" "CONSULTAR|consultor.prueba|EXITO|" "$(ultimo_log $DOC)"

echo "Consultar:"
sql "UPDATE persona SET foto = decode('89504e470d0a1a0a', 'hex'), foto_tipo = 'image/png' WHERE numero_documento = '$DOC'" >/dev/null
r=$(consultar "$TOKEN_ADMIN" $DOC)
igual "el administrador consulta: responde 200" 200 "$(codigo "$r")"
comprobar "devuelve todos los datos"            contiene "$(cuerpo "$r")" '"apellidos":"De Verificación"'
comprobar "con la fecha como yyyy-mm-dd"        contiene "$(cuerpo "$r")" '"fechaNacimiento":"2003-03-05"'
comprobar "incluye la foto lista para mostrar"  contiene "$(cuerpo "$r")" '"foto":"data:image/png;base64,iVBORw0KGgo="'
igual "queda en el log como CONSULTAR" "CONSULTAR|admin.prueba|EXITO|" "$(ultimo_log $DOC)"
igual "sin contexto de búsqueda previa ni datos de la persona" null "$(detalle_log $DOC)"
igual "cada consulta deja su registro" 2 "$(sql "SELECT count(*) FROM log_transaccion WHERE numero_documento = '$DOC' AND tipo = 'CONSULTAR' AND resultado = 'EXITO'")"

echo "Rechazos:"
r=$(consultar "$TOKEN_CONSULTOR" $DOC_NO_EXISTE)
igual "documento que no existe: responde 404" 404 "$(codigo "$r")"
comprobar "con un mensaje claro" contiene "$(cuerpo "$r")" 'No hay una persona registrada con ese número de documento'
igual "y queda en el log" "CONSULTAR|consultor.prueba|ERROR|404" "$(ultimo_log $DOC_NO_EXISTE)"
igual "documento con letras: responde 400" 400 "$(codigo "$(consultar "$TOKEN_ADMIN" 99ABC)")"
igual "documento de más de 10 dígitos: responde 400" 400 "$(codigo "$(consultar "$TOKEN_ADMIN" 99999999311)")"

echo "Apagar y encender bajo demanda:"
docker compose stop ms-consultar >/dev/null 2>&1
esperar_servicio "$HEALTH" 404
igual "apagado: la ruta desaparece del gateway (health responde 404)" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH")"
igual "las demás opciones siguen funcionando (búsqueda de ms-modificar)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "$APP/api/modificar/personas/$DOC")"
igual "los otros servicios siguen arriba" 0 "$(docker compose ps --status exited -q postgres keycloak gateway ms-crear ms-modificar | wc -l | tr -d ' ')"
docker compose up -d ms-consultar >/dev/null 2>&1
esperar_servicio "$HEALTH"
igual "encendido de nuevo: health responde 200 sin reiniciar el gateway" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH")"

echo "Escalar:"
docker compose up -d --scale ms-consultar=3 ms-consultar >/dev/null 2>&1
esperar_replicas 3
sleep 2   # Traefik tarda unos instantes en ver como sanas las réplicas nuevas.
igual "corre con tres réplicas sanas" 3 "$(replicas)"
ok=0
for _ in $(seq 1 15); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_ADMIN" "$URL/$DOC")" = 200 ] && ok=$((ok + 1))
    sleep 0.3
done
igual "las 15 consultas por el gateway responden 200" 15 "$ok"
docker compose up -d --scale ms-consultar=1 ms-consultar >/dev/null 2>&1
esperar_replicas 1
igual "vuelve a una réplica" 1 "$(replicas)"

echo "Documentación:"
comprobar "publica OpenAPI en /api/consultar/docs-json" contiene "$(curl -s "$APP/api/consultar/docs-json")" '"/api/consultar/personas/{documento}"'

limpiar_pruebas
terminar "ms-consultar funciona como dice el diseño."
