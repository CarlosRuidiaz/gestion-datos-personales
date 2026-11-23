import { formatearFecha, MESES } from '../persona/fecha';
import type { RegistroLog } from './consulta';

/**
 * Zona horaria en que se muestran las transacciones. Es la misma en que ms-log interpreta los filtros
 * de fecha (TZ del servicio), así lo que se ve en la tabla coincide con lo que se filtra.
 */
export const ZONA_HORARIA = 'America/Bogota';

const PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** 2026-11-22T20:42:10Z pasa a «22-nov-2026 15:42:10» (hora de Bogotá). */
export function fechaHoraLocal(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  const p = Object.fromEntries(PARTES.formatToParts(fecha).map((parte) => [parte.type, parte.value]));
  return `${p.day}-${MESES[Number(p.month) - 1]}-${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

const ETIQUETAS: Record<string, string> = {
  tipoDocumento: 'Tipo de documento',
  numeroDocumento: 'Documento',
  primerNombre: 'Primer nombre',
  segundoNombre: 'Segundo nombre',
  apellidos: 'Apellidos',
  fechaNacimiento: 'Fecha de nacimiento',
  genero: 'Género',
  correo: 'Correo',
  celular: 'Celular',
  tieneFoto: 'Foto',
};

const FOTO: Record<string, string> = {
  agregada: 'Foto agregada',
  reemplazada: 'Foto reemplazada',
  eliminada: 'Foto eliminada',
};

function valor(campo: string, dato: unknown): string {
  if (dato === null || dato === undefined || dato === '') return '(vacío)';
  if (typeof dato === 'boolean') return dato ? 'sí' : 'no';
  if (campo === 'fechaNacimiento' && typeof dato === 'string') return formatearFecha(dato);
  return typeof dato === 'string' ? dato : JSON.stringify(dato);
}

const esObjeto = (dato: unknown): dato is Record<string, unknown> =>
  typeof dato === 'object' && dato !== null && !Array.isArray(dato);

const ORDEN = Object.keys(ETIQUETAS);
const posicion = (campo: string) => (ORDEN.includes(campo) ? ORDEN.indexOf(campo) : ORDEN.length);

/**
 * Datos de una persona en una línea, en el orden del formulario. El documento ya está en su columna
 * y la foto tiene su propia línea, así que no se repiten.
 */
function lista(datos: Record<string, unknown>): string {
  return Object.entries(datos)
    .filter(([campo]) => campo !== 'numeroDocumento' && campo !== 'tieneFoto')
    .sort(([a], [b]) => posicion(a) - posicion(b))
    .map(([campo, dato]) => `${ETIQUETAS[campo] ?? campo}: ${valor(campo, dato)}`)
    .join(' · ');
}

/**
 * Resumen legible del detalle de un registro, en líneas cortas. El detalle completo se puede ver
 * aparte. Cubre lo que escriben los servicios: datos nuevos (CREAR), anterior y nuevo de los campos
 * que cambiaron (MODIFICAR), datos que tenía la persona (BORRAR), contexto de las búsquedas previas,
 * motivo y errores de los rechazos, y pregunta y respuesta de las consultas en lenguaje natural.
 */
export function resumenDetalle(registro: RegistroLog): string[] {
  const lineas: string[] = [];
  const d = registro.detalle ?? {};

  if (registro.pregunta) lineas.push(`Pregunta: ${registro.pregunta}`);
  if (registro.respuesta) lineas.push(`Respuesta: ${registro.respuesta}`);

  if (typeof d.estado === 'number' || typeof d.motivo === 'string') {
    lineas.push([d.estado ? `Error ${String(d.estado)}` : 'Error', d.motivo].filter(Boolean).join(': '));
  }
  if (Array.isArray(d.errores)) {
    for (const e of d.errores) {
      if (esObjeto(e) && typeof e.mensaje === 'string') lineas.push(e.mensaje);
    }
  }
  if (typeof d.contexto === 'string') lineas.push(d.contexto);

  const anterior = esObjeto(d.anterior) ? d.anterior : null;
  const nuevo = esObjeto(d.nuevo) ? d.nuevo : null;
  if (anterior && nuevo) {
    for (const campo of Object.keys(nuevo)) {
      lineas.push(`${ETIQUETAS[campo] ?? campo}: ${valor(campo, anterior[campo])} → ${valor(campo, nuevo[campo])}`);
    }
  } else if (nuevo) {
    lineas.push(`Datos registrados: ${lista(nuevo)}`);
    if (typeof nuevo.tieneFoto === 'boolean') lineas.push(nuevo.tieneFoto ? 'Con foto' : 'Sin foto');
  } else if (anterior) {
    lineas.push(`Datos que tenía: ${lista(anterior)}`);
  }
  if (typeof d.foto === 'string') lineas.push(FOTO[d.foto] ?? `Foto: ${d.foto}`);
  if (typeof d.teniaFoto === 'boolean') lineas.push(d.teniaFoto ? 'Tenía foto' : 'No tenía foto');
  if (d.sinCambios === true) lineas.push('Se guardó sin cambios');

  return lineas;
}

/** true si el detalle tiene algo que mostrar en «Ver detalle completo». */
export function tieneDetalle(registro: RegistroLog): boolean {
  return registro.detalle !== null && Object.keys(registro.detalle).length > 0;
}
