import { ErrorApi } from '../api/cliente';
import { separarErroresDeApi } from './envio';
import type { ErroresPersona } from './validaciones';

export interface ErroresDeGuardado {
  /** Mensajes junto a cada campo. */
  porCampo: ErroresPersona;
  /** Mensaje general, arriba del formulario. */
  general: string;
}

export const REVISA_LOS_CAMPOS = 'No se guardó. Revisa los campos marcados.';

/**
 * Traduce el error de crear o modificar a mensajes para el formulario:
 * - 400: cada mensaje junto a su campo (CP-03 desde la API).
 * - 409: el documento ya existe (CU-02), junto al número de documento.
 * - 404: la persona ya no existe (alguien la borró mientras se editaba).
 * - Otros (403, 5xx, red): mensaje general.
 */
export function erroresDeGuardado(error: unknown): ErroresDeGuardado {
  if (!(error instanceof ErrorApi)) {
    return { porCampo: {}, general: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.' };
  }
  if (error.estado === 409) {
    return { porCampo: { numeroDocumento: error.message }, general: REVISA_LOS_CAMPOS };
  }
  if (error.estado === 400 && error.errores.length > 0) {
    const { porCampo, otros } = separarErroresDeApi(error.errores);
    return { porCampo, general: otros.length > 0 ? otros.join(' ') : REVISA_LOS_CAMPOS };
  }
  if (error.estado === 404) {
    return { porCampo: {}, general: 'La persona ya no está registrada: es posible que alguien la haya borrado.' };
  }
  return { porCampo: {}, general: error.message };
}
