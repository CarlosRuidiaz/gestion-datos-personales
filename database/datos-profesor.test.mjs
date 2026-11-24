// Pruebas del conversor de los datos del profesor (T28 y T29). Se ejecutan con: npm run test:database
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import {
  celular, decodificar, documento, fecha, FOTO_MAX_BYTES, generarSql, genero, leerCarpeta, leerCsv, leerXlsx, leerZip,
  procesar, tipoDocumento, tipoImagen,
} from './datos-profesor.mjs';

const HOY = '2026-11-23';
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

/** Zip mínimo para las pruebas: { ruta: contenido }, con deflate o sin comprimir. */
function crearZip(archivos, comprimir = true) {
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const datos = Buffer.from(contenido);
    const guardado = comprimir ? deflateRawSync(datos) : datos;
    const nombre = Buffer.from(ruta);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(comprimir ? 8 : 0, 8);
    local.writeUInt32LE(crc32(datos), 14);
    local.writeUInt32LE(guardado.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(comprimir ? 8 : 0, 10);
    central.writeUInt32LE(crc32(datos), 16);
    central.writeUInt32LE(guardado.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    locales.push(local, nombre, guardado);
    centrales.push(central, nombre);
    desplazamiento += 30 + nombre.length + guardado.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(archivos).length, 8);
  fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

/** .xlsx mínimo con una hoja; cada celda es texto en línea, número o { s: índice } de texto compartido. */
function crearXlsx(filas, compartidos = []) {
  const celda = (v, r, c) => {
    const ref = String.fromCharCode(65 + c) + (r + 1);
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    if (v && typeof v === 'object') return `<c r="${ref}" t="s"><v>${v.s}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  };
  const hoja = `<worksheet><sheetData>${filas
    .map((f, r) => `<row r="${r + 1}">${f.map((v, c) => (v === null ? '' : celda(v, r, c))).join('')}</row>`)
    .join('')}</sheetData></worksheet>`;
  return crearZip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="grupo" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/hoja.xml"/></Relationships>',
    'xl/worksheets/hoja.xml': hoja,
    'xl/sharedStrings.xml': `<sst>${compartidos.map((s) => `<si><r><t>${s.slice(0, 2)}</t></r><r><t>${s.slice(2)}</t></r></si>`).join('')}</sst>`,
  });
}

const ENCABEZADO = ['Tipo documento', 'Número Documento', 'Primer Nombre', 'Segundo Nombre', 'Apellidos',
  'Fecha Nacimiento', 'Género', 'Email', 'Celular', 'Foto'];

describe('valores', () => {
  it('tipo de documento', () => {
    for (const v of ['CC', 'C.C.', 'cédula', 'Cedula de ciudadania', 'Cédula']) assert.equal(tipoDocumento(v), 'Cédula');
    for (const v of ['TI', 'T.I', 'tarjeta de identidad']) assert.equal(tipoDocumento(v), 'Tarjeta de identidad');
    assert.equal(tipoDocumento('Pasaporte'), null);
  });

  it('género', () => {
    assert.equal(genero('M'), 'Masculino');
    assert.equal(genero('mujer'), 'Femenino');
    assert.equal(genero('No Binario'), 'No binario');
    assert.equal(genero('Prefiero no reportar'), 'Prefiero no reportar');
    assert.equal(genero('X'), null);
  });

  it('fechas en los formatos comunes, leyendo día/mes/año', () => {
    assert.equal(fecha('16-mar-1965'), '1965-03-16');
    assert.equal(fecha('29-feb-1980'), '1980-02-29');
    assert.equal(fecha('2003-03-05'), '2003-03-05');
    assert.equal(fecha('05/03/2003'), '2003-03-05');
    assert.equal(fecha('5-3-2003'), '2003-03-05');
    assert.equal(fecha('5 marzo 2003'), '2003-03-05');
    assert.equal(fecha('05/03/2003 0:00'), '2003-03-05');
    assert.equal(fecha('37685'), '2003-03-05'); // fecha de Excel
    assert.equal(fecha('29-feb-1981'), null);
    assert.equal(fecha('ayer'), null);
  });

  it('documento y celular sin adornos', () => {
    assert.equal(documento('1.043.123.456'), '1043123456');
    assert.equal(celular('+57 300 123 4567'), '3001234567');
    assert.equal(celular('(300) 123-4567'), '3001234567');
  });

  it('reconoce la imagen por su contenido, no por la extensión', () => {
    assert.equal(tipoImagen(JPG), 'image/jpeg');
    assert.equal(tipoImagen(PNG), 'image/png');
    assert.equal(tipoImagen(Buffer.from('no soy una foto')), null);
  });
});

describe('lectura de archivos', () => {
  it('CSV: detecta punto y coma y respeta comillas', () => {
    const { separador, filas } = leerCsv('a;b\n"x;1";"di ""hola"""\r\n\n');
    assert.equal(separador, ';');
    assert.deepEqual(filas, [['a', 'b'], ['x;1', 'di "hola"']]);
  });

  it('CSV: lee Windows-1252 (Excel en español) y quita el BOM de UTF-8', () => {
    assert.equal(decodificar(Buffer.from([0x43, 0xe9, 0x64, 0x75, 0x6c, 0x61])), 'Cédula');
    assert.equal(decodificar(Buffer.from('﻿hola', 'utf8')), 'hola');
  });

  it('zip: lee archivos comprimidos y sin comprimir', () => {
    const z = leerZip(crearZip({ 'a.txt': 'hola', 'carpeta/b.jpg': JPG }));
    assert.equal(z.get('a.txt').toString(), 'hola');
    assert.ok(z.get('carpeta/b.jpg').equals(JPG));
    assert.equal(leerZip(crearZip({ 'c.txt': 'sin comprimir' }, false)).get('c.txt').toString(), 'sin comprimir');
    assert.throws(() => leerZip(Buffer.from('no es un zip')), /zip/);
  });

  it('xlsx: texto en línea, textos compartidos con formato, números largos y celdas vacías', () => {
    const filas = leerXlsx(crearXlsx([
      ['Documento', 'Nombre', 'Celular'],
      [1147583892, { s: 0 }, 3214432410],
      [5887025, 'Pe&#241;a', null, null],
    ], ['Sofía']));
    assert.deepEqual(filas, [['Documento', 'Nombre', 'Celular'], ['1147583892', 'Sofía', '3214432410'], ['5887025', 'Peña']]);
  });
});

describe('procesar', () => {
  const filas = [
    ENCABEZADO,
    ['Cédula', '5887025', 'Melisa', 'Teresa', 'Rojas Meza', '16-mar-1965', 'Femenino', 'Melisa@example.com', '3214432410', 'foto_01.jpg'],
    ['Tarjeta de identidad', '1080886179', 'Juan', '', 'Polo Escorcia', '27-jul-2018', 'Masculino', 'juan@example.com', '3019994896', 'FOTO_01.JPG'],
    ['Cédula', '22353766', 'Andrea', 'Isabellaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Navarro', '03-jun-1985', 'Femenino', 'a@example.com', '3154205178', 'foto_02.jpg'],
    ['Cédula', '5887025', 'Repetido', '', 'Rojas', '16-mar-1965', 'Femenino', 'r@example.com', '3214432410', ''],
    ['Cédula', '123', 'Ana', '', 'Barrios', '21/04/2090', 'Z', 'sin-arroba', '300', ''],
    ['Cédula', '84469594', 'Martín', 'José', 'De la Hoz', '24-sep-1984', 'M', 'm@example.com', '3008113588', 'no_existe.jpg'],
    ['Cédula', '22916602', 'Javier', '', 'Jiménez', '29-feb-1980', 'M', 'j@example.com', '3048396266', 'grande.jpg'],
  ];
  const fotos = new Map([
    ['foto_01.jpg', { nombre: 'foto_01.jpg', bytes: JPG }],
    ['foto_02.jpg', { nombre: 'foto_02.jpg', bytes: PNG }],
    ['grande.jpg', { nombre: 'grande.jpg', bytes: Buffer.concat([JPG, Buffer.alloc(FOTO_MAX_BYTES)]) }],
  ]);
  const r = procesar(filas, { hoy: HOY, fotos });

  it('normaliza los valores y asigna las fotos por nombre, sin importar mayúsculas', () => {
    assert.equal(r.error, undefined);
    assert.equal(r.validas.length, 4);
    const [melisa, juan] = r.validas;
    assert.equal(melisa.correo, 'melisa@example.com');
    assert.equal(melisa.fechaNacimiento, '1965-03-16');
    assert.equal(melisa.fotoClave, 'foto_01.jpg');
    assert.equal(juan.fotoClave, 'foto_01.jpg');
    assert.equal(juan.tipoDocumento, 'Tarjeta de identidad');
    assert.equal(juan.segundoNombre, '');
    assert.deepEqual([...r.fotosUsadas.keys()], ['foto_01.jpg']);
  });

  it('deja fuera las filas inválidas o repetidas, con el motivo', () => {
    assert.deepEqual(r.fuera.map((f) => f.linea), [4, 5, 6]);
    assert.match(r.fuera[0].motivos.join(), /segundo nombre tiene más de 30 caracteres/);
    assert.match(r.fuera[1].motivos.join(), /documento repetido/);
    const motivos = r.fuera[2].motivos.join(' | ');
    for (const m of ['fecha de nacimiento es futura', 'género no reconocido', 'correo inválido', 'celular inválido']) {
      assert.ok(motivos.includes(m), m);
    }
  });

  it('si la foto falta o pesa más de 2 MB, la persona se carga sin foto y se avisa', () => {
    const martin = r.validas.find((p) => p.numeroDocumento === '84469594');
    const javier = r.validas.find((p) => p.numeroDocumento === '22916602');
    assert.equal(martin.fotoClave, null);
    assert.equal(javier.fotoClave, null);
    assert.match(r.avisosFoto.map((a) => a.motivo).join(' | '), /no se encontró la foto «no_existe.jpg».*grande.jpg pesa más de 2 MB/);
  });

  it('avisa qué columnas faltan', () => {
    const e = procesar([['Documento', 'Nombre completo', 'Correo'], ['1', 'Ana', 'a@b.co']], { hoy: HOY });
    assert.match(e.error, /primer nombre/);
    assert.match(e.error, /celular/);
  });

  it('genera SQL con cada foto una sola vez, comillas escapadas y NULL donde no hay valor', () => {
    const salida = generarSql(r.validas, r.fotosUsadas);
    assert.equal((salida.match(/decode\('/g) ?? []).length, 1);
    assert.ok(salida.includes(`('5887025', 'Cédula', 'Melisa', 'Teresa', 'Rojas Meza', DATE '1965-03-16', 'Femenino', 'melisa@example.com', '3214432410', 'foto_01.jpg')`));
    assert.ok(salida.includes(`('84469594', 'Cédula', 'Martín', 'José', 'De la Hoz', DATE '1984-09-24', 'Masculino', 'm@example.com', '3008113588', NULL)`));
    assert.ok(generarSql([{ ...r.validas[1], apellidos: "O'Neil" }]).includes("'O''Neil'"));
  });
});

describe('leerCarpeta', () => {
  it('toma el Excel y las fotos del zip y de la carpeta', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'profesor-'));
    try {
      writeFileSync(join(carpeta, 'grupo.xlsx'), crearXlsx([ENCABEZADO]));
      writeFileSync(join(carpeta, 'fotos.zip'), crearZip({ 'fotos/Foto_01.JPG': JPG, 'leeme.txt': 'x' }));
      writeFileSync(join(carpeta, 'suelta.png'), PNG);
      const l = leerCarpeta(carpeta);
      assert.equal(l.archivoDatos, 'grupo.xlsx');
      assert.deepEqual(l.filas, [ENCABEZADO]);
      assert.deepEqual([...l.fotos.keys()].sort(), ['foto_01.jpg', 'suelta.png']);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('pide un solo archivo de datos', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'profesor-'));
    try {
      assert.throws(() => leerCarpeta(carpeta), /No hay un Excel/);
      writeFileSync(join(carpeta, 'a.csv'), 'x');
      writeFileSync(join(carpeta, 'b.xlsx'), 'x');
      assert.throws(() => leerCarpeta(carpeta), /más de un archivo de datos/);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
