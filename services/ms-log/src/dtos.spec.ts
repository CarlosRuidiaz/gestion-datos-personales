import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { aErroresDeCampo, TipoTransaccion } from '@gdp/common';
import { ConsultaNlDto, PREGUNTA_MAXIMO, RESPUESTA_MAXIMO } from './consulta-nl.dto';
import { FiltrosLogDto, TAMANO_MAXIMO } from './filtros-log.dto';

/** { campo: mensaje } de los errores de validar `datos` como `clase`. */
async function errores(clase: new () => object, datos: Record<string, unknown>) {
  const resultado = aErroresDeCampo(await validate(plainToInstance(clase, datos), { whitelist: true }));
  return Object.fromEntries(resultado.map((e) => [e.campo, e.mensaje]));
}

describe('ms-log · FiltrosLogDto (los filtros llegan como texto en la URL)', () => {
  it('sin filtros es válido', async () => {
    expect(await errores(FiltrosLogDto, {})).toEqual({});
  });

  it('acepta todos los tipos de transacción', async () => {
    for (const tipo of Object.values(TipoTransaccion)) {
      expect(await errores(FiltrosLogDto, { tipo })).toEqual({});
    }
  });

  it('rechaza un tipo fuera de la lista y dice cuáles hay', async () => {
    const { tipo } = await errores(FiltrosLogDto, { tipo: 'INVENTADO' });
    expect(tipo).toContain('CREAR');
    expect(tipo).toContain('CONSULTA_NL');
  });

  it('un filtro vacío (?tipo=) cuenta como no enviado', async () => {
    const dto = plainToInstance(FiltrosLogDto, { tipo: '', documento: '  ', desde: '', pagina: '' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.tipo).toBeUndefined();
    expect(dto.documento).toBeUndefined();
    expect(dto.pagina).toBeUndefined();
  });

  it('el documento debe tener solo dígitos y máximo 10', async () => {
    expect(await errores(FiltrosLogDto, { documento: '1043123456' })).toEqual({});
    expect(await errores(FiltrosLogDto, { documento: '99ABC' })).toHaveProperty('documento');
    expect(await errores(FiltrosLogDto, { documento: '12345678901' })).toHaveProperty('documento');
  });

  it('las fechas aceptan yyyy-mm-dd y dd-mmm-yyyy, y quedan como yyyy-mm-dd', async () => {
    const dto = plainToInstance(FiltrosLogDto, { desde: '05-mar-2026', hasta: '2026-11-30' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.desde).toBe('2026-03-05');
    expect(dto.hasta).toBe('2026-11-30');
  });

  it('rechaza fechas que no existen en el calendario o que no son fechas', async () => {
    expect(await errores(FiltrosLogDto, { desde: '2020-13-01' })).toHaveProperty('desde');
    expect(await errores(FiltrosLogDto, { hasta: '2026-02-30' })).toHaveProperty('hasta');
    expect(await errores(FiltrosLogDto, { desde: 'ayer' })).toHaveProperty('desde');
  });

  it('la página y el tamaño llegan como texto y se convierten en números', async () => {
    const dto = plainToInstance(FiltrosLogDto, { pagina: '2', tamano: '50' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.pagina).toBe(2);
    expect(dto.tamano).toBe(50);
  });

  it('rechaza una página menor que 1 o que no es entera', async () => {
    expect(await errores(FiltrosLogDto, { pagina: '0' })).toHaveProperty('pagina');
    expect(await errores(FiltrosLogDto, { pagina: '1.5' })).toHaveProperty('pagina');
    expect(await errores(FiltrosLogDto, { pagina: 'abc' })).toHaveProperty('pagina');
  });

  it(`el tamaño debe estar entre 1 y ${TAMANO_MAXIMO}`, async () => {
    expect(await errores(FiltrosLogDto, { tamano: '1' })).toEqual({});
    expect(await errores(FiltrosLogDto, { tamano: String(TAMANO_MAXIMO) })).toEqual({});
    expect(await errores(FiltrosLogDto, { tamano: '0' })).toHaveProperty('tamano');
    expect(await errores(FiltrosLogDto, { tamano: String(TAMANO_MAXIMO + 1) })).toHaveProperty('tamano');
  });
});

describe('ms-log · ConsultaNlDto (lo que envía n8n)', () => {
  const VALIDA = { pregunta: '¿Cuál es el empleado más joven?', respuesta: 'Isabella', resultado: 'EXITO' };

  it('acepta una consulta válida', async () => {
    expect(await errores(ConsultaNlDto, VALIDA)).toEqual({});
  });

  it('la respuesta y el detalle son opcionales (el modelo pudo fallar)', async () => {
    expect(await errores(ConsultaNlDto, { pregunta: 'hola', resultado: 'ERROR' })).toEqual({});
  });

  it('la pregunta es obligatoria: ausente, vacía o solo espacios', async () => {
    expect(await errores(ConsultaNlDto, { resultado: 'EXITO' })).toHaveProperty('pregunta');
    expect(await errores(ConsultaNlDto, { ...VALIDA, pregunta: '' })).toHaveProperty('pregunta');
    expect(await errores(ConsultaNlDto, { ...VALIDA, pregunta: '   ' })).toHaveProperty('pregunta');
  });

  it('recorta los espacios de la pregunta y de la respuesta', () => {
    const dto = plainToInstance(ConsultaNlDto, { ...VALIDA, pregunta: '  hola  ', respuesta: ' sí ' });
    expect(dto.pregunta).toBe('hola');
    expect(dto.respuesta).toBe('sí');
  });

  it('respeta los largos máximos', async () => {
    expect(await errores(ConsultaNlDto, { ...VALIDA, pregunta: 'a'.repeat(PREGUNTA_MAXIMO) })).toEqual({});
    expect(await errores(ConsultaNlDto, { ...VALIDA, pregunta: 'a'.repeat(PREGUNTA_MAXIMO + 1) })).toHaveProperty('pregunta');
    expect(await errores(ConsultaNlDto, { ...VALIDA, respuesta: 'a'.repeat(RESPUESTA_MAXIMO + 1) })).toHaveProperty('respuesta');
  });

  it('el resultado debe ser EXITO o ERROR', async () => {
    expect(await errores(ConsultaNlDto, { ...VALIDA, resultado: 'TAL VEZ' })).toHaveProperty('resultado');
    expect(await errores(ConsultaNlDto, { pregunta: 'hola' })).toHaveProperty('resultado');
  });

  it('el detalle debe ser un objeto', async () => {
    expect(await errores(ConsultaNlDto, { ...VALIDA, detalle: { motivo: 'cuota agotada' } })).toEqual({});
    expect(await errores(ConsultaNlDto, { ...VALIDA, detalle: 'texto' })).toHaveProperty('detalle');
  });
});
