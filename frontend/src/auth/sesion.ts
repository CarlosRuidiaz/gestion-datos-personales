import Keycloak from 'keycloak-js';
import { configuracion } from '../config';
import { Rol, rolesDeLaAplicacion } from './roles';

/**
 * Sesión con Keycloak: flujo de código de autorización con PKCE (S256), como pide la
 * sección 5.2 del diseño. El token dura 5 minutos y se renueva solo.
 */
export const keycloak = new Keycloak({
  url: configuracion.keycloakUrl,
  realm: configuracion.realm,
  clientId: configuracion.clientId,
});

export interface Usuario {
  nombre: string;
  roles: Rol[];
}

/** Inicia la sesión. Si no hay una abierta, redirige a la página de login de Keycloak (CU-01). */
export async function iniciarSesion(): Promise<void> {
  keycloak.onTokenExpired = () => {
    keycloak.updateToken(30).catch(() => keycloak.login());
  };
  await keycloak.init({
    onLoad: 'login-required',
    pkceMethod: 'S256',
    checkLoginIframe: false,
  });
}

export function usuarioActual(): Usuario {
  const token = keycloak.tokenParsed as
    | { preferred_username?: string; realm_access?: { roles?: string[] } }
    | undefined;
  return {
    nombre: token?.preferred_username ?? '',
    roles: rolesDeLaAplicacion(token?.realm_access?.roles),
  };
}

/** Token vigente para llamar a la API. Lo renueva si le quedan menos de 30 segundos. */
export async function tokenVigente(): Promise<string> {
  try {
    await keycloak.updateToken(30);
  } catch {
    await keycloak.login();
  }
  return keycloak.token ?? '';
}

export function cerrarSesion(): void {
  keycloak.logout({ redirectUri: `${window.location.origin}/` });
}
