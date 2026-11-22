// Configuración para desarrollo (npm run dev). En el contenedor este archivo se reemplaza al
// arrancar con los valores de .env (ver nginx/40-config-js.sh). No pongas secretos aquí.
window.__CONFIG__ = {
  keycloakUrl: 'http://localhost:8080',
  realm: 'gestion-personas',
  clientId: 'frontend',
  chatUrl: '',
};
