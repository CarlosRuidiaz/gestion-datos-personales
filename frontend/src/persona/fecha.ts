/**
 * Fecha de nacimiento: se elige en un calendario o se escribe como dd-mmm-yyyy (sección 3.3 del diseño).
 * Misma lógica que `libs/common/src/persona/fecha.ts`, que es la que aplica el servidor.
 */

export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_TEXTO = /^(\d{1,2})-([a-z]{3})-(\d{4})$/i;

function esFechaReal(anio: number, mes: number, dia: number): boolean {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

function aIso(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Convierte dd-mmm-yyyy (05-mar-2001) o yyyy-mm-dd a yyyy-mm-dd. Devuelve null si no es una fecha válida. */
export function parsearFecha(valor: string): string | null {
  const texto = valor.trim();

  const iso = FORMATO_ISO.exec(texto);
  if (iso) {
    const [anio, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return esFechaReal(anio, mes, dia) ? aIso(anio, mes, dia) : null;
  }

  const escrita = FORMATO_TEXTO.exec(texto);
  if (escrita) {
    const mes = MESES.indexOf(escrita[2].toLowerCase() as (typeof MESES)[number]) + 1;
    const [anio, dia] = [Number(escrita[3]), Number(escrita[1])];
    return mes > 0 && esFechaReal(anio, mes, dia) ? aIso(anio, mes, dia) : null;
  }

  return null;
}

/** Fecha de hoy como yyyy-mm-dd, en la hora local del navegador. */
export function hoyIso(ahora: Date = new Date()): string {
  return aIso(ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate());
}

/** Convierte yyyy-mm-dd a dd-mmm-yyyy (2001-03-05 pasa a 05-mar-2001). */
export function formatearFecha(iso: string): string {
  const partes = FORMATO_ISO.exec(iso);
  if (!partes) return iso;
  return `${partes[3]}-${MESES[Number(partes[2]) - 1]}-${partes[1]}`;
}
