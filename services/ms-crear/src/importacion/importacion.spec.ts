import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { crc32, deflateRawSync } from 'node:zlib';
import { CLAVE_AUDITAR, CLAVE_ROLES, FOTO_MAX_BYTES, Rol, TipoTransaccion } from '@gdp/common';
import { ADMIN } from '../../../pruebas-comunes';
import { decodificar, leerCsv, leerDatos, leerFotos, leerXlsx, leerZip } from './archivos';
import { celular, columnasFaltantes, documento, fecha, genero, mapearColumnas, tipoDocumento } from './columnas';
import { ImportacionController } from './importacion.controller';
import { ImportacionService } from './importacion.service';

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

/** Zip mínimo: { ruta: contenido }, con deflate o sin comprimir. */
function crearZip(archivos: Record<string, Buffer | string>, comprimir = true): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
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

type Celda = string | number | { s: number } | null;

/** .xlsx mínimo, como el del profesor: texto en línea, números y, si se pide, textos compartidos. */
function crearXlsx(filas: Celda[][], compartidos: string[] = []): Buffer {
  const celda = (v: Celda, r: number, c: number) => {
    const ref = String.fromCharCode(65 + c) + (r + 1);
    if (typeof v === 'number') return `<c r="${ref}" s="3"><v>${v}</v></c>`;
    if (v && typeof v === 'object') return `<c r="${ref}" t="s"><v>${v.s}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  };
  const hoja = `<worksheet><sheetData>${filas
    .map((f, r) => `<row r="${r + 1}">${f.map((v, c) => (v === null ? '' : celda(v, r, c))).join('')}</row>`)
    .join('')}</sheetData></worksheet>`;
  return crearZip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="grupo_7" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': hoja,
    'xl/sharedStrings.xml': `<sst>${compartidos.map((s) => `<si><r><t>${s.slice(0, 2)}</t></r><r><t>${s.slice(2)}</t></r></si>`).join('')}</sst>`,
  });
}

const ENCABEZADO = ['Tipo documento', 'N&#250;mero Documento', 'Primer Nombre', 'Segundo Nombre', 'Apellidos',
  'Fecha Nacimiento', 'G&#233;nero', 'Email', 'Celular', 'Foto'];

describe('ms-crear · importación: lectura de archivos', () => {
  it('lee un zip comprimido y sin comprimir', () => {
    const z = leerZip(crearZip({ 'a.txt': 'hola', 'carpeta/b.jpg': JPG }));
    expect(z.get('a.txt')?.toString()).toBe('hola');
    expect(z.get('carpeta/b.jpg')?.equals(JPG)).toBe(true);
    expect(leerZip(crearZip({ 'c.txt': 'sin comprimir' }, false)).get('c.txt')?.toString()).toBe('sin comprimir');
    expect(() => leerZip(Buffer.from('no es un zip'))).toThrow('zip');
  });

  it('lee un Excel: texto en línea, textos compartidos con formato, números largos y celdas vacías', () => {
    const filas = leerXlsx(crearXlsx([['Documento', 'Nombre', 'Celular'], [1147583892, { s: 0 }, 3214432410], [5887025, 'Pe&#241;a', null]], ['Sofía']));
    expect(filas).toEqual([['Documento', 'Nombre', 'Celular'], ['1147583892', 'Sofía', '3214432410'], ['5887025', 'Peña']]);
  });

  it('lee CSV con punto y coma, comillas y Windows-1252', () => {
    expect(leerCsv('a;b\n"x;1";"di ""hola"""\r\n\n')).toEqual([['a', 'b'], ['x;1', 'di "hola"']]);
    expect(decodificar(Buffer.from([0x43, 0xe9, 0x64, 0x75, 0x6c, 0x61]))).toBe('Cédula');
  });

  it('decide por la extensión y rechaza otros formatos', () => {
    expect(leerDatos({ originalname: 'g.csv', buffer: Buffer.from('a,b\n1,2') })).toEqual([['a', 'b'], ['1', '2']]);
    expect(() => leerDatos({ originalname: 'g.pdf', buffer: Buffer.from('x') })).toThrow('Excel');
  });

  it('toma las fotos de los zip y las sueltas, por nombre sin carpeta ni mayúsculas', () => {
    const fotos = leerFotos([
      { originalname: 'archivos_jpg.zip', buffer: crearZip({ 'fotos/Foto_01.JPG': JPG, 'leeme.txt': 'x' }) },
      { originalname: 'suelta.png', buffer: PNG },
    ]);
    expect([...fotos.keys()].sort()).toEqual(['foto_01.jpg', 'suelta.png']);
  });
});

describe('ms-crear · importación: columnas y valores', () => {
  it('reconoce los encabezados con o sin tildes y dice cuáles faltan', () => {
    const { mapa, ignoradas } = mapearColumnas(['Tipo Doc', 'No. Identificación', 'Nombres', 'Primer apellido', 'Sexo', 'E-mail', 'Teléfono', 'Observaciones']);
    expect(mapa).toMatchObject({ tipoDocumento: 0, numeroDocumento: 1, nombres: 2, primerApellido: 3, genero: 4, correo: 5, celular: 6 });
    expect(ignoradas).toEqual(['Observaciones']);
    expect(columnasFaltantes(mapa)).toEqual(['fecha de nacimiento']);
  });

  it('normaliza las formas comunes de escribir los valores', () => {
    expect(tipoDocumento('CC')).toBe('Cédula');
    expect(tipoDocumento('T.I.')).toBe('Tarjeta de identidad');
    expect(genero('f')).toBe('Femenino');
    expect(fecha('16-mar-1965')).toBe('1965-03-16');
    expect(fecha('05/03/2003')).toBe('2003-03-05');
    expect(fecha('37685')).toBe('2003-03-05');
    expect(fecha('31/02/2003')).toBe('31/02/2003'); // no la inventa: el DTO dará el error
    expect(documento('1.043.123.456')).toBe('1043123456');
    expect(celular('+57 300 123 4567')).toBe('3001234567');
  });
});

describe('ms-crear · ImportacionService', () => {
  const filas: Celda[][] = [
    ENCABEZADO,
    ['Cédula', 5887025, 'Melisa', 'Teresa', 'Rojas Meza', '16-mar-1965', 'Femenino', 'Melisa@example.com', 3214432410, 'foto_perfil_01.jpg'],
    ['Tarjeta de identidad', 1080886179, 'Juan', null, 'Polo Escorcia', '27-jul-2018', 'Masculino', 'juan@example.com', 3019994896, 'FOTO_PERFIL_01.JPG'],
    ['Cédula', 22353766, 'Andrea', 'Isabellaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Navarro', '03-jun-1985', 'Femenino', 'a@example.com', 3154205178, 'foto_perfil_02.jpg'],
    ['Cédula', 5887025, 'Repetida', null, 'Rojas', '16-mar-1965', 'Femenino', 'r@example.com', 3214432410, null],
    ['Cédula', 72937017, 'Claudia', 'Lucía', 'López Quintero', '11-may-1966', 'Femenino', 'c@example.com', 3179862016, 'no_esta.jpg'],
    ['Cédula', 84880893, 'Andrés', 'Manuel', 'Barrios Vargas', '11-nov-1970', 'Masculino', 'andres@example.com', 3119072005, 'grande.jpg'],
    ['Cédula', 9048409, 'Ya', null, 'Existe', '17-oct-1964', 'F', 'ya@example.com', 3151908474, null],
  ];
  const datos = { originalname: 'grupo_7.xlsx', buffer: crearXlsx(filas) };
  const fotos = [
    { originalname: 'archivos_jpg.zip', buffer: crearZip({ 'foto_perfil_01.jpg': JPG, 'grande.jpg': Buffer.concat([JPG, Buffer.alloc(FOTO_MAX_BYTES)]) }) },
  ];

  function preparar() {
    const repositorio = { find: jest.fn().mockResolvedValue([{ numeroDocumento: '9048409' }]) };
    const dataSource = { getRepository: jest.fn().mockReturnValue(repositorio) };
    const personas = { crear: jest.fn().mockResolvedValue({}) };
    const auditoria = { registrarAparte: jest.fn() };
    const servicio = new ImportacionService(dataSource as never, personas as never, auditoria as never);
    return { servicio, personas, auditoria };
  }

  it('la revisión no crea nada y dice qué pasará con cada fila, con los mensajes del formulario', async () => {
    const { servicio, personas, auditoria } = preparar();
    const r = await servicio.revisar(datos, fotos);

    expect(personas.crear).not.toHaveBeenCalled();
    expect(auditoria.registrarAparte).not.toHaveBeenCalled();
    expect(r.archivo).toBe('grupo_7.xlsx');
    expect(r.columnas).toHaveLength(10);
    expect(r.filas.map((f) => [f.linea, f.estado])).toEqual([
      [2, 'lista'], [3, 'lista'], [4, 'invalida'], [5, 'invalida'], [6, 'lista'], [7, 'lista'], [8, 'existe'],
    ]);
    expect(r.filas[2].motivos).toEqual(['El segundo nombre no puede tener más de 30 caracteres']);
    expect(r.filas[3].motivos).toEqual(['El número de documento está repetido en el archivo']);
    expect(r.filas[0].foto).toEqual({ archivo: 'foto_perfil_01.jpg', usada: true });
    expect(r.filas[1].foto).toEqual({ archivo: 'foto_perfil_01.jpg', usada: true });
    expect(r.filas[4].foto).toMatchObject({ usada: false, motivo: 'No está entre las fotos subidas' });
    expect(r.filas[5].foto).toMatchObject({ usada: false, motivo: 'La foto no puede superar los 2 MB' });
    expect(r.resumen).toEqual({ total: 7, listas: 4, creadas: 0, existentes: 1, invalidas: 2, conFoto: 2 });
  });

  it('importar crea cada persona como el formulario y deja en el log las que no se pudieron crear', async () => {
    const { servicio, personas, auditoria } = preparar();
    personas.crear.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockRejectedValueOnce(new ConflictException('x'));

    const r = await servicio.importar(datos, fotos, ADMIN);

    expect(personas.crear).toHaveBeenCalledTimes(4);
    const [dto, foto, usuario] = personas.crear.mock.calls[0];
    expect(dto).toMatchObject({ numeroDocumento: '5887025', tipoDocumento: 'Cédula', fechaNacimiento: '1965-03-16', correo: 'melisa@example.com', celular: '3214432410' });
    expect(foto).toEqual({ foto: JPG, fotoTipo: 'image/jpeg' });
    expect(usuario).toBe(ADMIN);
    expect(personas.crear.mock.calls[3][1]).toBeNull(); // la foto de más de 2 MB no se usa

    expect(r.filas.map((f) => f.estado)).toEqual(['creada', 'creada', 'invalida', 'invalida', 'existe', 'creada', 'existe']);
    expect(r.resumen).toMatchObject({ creadas: 3, existentes: 2, invalidas: 2 });

    const registros = auditoria.registrarAparte.mock.calls.map((c) => c[0]);
    expect(registros).toHaveLength(4);
    expect(registros.every((x) => x.tipo === TipoTransaccion.CREAR && x.resultado === 'ERROR')).toBe(true);
    expect(registros[0]).toMatchObject({
      numeroDocumento: '22353766',
      detalle: { contexto: 'Importación desde grupo_7.xlsx, línea 4', motivo: 'El segundo nombre no puede tener más de 30 caracteres' },
    });
  });

  it('sin archivo o sin columnas obligatorias responde 400 sin crear nada', async () => {
    const { servicio, personas } = preparar();
    await expect(servicio.revisar(undefined, [])).rejects.toThrow('Hay campos con errores');
    const incompleto = { originalname: 'x.csv', buffer: Buffer.from('Documento,Nombre\n1,Ana\n') };
    await expect(servicio.importar(incompleto, [], ADMIN)).rejects.toThrow();
    expect(personas.crear).not.toHaveBeenCalled();
  });

  it('solo el administrador puede importar, y la importación se audita como CREAR', () => {
    expect(Reflect.getMetadata(CLAVE_ROLES, ImportacionController)).toEqual([Rol.ADMINISTRADOR]);
    expect(Reflect.getMetadata(CLAVE_AUDITAR, ImportacionController.prototype.importar)).toEqual({
      tipo: TipoTransaccion.CREAR,
      contexto: 'Importación de personas',
    });
  });
});
