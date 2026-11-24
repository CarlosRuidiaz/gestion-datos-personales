import { inflateRawSync } from 'node:zlib';

/**
 * Lectura de los archivos que se importan (T30): el Excel (.xlsx) o CSV con las personas y el .zip
 * con las fotos. Sin dependencias: un .xlsx es un zip con XML adentro.
 */

/** Texto en UTF-8 y, si no es UTF-8 válido, en Windows-1252 (el CSV que guarda Excel en español). */
export function decodificar(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Contenido de un .zip: ruta interna → bytes. Solo los métodos normales (guardado y deflate). */
export function leerZip(buffer: Buffer): Map<string, Buffer> {
  let fin = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('no es un archivo zip válido');
  const total = buffer.readUInt16LE(fin + 10);
  let p = buffer.readUInt32LE(fin + 16);
  const archivos = new Map<string, Buffer>();
  for (let n = 0; n < total; n++) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('el zip está dañado');
    const metodo = buffer.readUInt16LE(p + 10);
    const comprimido = buffer.readUInt32LE(p + 20);
    const largoNombre = buffer.readUInt16LE(p + 28);
    const largoExtra = buffer.readUInt16LE(p + 30);
    const largoComentario = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const nombre = buffer.toString('utf8', p + 46, p + 46 + largoNombre);
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (nombre.endsWith('/')) continue;
    const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const datos = buffer.subarray(inicio, inicio + comprimido);
    if (metodo === 0) archivos.set(nombre, Buffer.from(datos));
    else if (metodo === 8) archivos.set(nombre, inflateRawSync(datos, { maxOutputLength: 50 * 1024 * 1024 }));
    else throw new Error(`el archivo ${nombre} del zip usa una compresión no soportada`);
  }
  return archivos;
}

const entidades = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Texto de un <si> o <is>: une todos sus <t> (el texto con formato viene partido en varios). */
const textoRico = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => entidades(m[1])).join('');

/** «AB» → 27 (índice de columna desde 0). */
const columna = (letras: string) => [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Número de Excel como texto, sin notación científica ni «.0»: 1147583892 y no 1.147583892E9. */
function numeroComoTexto(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return Number.isInteger(n) ? BigInt(Math.round(n)).toString() : String(n);
}

export type Filas = string[][];

/** Filas de la primera hoja de un .xlsx, como texto. */
export function leerXlsx(buffer: Buffer): Filas {
  const zip = leerZip(buffer);
  const texto = (ruta: string) => zip.get(ruta)?.toString('utf8') ?? null;
  const compartidos = [...(texto('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    textoRico(m[1]),
  );

  // Primera hoja según el libro y sus relaciones; si algo falta, sheet1.xml.
  let rutaHoja = 'xl/worksheets/sheet1.xml';
  const libro = texto('xl/workbook.xml');
  const relaciones = texto('xl/_rels/workbook.xml.rels');
  const idHoja = libro ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(libro)?.[1] : undefined;
  const destino =
    idHoja && relaciones
      ? new RegExp(`<Relationship\\b[^>]*Id="${idHoja}"[^>]*Target="([^"]+)"`).exec(relaciones)?.[1]
      : undefined;
  if (destino) rutaHoja = destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`;
  const hoja = texto(rutaHoja);
  if (!hoja) throw new Error('el Excel no tiene hojas');

  const filas: Filas = [];
  for (const [, contenido] of hoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila: string[] = [];
    for (const [, atributos, interior = ''] of contenido.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(atributos)?.[1];
      const tipo = /\bt="([^"]+)"/.exec(atributos)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(interior)?.[1];
      let valor = '';
      if (tipo === 's') valor = compartidos[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = textoRico(interior);
      else if (tipo === 'str' || tipo === 'e') valor = entidades(v ?? '');
      else if (tipo === 'b') valor = v === '1' ? 'VERDADERO' : 'FALSO';
      else if (v !== undefined) valor = numeroComoTexto(v);
      fila[ref ? columna(ref) : fila.length] = valor;
    }
    filas.push(Array.from(fila, (c) => c ?? ''));
  }
  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

/** Filas de un CSV. Detecta el separador (coma, punto y coma o tabulador) y respeta las comillas. */
export function leerCsv(texto: string): Filas {
  const primera = texto.split(/\r?\n/, 1)[0];
  const separador = [';', ',', '\t'].reduce((a, b) => (primera.split(b).length > primera.split(a).length ? b : a));
  const filas: Filas = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === separador) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else celda += c;
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

export interface ArchivoRecibido {
  originalname: string;
  buffer: Buffer;
}

const EXT_IMAGEN = /\.(jpe?g|png)$/i;
const nombreBase = (ruta: string) => ruta.replace(/\\/g, '/').split('/').pop() ?? ruta;

/** Filas del archivo de datos, según su extensión. */
export function leerDatos(archivo: ArchivoRecibido): Filas {
  const nombre = archivo.originalname.toLowerCase();
  if (nombre.endsWith('.xlsx')) return leerXlsx(archivo.buffer);
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) return leerCsv(decodificar(archivo.buffer));
  throw new Error('el archivo de datos debe ser un Excel (.xlsx) o un CSV');
}

export interface FotoRecibida {
  nombre: string;
  bytes: Buffer;
}

/**
 * Fotos recibidas, por nombre de archivo en minúsculas (sin la carpeta). Acepta .zip (se abren) e
 * imágenes sueltas. Los archivos del zip que no son imágenes se ignoran.
 */
export function leerFotos(archivos: ArchivoRecibido[]): Map<string, FotoRecibida> {
  const fotos = new Map<string, FotoRecibida>();
  const agregar = (ruta: string, bytes: Buffer) => {
    if (!EXT_IMAGEN.test(ruta)) return;
    const nombre = nombreBase(ruta);
    fotos.set(nombre.toLowerCase(), { nombre, bytes });
  };
  for (const archivo of archivos) {
    if (archivo.originalname.toLowerCase().endsWith('.zip')) {
      for (const [ruta, bytes] of leerZip(archivo.buffer)) agregar(ruta, bytes);
    } else agregar(archivo.originalname, archivo.buffer);
  }
  return fotos;
}

export { nombreBase };
