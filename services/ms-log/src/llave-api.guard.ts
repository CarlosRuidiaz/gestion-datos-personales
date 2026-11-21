import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DatosDePeticion } from '@gdp/common';
import { USUARIO_N8N } from './consulta-nl.dto';

/** Cabecera en la que n8n envía la llave (N8N_LOG_API_KEY). */
export const CABECERA_LLAVE = 'x-api-key';

/** Resumen de tamaño fijo: así timingSafeEqual compara llaves de cualquier largo sin revelar cuál es. */
function resumen(texto: string): Buffer {
  return createHash('sha256').update(texto, 'utf8').digest();
}

/**
 * Protege POST /api/log/consulta-nl, que no lleva token de Keycloak sino la llave de API de n8n.
 * La ruta va con @Publico() para que el guard JWT la deje pasar, y este guard decide:
 * - Sin llave o con una llave distinta: 401, que no queda en el log (no hay un usuario identificado).
 * - Con la llave correcta: deja a n8n como usuario de la petición, así un 400 sí queda en el log.
 */
@Injectable()
export class LlaveApiGuard implements CanActivate {
  private readonly logger = new Logger(LlaveApiGuard.name);
  private readonly llave = resumen(process.env.N8N_LOG_API_KEY ?? '');
  private readonly configurada = Boolean(process.env.N8N_LOG_API_KEY);

  constructor() {
    if (!this.configurada) {
      this.logger.error('Falta la variable N8N_LOG_API_KEY: se rechazarán todos los registros de n8n');
    }
  }

  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<DatosDePeticion & { headers: Record<string, unknown> }>();
    const recibida = peticion.headers?.[CABECERA_LLAVE];

    if (!this.configurada || typeof recibida !== 'string' || recibida === '') {
      throw new UnauthorizedException('Falta la llave de API');
    }
    if (!timingSafeEqual(resumen(recibida), this.llave)) {
      throw new UnauthorizedException('La llave de API no es válida');
    }

    peticion.usuario = { nombre: USUARIO_N8N, roles: [], id: USUARIO_N8N };
    return true;
  }
}
