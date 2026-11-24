// Crea un Excel y un zip de fotos ficticios con el mismo formato que manda el profesor, para
// services/ms-crear/verificar-importacion.sh. Uso: node services/ms-crear/archivos-importacion-prueba.mjs CARPETA
// Solo datos ficticios: documentos 99999999xx y correos @example.com.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const carpeta = process.argv[2];

function crearZip(archivos) {
  const locales = [];
  const centrales = [];
  let d = 0;
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const datos = Buffer.from(contenido);
    const g = deflateRawSync(datos);
    const n = Buffer.from(ruta);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc32(datos), 14);
    l.writeUInt32LE(g.length, 18); l.writeUInt32LE(datos.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc32(datos), 16);
    c.writeUInt32LE(g.length, 20); c.writeUInt32LE(datos.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(d, 42);
    locales.push(l, n, g);
    centrales.push(c, n);
    d += 30 + n.length + g.length;
  }
  const directorio = Buffer.concat(centrales);
  const f = Buffer.alloc(22);
  f.writeUInt32LE(0x06054b50, 0);
  f.writeUInt16LE(Object.keys(archivos).length, 8);
  f.writeUInt16LE(Object.keys(archivos).length, 10);
  f.writeUInt32LE(directorio.length, 12);
  f.writeUInt32LE(d, 16);
  return Buffer.concat([...locales, directorio, f]);
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/[^\x00-\x7f]/g, (c) => `&#${c.codePointAt(0)};`);

// Mismas columnas que grupo_N.xlsx del profesor. La línea 5 es inválida a propósito y la 6 pide una foto que no viene.
const filas = [
  ['Tipo documento', 'Número Documento', 'Primer Nombre', 'Segundo Nombre', 'Apellidos', 'Fecha Nacimiento', 'Género', 'Email', 'Celular', 'Foto'],
  ['Cédula', 9999999941, 'Lucía', 'Fernanda', 'Prueba Uno', '16-mar-1965', 'Femenino', 'lucia.prueba@example.com', 3000000001, 'foto_perfil_01.jpg'],
  ['Cédula', 9999999942, 'Tomás', 'Elías', 'Prueba Dos', '29-nov-1976', 'No binario', 'tomas.prueba@example.com', 3000000002, 'foto_perfil_02.jpg'],
  ['Tarjeta de identidad', 9999999943, 'Sara', '', 'Prueba Tres', '27-jul-2018', 'Femenino', 'sara.prueba@example.com', 3000000003, 'foto_perfil_01.jpg'],
  ['Cédula', 9999999944, 'Mario', 'Maximilianooooooooooooooooooooooo', 'Prueba Cuatro', '11-may-1966', 'Masculino', 'mario.prueba@example.com', 3000000004, 'foto_perfil_02.jpg'],
  ['Cédula', 9999999945, 'Rosa', 'Inés', 'Prueba Cinco', '06-feb-1965', 'Prefiero no reportar', 'rosa.prueba@example.com', 3000000005, 'foto_perfil_09.jpg'],
];
const celda = (v, r, c) => {
  if (v === '') return '';
  const ref = String.fromCharCode(65 + c) + (r + 1);
  return typeof v === 'number' ? `<c r="${ref}" s="3"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
};
const hoja = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas
  .map((f, r) => `<row r="${r + 1}">${f.map((v, c) => celda(v, r, c)).join('')}</row>`)
  .join('')}</sheetData></worksheet>`;

writeFileSync(join(carpeta, 'grupo_prueba.xlsx'), crearZip({
  'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="grupo_prueba" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': hoja,
}));

// JPG mínimo válido (cabecera JFIF, sin imagen real): basta para que ms-crear lo reconozca como JPG.
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
writeFileSync(join(carpeta, 'archivos_jpg.zip'), crearZip({ 'foto_perfil_01.jpg': jpg, 'foto_perfil_02.jpg': jpg }));
