import { BadRequestException } from '@nestjs/common';
import { FOTO_MAX_BYTES } from '../constantes';
import { DocumentoPipe } from './documento.pipe';
import { esFechaFutura, formatearFecha, hoyIso, parsearFecha } from './fecha';
import { detectarTipoFoto, validarFoto } from './foto';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

function campoDelError(accion: () => unknown): string {
  try {
    accion();
  } catch (error) {
    const respuesta = (error as BadRequestException).getResponse() as { errores: Array<{ campo: string }> };
    return respuesta.errores[0].campo;
  }
  throw new Error('No lanzó error');
}

describe('fechas', () => {
  it('convierte dd-mmm-yyyy a yyyy-mm-dd, sin importar mayúsculas', () => {
    expect(parsearFecha('05-mar-2001')).toBe('2001-03-05');
    expect(parsearFecha('5-MAR-2001')).toBe('2001-03-05');
    expect(parsearFecha(' 31-dic-1999 ')).toBe('1999-12-31');
    expect(parsearFecha('29-feb-2024')).toBe('2024-02-29');
  });

  it('acepta yyyy-mm-dd', () => {
    expect(parsearFecha('2001-03-05')).toBe('2001-03-05');
  });

  it('rechaza fechas inexistentes y otros formatos', () => {
    for (const valor of ['29-feb-2023', '32-ene-2001', '2001-13-01', '05/03/2001', '05-marzo-2001', '', null, 20010305]) {
      expect(parsearFecha(valor)).toBeNull();
    }
  });

  it('distingue las fechas futuras', () => {
    const ahora = new Date(2026, 10, 16, 12, 0, 0);
    expect(hoyIso(ahora)).toBe('2026-11-16');
    expect(esFechaFutura('2026-11-16', ahora)).toBe(false);
    expect(esFechaFutura('2026-11-17', ahora)).toBe(true);
    expect(esFechaFutura('1999-01-01', ahora)).toBe(false);
  });

  it('formatea yyyy-mm-dd como dd-mmm-yyyy', () => {
    expect(formatearFecha('2001-03-05')).toBe('05-mar-2001');
    expect(formatearFecha('1999-12-31')).toBe('31-dic-1999');
  });
});

describe('foto', () => {
  it('es opcional', () => {
    expect(validarFoto(undefined)).toBeNull();
    expect(validarFoto(null)).toBeNull();
    expect(validarFoto({ buffer: Buffer.alloc(0) })).toBeNull();
  });

  it('reconoce JPG y PNG por su contenido', () => {
    expect(validarFoto({ buffer: PNG })).toEqual({ foto: PNG, fotoTipo: 'image/png' });
    expect(validarFoto({ buffer: JPG })).toEqual({ foto: JPG, fotoTipo: 'image/jpeg' });
    expect(detectarTipoFoto(Buffer.from('GIF89a'))).toBeNull();
  });

  it('rechaza un archivo que no es JPG ni PNG aunque diga serlo', () => {
    expect(campoDelError(() => validarFoto({ buffer: Buffer.from('%PDF-1.7 no soy una imagen') }))).toBe('foto');
  });

  it('acepta exactamente 2 MB y rechaza un byte más', () => {
    const justo = Buffer.concat([PNG, Buffer.alloc(FOTO_MAX_BYTES - PNG.length)]);
    expect(validarFoto({ buffer: justo })?.fotoTipo).toBe('image/png');
    const pasado = Buffer.concat([PNG, Buffer.alloc(FOTO_MAX_BYTES - PNG.length + 1)]);
    expect(campoDelError(() => validarFoto({ buffer: pasado }))).toBe('foto');
  });
});

describe('DocumentoPipe', () => {
  const pipe = new DocumentoPipe();

  it('acepta de 1 a 10 dígitos', () => {
    expect(pipe.transform('1043123456')).toBe('1043123456');
    expect(pipe.transform(' 7 ')).toBe('7');
  });

  it('rechaza letras, más de 10 dígitos y vacío', () => {
    for (const valor of ['12A', '12345678901', '', undefined]) {
      expect(campoDelError(() => pipe.transform(valor))).toBe('numeroDocumento');
    }
  });
});
