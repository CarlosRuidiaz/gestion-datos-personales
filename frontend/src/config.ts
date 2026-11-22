/** Configuración en tiempo de ejecución, cargada por /config.js antes que la aplicación. */
export interface Configuracion {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  /** URL del chat de n8n (consulta en lenguaje natural). Vacía hasta la tarea T15. */
  chatUrl: string;
}

declare global {
  interface Window {
    __CONFIG__?: Partial<Configuracion>;
  }
}

const recibida = (typeof window !== 'undefined' && window.__CONFIG__) || {};

export const configuracion: Configuracion = {
  keycloakUrl: recibida.keycloakUrl || 'http://localhost:8080',
  realm: recibida.realm || 'gestion-personas',
  clientId: recibida.clientId || 'frontend',
  chatUrl: recibida.chatUrl ?? '',
};
