#!/usr/bin/env node
// Convierte los datos que manda el profesor en el SQL que carga cargar-datos-profesor.sh (tareas T28 y T29).
//
//   node database/datos-profesor.mjs database/datos-profesor > salida.sql
//
// La carpeta tiene los archivos tal como llegan por correo, sin tocarlos:
// - los datos: un Excel (.xlsx) o un CSV, con una fila por persona;
// - las fotos (opcional): un .zip con las imágenes, o las imágenes sueltas (.jpg, .jpeg, .png).
//   La columna «Foto» del Excel dice qué archivo le corresponde a cada persona.
//
// El informe (qué columnas reconoció, qué fotos encontró, qué filas quedan fuera y por qué) sale por
// stderr; el SQL, por stdout. Sin dependencias: solo Node 22 o superior.
//
// Reconoce lo que suele variar entre archivos:
// - CSV con separador coma, punto y coma o tabulador, en UTF-8 (con o sin BOM) o Windows-1252;
// - encabezados con o sin tildes, mayúsculas o espacios, y varios nombres para cada campo
//   («Documento», «No. identificación», «Sexo», «E-mail», «Primer apellido» + «Segundo apellido»...);
// - valores comunes: CC, TI, M, F, fechas dd-mmm-aaaa, dd/mm/aaaa, aaaa-mm-dd o fecha de Excel,
//   documentos con puntos y celulares con espacios o +57.
// Las filas que no cumplen las validaciones (sección 3.3 del diseño) quedan FUERA, con el motivo,
// y las demás se cargan. Son las que el profesor trae inválidas a propósito: se prueban en el formulario.
// Una foto que falta o no es válida (JPG o PNG de hasta 2 MB) no deja fuera a la persona: se carga sin foto.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const TIPOS_DOCUMENTO = ['Tarjeta de identidad', 'Cédula'];
export const GENEROS = ['Masculino', 'Femenino', 'No binario', 'Prefiero no reportar'];
export const FOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Minúsculas, sin tildes y sin nada que no sea letra o número: «No. Identificación» → «noidentificacion». */
export function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Nombres de columna aceptados para cada campo, ya normalizados.
const SINONIMOS = {
  tipoDocumento: ['tipodocumento', 'tipodedocumento', 'tipodoc', 'tipo', 'tipoid', 'tipoidentificacion', 'tipodeidentificacion'],
  numeroDocumento: [
    'numerodocumento', 'numerodedocumento', 'nrodocumento', 'nodocumento', 'numdocumento', 'documento', 'doc', 'nrodoc',
    'identificacion', 'numeroidentificacion', 'numerodeidentificacion', 'noidentificacion', 'nroidentificacion', 'id', 'cedula',
  ],
  primerNombre: ['primernombre', 'nombre1', 'nombre', 'pnombre'],
  segundoNombre: ['segundonombre', 'nombre2', 'snombre', 'otronombre', 'otrosnombres'],
  nombres: ['nombres'],
  apellidos: ['apellidos', 'apellido'],
  primerApellido: ['primerapellido', 'apellido1', 'papellido'],
  segundoApellido: ['segundoapellido', 'apellido2', 'sapellido'],
  fechaNacimiento: ['fechanacimiento', 'fechadenacimiento', 'fechanac', 'fnacimiento', 'nacimiento', 'fecha'],
  genero: ['genero', 'sexo'],
  correo: ['correo', 'correoelectronico', 'email', 'mail', 'emailaddress'],
  celular: ['celular', 'cel', 'telefono', 'telefonocelular', 'numerocelular', 'movil', 'telefonomovil', 'tel'],
  foto: ['foto', 'fotografia', 'imagen', 'archivofoto', 'fotoperfil', 'archivo'],
};

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

// ---------------------------------------------------------------------------------------------------
// Lectura de archivos
// ---------------------------------------------------------------------------------------------------

