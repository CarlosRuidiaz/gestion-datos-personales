import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Rol, TipoTransaccion } from '../constantes';
import { UsuarioAutenticado } from './usuario';

export const CLAVE_ROLES = 'gdp:roles';
export const CLAVE_PUBLICO = 'gdp:publico';
export const CLAVE_AUDITAR = 'gdp:auditar';

/**
 * Roles que pueden usar la ruta. Sin este decorador, la ruta admite a cualquier
 * usuario autenticado que tenga uno de los dos roles de la aplicación.
 * Ejemplo: @Roles(Rol.ADMINISTRADOR)
 */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

/** Ruta sin token (por ejemplo, GET /api/consultar/health). */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/**
 * Tipo de transacción de la ruta. Es obligatorio en toda ruta protegida: con él,
 * las peticiones rechazadas (400, 403, 404, 409) quedan en el log automáticamente.
 * Ejemplo: @Auditar(TipoTransaccion.CREAR)
 */
export const Auditar = (tipo: TipoTransaccion) => SetMetadata(CLAVE_AUDITAR, tipo);

/** Inyecta el usuario autenticado en un parámetro del controlador. */
export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
  return contexto.switchToHttp().getRequest().usuario;
});
