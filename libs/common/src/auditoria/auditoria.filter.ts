import { ArgumentsHost, Catch, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ResultadoTransaccion } from '../constantes';
import { DatosDePeticion } from '../seguridad/usuario';
import { AuditoriaService } from './auditoria.service';

const DOCUMENTO_VALIDO = /^[0-9]{1,10}$/;

interface PeticionHttp extends DatosDePeticion {
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

/**
 * Filtro global (lo registra ComunModule). Deja en el log toda petición rechazada
 * de un usuario identificado: validación (400), permisos (403), no encontrado (404),
 * conflicto (409) y fallos inesperados (500). Las de 401 no se registran porque no
 * hay usuario (RNF-02). Después responde como lo haría Nest normalmente.
 */
@Catch()
@Injectable()
export class FiltroAuditoria extends BaseExceptionFilter {
  constructor(private readonly auditoria: AuditoriaService) {
    super();
  }

  async catch(excepcion: unknown, host: ArgumentsHost): Promise<void> {
    if (host.getType() === 'http') {
      await this.registrar(excepcion, host.switchToHttp().getRequest<PeticionHttp>());
    }
    super.catch(excepcion, host);
  }

  private async registrar(excepcion: unknown, peticion: PeticionHttp): Promise<void> {
    const estado = excepcion instanceof HttpException ? excepcion.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (!peticion.usuario || !peticion.auditoria || estado === HttpStatus.UNAUTHORIZED) {
      return;
    }

    const recibido = peticion.params?.documento ?? peticion.body?.numeroDocumento;
    const documento = typeof recibido === 'string' && DOCUMENTO_VALIDO.test(recibido.trim()) ? recibido.trim() : null;

    const detalle: Record<string, unknown> = { estado, motivo: this.motivo(excepcion) };
    if (peticion.auditoria.contexto) detalle.contexto = peticion.auditoria.contexto;
    const errores = this.errores(excepcion);
    if (errores) detalle.errores = errores;
    if (!documento && recibido !== undefined && recibido !== null) {
      // El documento recibido no cabe en la columna o no es válido: se conserva en el detalle.
      detalle.documentoRecibido = String(recibido).slice(0, 50);
    }

    await this.auditoria.registrarAparte({
      tipo: peticion.auditoria.tipo,
      numeroDocumento: documento,
      usuario: peticion.usuario.nombre,
      resultado: ResultadoTransaccion.ERROR,
      detalle,
    });
  }

  private motivo(excepcion: unknown): string {
    if (!(excepcion instanceof HttpException)) {
      return 'Error interno del servicio';
    }
    const respuesta = excepcion.getResponse();
    if (typeof respuesta === 'string') return respuesta;
    const mensaje = (respuesta as { message?: unknown }).message;
    if (Array.isArray(mensaje)) return mensaje.join('; ');
    return typeof mensaje === 'string' ? mensaje : excepcion.message;
  }

  private errores(excepcion: unknown): unknown {
    if (!(excepcion instanceof HttpException)) return undefined;
    const respuesta = excepcion.getResponse();
    return typeof respuesta === 'object' ? (respuesta as { errores?: unknown }).errores : undefined;
  }
}
