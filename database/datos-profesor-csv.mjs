#!/usr/bin/env node
// Convierte el CSV con los datos del profesor en el SQL que carga cargar-datos-profesor.sh (tarea T28).
//
//   node database/datos-profesor-csv.mjs database/datos-profesor.csv > salida.sql
//
// El informe (qué columnas reconoció, qué filas quedan fuera y por qué) sale por stderr; el SQL, por stdout.
// Sin dependencias: solo Node 22 o superior.
//
// Acepta lo que suele salir de Excel o de una hoja de cálculo:
// - separador coma, punto y coma o tabulador; comillas; UTF-8 (con o sin BOM) o Windows-1252;
// - encabezados con o sin tildes, mayúsculas o espacios, y varios nombres para cada campo
//   («Documento», «No. identificación», «Sexo», «E-mail», «Primer apellido» + «Segundo apellido»...);
// - valores comunes: CC, TI, M, F, fechas dd/mm/aaaa, aaaa-mm-dd, dd-mmm-aaaa o número de serie de Excel,
//   documentos con puntos y celulares con espacios o +57.
// Las filas que no cumplen las validaciones (sección 3.3 del diseño) quedan FUERA, con el motivo,
// y las demás se cargan. Son las que el profesor trae inválidas a propósito: se prueban en el formulario.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TIPOS_DOCUMENTO = ['Tarjeta de identidad', 'Cédula'];
export const GENEROS = ['Masculino', 'Femenino', 'No binario', 'Prefiero no reportar'];

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
};

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

/** Lee el archivo en UTF-8 y, si no es UTF-8 válido, en Windows-1252 (lo que guarda Excel en español). */
export function decodificar(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Separa el CSV en filas y celdas. Detecta el separador en la primera línea y respeta las comillas. */
export function leerCsv(texto) {
  const primera = texto.split(/\r?\n/, 1)[0];
  const candidatos = [';', ',', '\t'];
  const separador = candidatos.reduce((a, b) => (primera.split(b).length > primera.split(a).length ? b : a));

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

/** Asigna cada columna del encabezado a un campo. Devuelve el mapa y las columnas que no reconoció. */
export function mapearColumnas(encabezado) {
  const mapa = {};
  const ignoradas = [];
  encabezado.forEach((nombre, indice) => {
    const clave = normalizar(nombre);
    const campo = Object.keys(SINONIMOS).find((c) => SINONIMOS[c].includes(clave));
    if (campo && mapa[campo] === undefined) mapa[campo] = indice;
    else if (clave) ignoradas.push(nombre.trim());
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
 * Colombia), salvo que el primer número tenga cuatro cifras. Un número solo es el número de serie de Excel.
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
  if (/^\d{4,5}$/.test(v)) {
    const f = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000);
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
  };
}

/** Lee el CSV y separa las personas válidas de las que quedan fuera. */
export function procesar(texto, hoy) {
  const { separador, filas } = leerCsv(texto);
  if (filas.length === 0) return { error: 'El archivo está vacío.' };
  const [encabezado, ...datos] = filas;
  const { mapa, ignoradas } = mapearColumnas(encabezado);
  const faltan = columnasFaltantes(mapa);
  if (faltan.length > 0) {
    return {
      error:
        `No se encontraron las columnas: ${faltan.join(', ')}.\n` +
        `Encabezado leído: ${encabezado.map((c) => `«${c.trim()}»`).join(', ')}.\n` +
        'Cambia el nombre de esas columnas en la primera fila (por ejemplo «Documento», «Primer nombre», «Sexo»).',
    };
  }
  const validas = [];
  const fuera = [];
  const vistos = new Set();
  datos.forEach((fila, i) => {
    const p = persona(fila, mapa);
    const motivos = validar(p, hoy);
    if (motivos.length === 0 && vistos.has(p.numeroDocumento)) motivos.push('documento repetido en el archivo');
    if (motivos.length > 0) fuera.push({ linea: i + 2, documento: p.crudo.numeroDocumento, motivos });
    else { vistos.add(p.numeroDocumento); validas.push(p); }
  });
  return { separador, mapa, encabezado, ignoradas, validas, fuera };
}

const sql = (v) => (v === null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

/** SQL con la misma forma que datos-profesor.plantilla.sql: personas y un CREAR por cada una. */
export function generarSql(personas) {
  const filas = personas
    .map((p) =>
      `    (${[p.numeroDocumento, p.tipoDocumento, p.primerNombre, p.segundoNombre, p.apellidos].map(sql).join(', ')}, ` +
      `DATE ${sql(p.fechaNacimiento)}, ${[p.genero, p.correo, p.celular].map(sql).join(', ')})`,
    )
    .join(',\n');
  return `-- Generado por database/datos-profesor-csv.mjs. No editar a mano.
\\encoding UTF8

WITH datos (numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
            fecha_nacimiento, genero, correo, celular) AS (
    VALUES
${filas}
),
nuevas AS (
    INSERT INTO persona (numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
                         fecha_nacimiento, genero, correo, celular)
    SELECT * FROM datos
    ON CONFLICT (numero_documento) DO NOTHING
    RETURNING numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
              fecha_nacimiento, genero, correo, celular
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
           'tieneFoto',       false))
FROM nuevas;
`;
}

const NOMBRES = {
  tipoDocumento: 'tipo de documento', numeroDocumento: 'número de documento', primerNombre: 'primer nombre',
  segundoNombre: 'segundo nombre', nombres: 'nombres (primero = primer nombre, el resto = segundo)', apellidos: 'apellidos',
  primerApellido: 'primer apellido', segundoApellido: 'segundo apellido', fechaNacimiento: 'fecha de nacimiento',
  genero: 'género', correo: 'correo', celular: 'celular',
};

function principal() {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error('Uso: node database/datos-profesor-csv.mjs ARCHIVO.csv > salida.sql');
    process.exit(2);
  }
  const r = procesar(decodificar(readFileSync(ruta)));
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  const log = (m = '') => console.error(m);
  log(`Columnas reconocidas (separador «${r.separador === '\t' ? 'tabulador' : r.separador}»):`);
  for (const [campo, i] of Object.entries(r.mapa)) log(`  «${r.encabezado[i].trim()}» → ${NOMBRES[campo]}`);
  if (r.ignoradas.length > 0) log(`Columnas que no se usan: ${r.ignoradas.map((c) => `«${c}»`).join(', ')}`);
  log();
  log(`Personas válidas: ${r.validas.length}`);
  if (r.fuera.length > 0) {
    log(`Quedan FUERA (${r.fuera.length}); pruébalas en el formulario si son inválidas a propósito:`);
    for (const f of r.fuera) log(`  línea ${f.linea}, documento «${f.documento}»: ${f.motivos.join('; ')}`);
  }
  if (r.validas.length === 0) {
    log('No hay ninguna persona válida para cargar.');
    process.exit(1);
  }
  process.stdout.write(generarSql(r.validas));
}

const esPrincipal =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (esPrincipal) principal();
