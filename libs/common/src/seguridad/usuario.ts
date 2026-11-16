import { TipoTransaccion } from '../constantes';

/** Usuario tomado del token de Keycloak. */
export interface UsuarioAutenticado {
  /** Nombre de usuario (preferred_username). Es el que se guarda en el log. */
  nombre: string;
  /** Roles de realm (realm_access.roles). */
  roles: string[];
  /** Identificador interno del usuario en Keycloak (sub). */
  id: string;
}

/** Datos que el guard deja en la petición para el controlador y para el filtro de auditoría. */
export interface DatosDePeticion {
  usuario?: UsuarioAutenticado;
  auditoria?: { tipo: TipoTransaccion };
}
