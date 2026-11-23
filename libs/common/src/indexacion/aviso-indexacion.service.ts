import { Injectable, Logger } from '@nestjs/common';
import { TipoTransaccion } from '../constantes';
import { configuracionIndexacion } from '../entorno';

/** Operaciones que cambian a una persona y por eso cambian su vector en n8n. */
export type OperacionIndexacion = TipoTransaccion.CREAR | TipoTransaccion.MODIFICAR | TipoTransaccion.BORRAR;

/** Tiempo máximo de espera del aviso. n8n responde 202 en unos 200 ms (n8n/README.md). */
export const ESPERA_MAXIMA_AVISO_MS = 5000;

/**
 * Avisa a n8n que una persona cambió, para que actualice su vector (sección 5.2 del diseño).
 * Contrato del webhook en n8n/README.md: POST { numeroDocumento, operacion } → 202.
 *
 * Se llama DESPUÉS de que la transacción quedó confirmada y SIN esperar la respuesta:
 *
 *   const respuesta = await this.dataSource.transaction(...);   // persona y log guardados
 *   void this.indexacion.avisar(documento, TipoTransaccion.CREAR);
 *   return respuesta;
 *
 * Nunca lanza errores: si n8n está apagado, tarda o responde con error, la operación ya quedó
 * guardada y solo se deja una advertencia en el log del contenedor. El flujo «Reindexar todo»
 * corrige después la diferencia.
 */
@Injectable()
export class AvisoIndexacionService {
  private readonly logger = new Logger('AvisoIndexacion');
  private readonly url = configuracionIndexacion().urlWebhook;

  constructor() {
    if (!this.url) {
      this.logger.warn('N8N_WEBHOOK_INDEXACION_URL está vacía: no se avisará a n8n de los cambios');
    }
  }

  /** Envía el aviso. La promesa siempre se resuelve; los servicios no la esperan. */
  async avisar(numeroDocumento: string, operacion: OperacionIndexacion): Promise<void> {
    if (!this.url) return;
    try {
      const respuesta = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroDocumento, operacion }),
        signal: AbortSignal.timeout(ESPERA_MAXIMA_AVISO_MS),
      });
      if (!respuesta.ok) {
        this.logger.warn(`n8n respondió ${respuesta.status} al aviso ${operacion} de ${numeroDocumento}. ${CORRECCION}`);
      }
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      this.logger.warn(`n8n no recibió el aviso ${operacion} de ${numeroDocumento} (${motivo}). ${CORRECCION}`);
    }
  }
}

const CORRECCION = 'El flujo «Reindexar todo» de n8n corrige el índice.';
