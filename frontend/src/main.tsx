import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { iniciarSesion, usuarioActual } from './auth/sesion';
import '@fontsource-variable/public-sans/wght.css';
import '@fontsource-variable/public-sans/wght-italic.css';
import './estilos.css';

const raiz = createRoot(document.getElementById('raiz')!);

// La sesión se inicia una sola vez, antes de pintar la aplicación: sin sesión,
// Keycloak redirige a su página de login y la aplicación no llega a mostrarse (CU-01).
iniciarSesion()
  .then(() => {
    raiz.render(
      <StrictMode>
        <App usuario={usuarioActual()} />
      </StrictMode>,
    );
  })
  .catch(() => {
    raiz.render(
      <section className="aviso">
        <h1>No se pudo conectar con el servicio de inicio de sesión</h1>
        <p>Revisa que Keycloak esté arriba (docker compose ps) y vuelve a cargar la página.</p>
      </section>,
    );
  });
