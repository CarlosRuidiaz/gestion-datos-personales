#!/bin/sh
# Lo ejecuta la imagen de Nginx al arrancar (carpeta /docker-entrypoint.d/). Escribe config.js
# con las variables de entorno del contenedor, que vienen de .env por docker-compose.yml.
# Así la misma imagen sirve en otro equipo o en Azure sin volver a construirla.
# Solo lleva datos públicos: el cliente "frontend" no tiene secreto.
set -eu

json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

cat > /usr/share/nginx/html/config.js <<EOF
window.__CONFIG__ = {
  "keycloakUrl": "$(json "${KEYCLOAK_PUBLIC_URL:-http://localhost:8080}")",
  "realm": "$(json "${KEYCLOAK_REALM:-gestion-personas}")",
  "clientId": "$(json "${KEYCLOAK_CLIENT_ID:-frontend}")",
  "chatUrl": "$(json "${N8N_CHAT_URL:-}")"
};
EOF
echo "config.js generado para el realm ${KEYCLOAK_REALM:-gestion-personas}"
