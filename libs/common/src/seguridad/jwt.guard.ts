import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol, TipoTransaccion } from '../constantes';
import { CLAVE_AUDITAR, CLAVE_PUBLICO, CLAVE_ROLES } from './decoradores';
import { DatosDePeticion } from './usuario';
import { VerificadorToken } from './verificador-token.service';

const ROLES_DE_LA_APLICACION: Rol[] = [Rol.ADMINISTRADOR, Rol.CONSULTOR];

/**
 * Guard global de todos los microservicios (lo registra ComunModule).
 * - Sin token, o con un token inválido o vencido: 401.
 * - Con token pero sin el rol que pide la ruta: 403.
 * Deja en la petición el usuario y el tipo de transacción, que usan el controlador
 * (@UsuarioActual) y el filtro de auditoría.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verificador: VerificadorToken,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const destinos = [contexto.getHandler(), contexto.getClass()];
    const peticion = contexto.switchToHttp().getRequest<DatosDePeticion & { headers: Record<string, string> }>();

    const tipo = this.reflector.getAllAndOverride<TipoTransaccion | undefined>(CLAVE_AUDITAR, destinos);
    if (tipo) {
      peticion.auditoria = { tipo };
    }

    if (this.reflector.getAllAndOverride<boolean | undefined>(CLAVE_PUBLICO, destinos)) {
      return true;
    }

    const token = this.extraerToken(peticion.headers?.authorization);
    if (!token) {
      throw new UnauthorizedException('Falta el token de acceso');
    }
    try {
      peticion.usuario = await this.verificador.verificar(token);
    } catch {
      throw new UnauthorizedException('El token de acceso no es válido o ya venció');
    }

    const declarados = this.reflector.getAllAndOverride<Rol[] | undefined>(CLAVE_ROLES, destinos);
    const permitidos = declarados && declarados.length > 0 ? declarados : ROLES_DE_LA_APLICACION;
    const roles = peticion.usuario.roles;
    if (!permitidos.some((rol) => roles.includes(rol))) {
      throw new ForbiddenException('Tu rol no tiene permiso para esta operación');
    }
    return true;
  }

  private extraerToken(cabecera?: string): string | null {
    if (!cabecera) return null;
    const [esquema, token] = cabecera.split(' ');
    return esquema?.toLowerCase() === 'bearer' && token ? token : null;
  }
}
