import { FOTO_MAX_BYTES, FotoTipo } from '../constantes';
import { errorDeCampos } from '../validacion/validacion';

/** Lo mínimo que se necesita de un archivo subido (compatible con Express.Multer.File). */
export interface ArchivoSubido {
  buffer: Buffer;
}

export interface FotoValidada {
  foto: Buffer;
  fotoTipo: FotoTipo;
}

const FIRMA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Detecta el tipo real de la imagen por sus primeros bytes, sin fiarse del nombre ni del tipo declarado. */
export function detectarTipoFoto(contenido: Buffer): FotoTipo | null {
  if (contenido.subarray(0, FIRMA_JPEG.length).equals(FIRMA_JPEG)) return 'image/jpeg';
  if (contenido.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG)) return 'image/png';
  return null;
}

/**
 * Valida la foto subida: JPG o PNG reales, de máximo 2 MB.
 * Devuelve null si no se subió foto (es opcional) y lanza un error 400 del campo «foto» si no es válida.
 */
export function validarFoto(archivo?: ArchivoSubido | null): FotoValidada | null {
  if (!archivo || !archivo.buffer || archivo.buffer.length === 0) return null;

  if (archivo.buffer.length > FOTO_MAX_BYTES) {
    throw errorDeCampos([{ campo: 'foto', mensaje: 'La foto no puede superar los 2 MB' }]);
  }
  const fotoTipo = detectarTipoFoto(archivo.buffer);
  if (!fotoTipo) {
    throw errorDeCampos([{ campo: 'foto', mensaje: 'La foto debe ser una imagen JPG o PNG' }]);
  }
  return { foto: archivo.buffer, fotoTipo };
}