/** Lee el texto en UTF-8 y, si no es UTF-8 válido, en Windows-1252 (lo que guarda Excel en español). */
export function decodificar(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * Lee un .zip (y por lo tanto un .xlsx, que es un zip) sin dependencias. Devuelve un Map de
 * ruta interna → contenido. Solo admite los métodos de compresión normales (guardado y deflate).
 */
export function leerZip(buffer) {
  let fin = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('no es un archivo zip válido');
  const total = buffer.readUInt16LE(fin + 10);
  let p = buffer.readUInt32LE(fin + 16);
  const archivos = new Map();
  for (let n = 0; n < total; n++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('directorio del zip dañado');
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
    else if (metodo === 8) archivos.set(nombre, inflateRawSync(datos));
    else throw new Error(`el archivo ${nombre} usa una compresión no soportada (${metodo})`);
  }
  return archivos;
}

const entidades = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Texto de un elemento <si> o <is>: une todos sus <t> (el texto con formato viene partido en varios). */
const textoRico = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => entidades(m[1])).join('');

/** «AB» → 27 (índice de columna desde 0). */
const columna = (letras) => [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Número de Excel como texto, sin notación científica ni «.0»: 1147583892 y no 1.147583892E9. */
function numeroComoTexto(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return Number.isInteger(n) ? BigInt(Math.round(n)).toString() : String(n);
}

/** Filas de la primera hoja de un .xlsx, como arreglos de texto. */
export function leerXlsx(buffer) {
  const zip = leerZip(buffer);
  const texto = (ruta) => (zip.has(ruta) ? zip.get(ruta).toString('utf8') : null);
  const compartidos = [...(texto('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoRico(m[1]));

  // Primera hoja según el libro y sus relaciones; si algo falta, sheet1.xml.
  let rutaHoja = 'xl/worksheets/sheet1.xml';
  const libro = texto('xl/workbook.xml');
  const relaciones = texto('xl/_rels/workbook.xml.rels');
  const idHoja = libro && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(libro)?.[1];
  const destino = idHoja && relaciones && new RegExp(`<Relationship\\b[^>]*Id="${idHoja}"[^>]*Target="([^"]+)"`).exec(relaciones)?.[1];
  if (destino) rutaHoja = destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`;
  const hoja = texto(rutaHoja);
  if (!hoja) throw new Error('el Excel no tiene hojas');

  const filas = [];
  for (const [, contenido] of hoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = [];
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
  return filas.filter((f) => f.some((v) => String(v).trim() !== ''));
}

/** Separa un CSV en filas y celdas. Detecta el separador en la primera línea y respeta las comillas. */
export function leerCsv(texto) {
  const primera = texto.split(/\r?\n/, 1)[0];
  const separador = [';', ',', '\t'].reduce((a, b) => (primera.split(b).length > primera.split(a).length ? b : a));
  const filas = [];
  let fila = [];
  let celda = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === separador) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda !== '' || fila.length > 0) { fila.push(celda); filas.push(fila); }
  return { separador, filas: filas.filter((f) => f.some((v) => v.trim() !== '')) };
}

/** Tipo MIME de una imagen por sus primeros bytes (no por la extensión): JPG, PNG o null. */
export function tipoImagen(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

const EXT_IMAGEN = ['.jpg', '.jpeg', '.png'];

/**
 * Lee la carpeta con los archivos del profesor: el archivo de datos (.xlsx o .csv) y las fotos
 * (sueltas o dentro de .zip). Las fotos se buscan por nombre de archivo, sin importar mayúsculas
 * ni la carpeta dentro del zip.
 */
export function leerCarpeta(carpeta) {
  const nombres = readdirSync(carpeta).filter((n) => !n.startsWith('.') && !n.startsWith('~$') && statSync(join(carpeta, n)).isFile());
  const datos = nombres.filter((n) => ['.xlsx', '.csv'].includes(extname(n).toLowerCase()));
  if (datos.length === 0) throw new Error(`No hay un Excel (.xlsx) ni un CSV en ${carpeta}.`);
  if (datos.length > 1) throw new Error(`Hay más de un archivo de datos en ${carpeta} (${datos.join(', ')}). Deja solo uno.`);
  const archivoDatos = datos[0];
  const bytes = readFileSync(join(carpeta, archivoDatos));
  const esXlsx = extname(archivoDatos).toLowerCase() === '.xlsx';
  const csv = esXlsx ? null : leerCsv(decodificar(bytes));

  const fotos = new Map();
  const agregar = (ruta, contenido, origen) => {
    if (!EXT_IMAGEN.includes(extname(ruta).toLowerCase())) return;
    fotos.set(basename(ruta).toLowerCase(), { nombre: basename(ruta), bytes: contenido, origen });
  };
  for (const n of nombres) {
    const ext = extname(n).toLowerCase();
    if (ext === '.zip') for (const [ruta, contenido] of leerZip(readFileSync(join(carpeta, n)))) agregar(ruta, contenido, n);
    else agregar(n, readFileSync(join(carpeta, n)), 'carpeta');
  }
  return {
    archivoDatos,
    filas: esXlsx ? leerXlsx(bytes) : csv.filas,
    separador: csv?.separador ?? null,
    fotos,
  };
}

// ---------------------------------------------------------------------------------------------------
// Columnas y valores
// ---------------------------------------------------------------------------------------------------

/** Asigna cada columna del encabezado a un campo. Devuelve el mapa y las columnas que no reconoció. */
export function mapearColumnas(encabezado) {
  const mapa = {};
  const ignoradas = [];
  encabezado.forEach((nombre, indice) => {
    const clave = normalizar(nombre);
    const campo = Object.keys(SINONIMOS).find((c) => SINONIMOS[c].includes(clave));
    if (campo && mapa[campo] === undefined) mapa[campo] = indice;
    else if (clave) ignoradas.push(String(nombre).trim());
  });
  return { mapa, ignoradas };
}

/** Columnas que faltan para poder armar una persona. */
export function columnasFaltantes(mapa) {
  const faltan = [];
  if (mapa.tipoDocumento === undefined) faltan.push('tipo de documento');
  if (mapa.numeroDocumento === undefined) faltan.push('número de documento');
  if (mapa.primerNombre === undefined && mapa.nombres === undefined) faltan.push('primer nombre (o «Nombres»)');
  if (mapa.apellidos === undefined && mapa.primerApellido === undefined) faltan.push('apellidos');
  if (mapa.fechaNacimiento === undefined) faltan.push('fecha de nacimiento');
  if (mapa.genero === undefined) faltan.push('género');
  if (mapa.correo === undefined) faltan.push('correo');
  if (mapa.celular === undefined) faltan.push('celular');
  return faltan;
}

export function tipoDocumento(valor) {
  const v = normalizar(valor);
  if (['cc', 'cedula', 'cedulaciudadania', 'ceduladeciudadania', 'cedulaciudadana'].includes(v)) return 'Cédula';
  if (['ti', 'tarjeta', 'tarjetaidentidad', 'tarjetadeidentidad'].includes(v)) return 'Tarjeta de identidad';
  return null;
}

export function genero(valor) {
  const v = normalizar(valor);
  if (['m', 'masculino', 'hombre', 'h', 'masc'].includes(v)) return 'Masculino';
  if (['f', 'femenino', 'mujer', 'fem'].includes(v)) return 'Femenino';
  if (['nb', 'nobinario', 'nobinaria', 'nobinarie'].includes(v)) return 'No binario';
  if (['prefieronoreportar', 'prefieronodecir', 'noreporta', 'noreportado', 'nodefinido', 'na'].includes(v)) {
    return 'Prefiero no reportar';
  }
  return null;
}

function fechaValida(anio, mes, dia) {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Devuelve la fecha como aaaa-mm-dd o null. Con barras o guiones y números, se lee día/mes/año (uso en
 * Colombia), salvo que el primer número tenga cuatro cifras. Un número solo es una fecha de Excel.
 */
export function fecha(valor) {
  const v = String(valor).trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, '');
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(v))) return fechaValida(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v))) return fechaValida(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{1,2})[-/. ]([a-záéíóú]{3,})\.?[-/. ](\d{4})$/i.exec(v))) {
    const mes = MESES[normalizar(m[2]).slice(0, 3)];
    return mes ? fechaValida(+m[3], mes, +m[1]) : null;
  }
  if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    const f = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86_400_000);
    return fechaValida(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  return null;
}

/** Quita puntos, comas, espacios y guiones de un documento: «1.043.123.456» → «1043123456». */
export function documento(valor) {
  return String(valor).trim().replace(/[.,\s-]/g, '');
}

/** Quita espacios, guiones, paréntesis y el indicativo de Colombia: «+57 300 123 4567» → «3001234567». */
export function celular(valor) {
  let v = String(valor).trim().replace(/[\s()\-.]/g, '');
  if (/^\+?57\d{10}$/.test(v)) v = v.replace(/^\+?57/, '');
  return v;
}

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Mismas reglas que libs/common y los CHECK de database/init.sql. Devuelve los motivos de rechazo. */
export function validar(p, hoy = new Date().toISOString().slice(0, 10)) {
  const motivos = [];
  const nombre = (v, etiqueta, max, obligatorio) => {
    if (!v) { if (obligatorio) motivos.push(`${etiqueta} está vacío`); return; }
    if (v.length > max) motivos.push(`${etiqueta} tiene más de ${max} caracteres (${v.length})`);
    if (/[0-9]/.test(v)) motivos.push(`${etiqueta} contiene números`);
  };
  if (!p.tipoDocumento) motivos.push(`tipo de documento no reconocido («${p.crudo.tipoDocumento}»)`);
  if (!/^[0-9]{1,10}$/.test(p.numeroDocumento)) motivos.push(`número de documento inválido («${p.crudo.numeroDocumento}»): solo dígitos, máximo 10`);
  nombre(p.primerNombre, 'el primer nombre', 30, true);
  nombre(p.segundoNombre, 'el segundo nombre', 30, false);
  nombre(p.apellidos, 'los apellidos', 60, true);
  if (!p.fechaNacimiento) motivos.push(`fecha de nacimiento no reconocida («${p.crudo.fechaNacimiento}»)`);
  else if (p.fechaNacimiento > hoy) motivos.push('la fecha de nacimiento es futura');
  if (!p.genero) motivos.push(`género no reconocido («${p.crudo.genero}»)`);
  if (!p.correo || p.correo.length > 100 || !CORREO.test(p.correo)) motivos.push(`correo inválido («${p.correo}»)`);
  if (!/^[0-9]{10}$/.test(p.celular)) motivos.push(`celular inválido («${p.crudo.celular}»): deben ser 10 dígitos`);
  return motivos;
}

/** Arma la persona de una fila, con los valores normalizados y los originales (para los mensajes). */
export function persona(fila, mapa) {
  const celda = (campo) => (mapa[campo] === undefined ? '' : String(fila[mapa[campo]] ?? '').trim().replace(/\s+/g, ' '));
  let primerNombre = celda('primerNombre');
  let segundoNombre = celda('segundoNombre');
  if (!primerNombre && mapa.nombres !== undefined) {
    const [primero, ...resto] = celda('nombres').split(' ');
    primerNombre = primero ?? '';
    segundoNombre = segundoNombre || resto.join(' ');
  }
  const apellidos = celda('apellidos') || [celda('primerApellido'), celda('segundoApellido')].filter(Boolean).join(' ');
  const crudo = {
    tipoDocumento: celda('tipoDocumento'),
    numeroDocumento: celda('numeroDocumento'),
    fechaNacimiento: celda('fechaNacimiento'),
    genero: celda('genero'),
    celular: celda('celular'),
  };
  return {
    crudo,
    tipoDocumento: tipoDocumento(crudo.tipoDocumento),
    numeroDocumento: documento(crudo.numeroDocumento),
    primerNombre,
    segundoNombre,
    apellidos,
    fechaNacimiento: fecha(crudo.fechaNacimiento),
    genero: genero(crudo.genero),
    correo: celda('correo').toLowerCase(),
    celular: celular(crudo.celular),
    foto: celda('foto'),
  };
}

/**
 * Separa las personas válidas de las que quedan fuera y les asigna su foto.
 * `fotos` es el Map de leerCarpeta (nombre en minúsculas → { nombre, bytes }).
 */
export function procesar(filas, { hoy, fotos = new Map() } = {}) {
  if (filas.length === 0) return { error: 'El archivo de datos está vacío.' };
  const [encabezado, ...datos] = filas;
  const { mapa, ignoradas } = mapearColumnas(encabezado);
  const faltan = columnasFaltantes(mapa);
  if (faltan.length > 0) {
    return {
      error:
        `No se encontraron las columnas: ${faltan.join(', ')}.\n` +
        `Encabezado leído: ${encabezado.map((c) => `«${String(c).trim()}»`).join(', ')}.\n` +
        'Cambia el nombre de esas columnas en la primera fila (por ejemplo «Documento», «Primer nombre», «Sexo»).',
    };
  }

  // Fotos: se revisa cada archivo una vez (tipo real y tamaño).
  const fotosValidas = new Map();
  const problemasFoto = new Map();
  for (const [clave, f] of fotos) {
    const tipo = tipoImagen(f.bytes);
    if (!tipo) problemasFoto.set(clave, `${f.nombre} no es una imagen JPG o PNG`);
    else if (f.bytes.length > FOTO_MAX_BYTES) problemasFoto.set(clave, `${f.nombre} pesa más de 2 MB (${(f.bytes.length / 1048576).toFixed(2)} MB)`);
    else fotosValidas.set(clave, { ...f, tipo });
  }

  const validas = [];
  const fuera = [];
  const avisosFoto = [];
  const fotosUsadas = new Map();
  const vistos = new Set();
  datos.forEach((fila, i) => {
    const linea = i + 2;
    const p = persona(fila, mapa);
    const motivos = validar(p, hoy);
    if (motivos.length === 0 && vistos.has(p.numeroDocumento)) motivos.push('documento repetido en el archivo');
    if (motivos.length > 0) { fuera.push({ linea, documento: p.crudo.numeroDocumento, motivos }); return; }
    vistos.add(p.numeroDocumento);
    p.fotoClave = null;
    if (p.foto) {
      const clave = basename(p.foto.replace(/\\/g, '/')).toLowerCase();
      if (fotosValidas.has(clave)) {
        p.fotoClave = clave;
        fotosUsadas.set(clave, fotosValidas.get(clave));
      } else {
        avisosFoto.push({ linea, documento: p.numeroDocumento, motivo: problemasFoto.get(clave) ?? `no se encontró la foto «${p.foto}»` });
      }
    }
    validas.push(p);
  });
  return { mapa, encabezado, ignoradas, validas, fuera, avisosFoto, fotosUsadas, fotos };
}

const sql = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

/**
 * SQL con la misma forma que datos-profesor.plantilla.sql: personas, con su foto si tienen, y un
 * CREAR en el log por cada una. Cada foto se envía una sola vez aunque varias personas la compartan.
 */
export function generarSql(personas, fotosUsadas = new Map()) {
  const fotos = [...fotosUsadas]
    .map(([clave, f]) => `    (${sql(clave)}, decode('${f.bytes.toString('base64')}', 'base64'), ${sql(f.tipo)})`)
    .join(',\n');
  const filas = personas
    .map((p) =>
      `    (${[p.numeroDocumento, p.tipoDocumento, p.primerNombre, p.segundoNombre, p.apellidos].map(sql).join(', ')}, ` +
      `DATE ${sql(p.fechaNacimiento)}, ${[p.genero, p.correo, p.celular, p.fotoClave].map(sql).join(', ')})`,
    )
    .join(',\n');
  return `-- Generado por database/datos-profesor.mjs. No editar a mano.
\\encoding UTF8

CREATE TEMP TABLE fotos_profesor (clave text PRIMARY KEY, foto bytea NOT NULL, foto_tipo text NOT NULL) ON COMMIT DROP;
${fotos ? `INSERT INTO fotos_profesor (clave, foto, foto_tipo) VALUES\n${fotos};\n` : ''}
WITH datos (numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
            fecha_nacimiento, genero, correo, celular, foto_clave) AS (
    VALUES
${filas}
),
nuevas AS (
    INSERT INTO persona (numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
                         fecha_nacimiento, genero, correo, celular, foto, foto_tipo)
    SELECT d.numero_documento, d.tipo_documento, d.primer_nombre, d.segundo_nombre, d.apellidos,
           d.fecha_nacimiento, d.genero, d.correo, d.celular, f.foto, f.foto_tipo
    FROM datos d LEFT JOIN fotos_profesor f ON f.clave = d.foto_clave
    ON CONFLICT (numero_documento) DO NOTHING
    RETURNING numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
              fecha_nacimiento, genero, correo, celular, foto IS NOT NULL AS tiene_foto
)
INSERT INTO log_transaccion (tipo, numero_documento, usuario, resultado, detalle)
SELECT 'CREAR', numero_documento, 'datos-profesor', 'EXITO',
       jsonb_build_object('nuevo', jsonb_build_object(
           'numeroDocumento', numero_documento,
           'tipoDocumento',   tipo_documento,
           'primerNombre',    primer_nombre,
           'segundoNombre',   segundo_nombre,
           'apellidos',       apellidos,
           'fechaNacimiento', to_char(fecha_nacimiento, 'YYYY-MM-DD'),
           'genero',          genero,
           'correo',          correo,
           'celular',         celular,
           'tieneFoto',       tiene_foto))
FROM nuevas;
`;
}

// ---------------------------------------------------------------------------------------------------
// Línea de comandos
// ---------------------------------------------------------------------------------------------------

const NOMBRES = {
  tipoDocumento: 'tipo de documento', numeroDocumento: 'número de documento', primerNombre: 'primer nombre',
  segundoNombre: 'segundo nombre', nombres: 'nombres (primero = primer nombre, el resto = segundo)', apellidos: 'apellidos',
  primerApellido: 'primer apellido', segundoApellido: 'segundo apellido', fechaNacimiento: 'fecha de nacimiento',
  genero: 'género', correo: 'correo', celular: 'celular', foto: 'foto (nombre del archivo)',
};

function principal() {
  const carpeta = process.argv[2];
  if (!carpeta) {
    console.error('Uso: node database/datos-profesor.mjs CARPETA > salida.sql');
    process.exit(2);
  }
  const log = (m = '') => console.error(m);
  let leido;
  try {
    leido = leerCarpeta(carpeta);
  } catch (error) {
    log(error.message);
    process.exit(1);
  }
  const r = procesar(leido.filas, { fotos: leido.fotos });
  if (r.error) {
    log(r.error);
    process.exit(1);
  }
  const sep = leido.separador ? ` (separador «${leido.separador === '\t' ? 'tabulador' : leido.separador}»)` : '';
  log(`Datos: ${leido.archivoDatos}${sep}. Columnas reconocidas:`);
  for (const [campo, i] of Object.entries(r.mapa)) log(`  «${String(r.encabezado[i]).trim()}» → ${NOMBRES[campo]}`);
  if (r.ignoradas.length > 0) log(`Columnas que no se usan: ${r.ignoradas.map((c) => `«${c}»`).join(', ')}`);
  log(`Fotos encontradas: ${leido.fotos.size}${leido.fotos.size ? ` (${[...leido.fotos.values()].map((f) => f.nombre).join(', ')})` : ''}`);
  log();
  const conFoto = r.validas.filter((p) => p.fotoClave).length;
  log(`Personas válidas: ${r.validas.length} (${conFoto} con foto)`);
  if (r.avisosFoto.length > 0) {
    log(`Se cargan SIN foto (${r.avisosFoto.length}):`);
    for (const a of r.avisosFoto) log(`  línea ${a.linea}, documento ${a.documento}: ${a.motivo}`);
  }
  if (r.fuera.length > 0) {
    log(`Quedan FUERA (${r.fuera.length}); pruébalas en el formulario si son inválidas a propósito:`);
    for (const f of r.fuera) log(`  línea ${f.linea}, documento «${f.documento}»: ${f.motivos.join('; ')}`);
  }
  if (r.validas.length === 0) {
    log('No hay ninguna persona válida para cargar.');
    process.exit(1);
  }
  process.stdout.write(generarSql(r.validas, r.fotosUsadas));
}

const esPrincipal =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (esPrincipal) principal();
