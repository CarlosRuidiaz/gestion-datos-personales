import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { aErroresDeCampo } from '../validacion/validacion';
import { CrearPersonaDto, ModificarPersonaDto } from './persona.dto';

const VALIDA = {
  tipoDocumento: 'Cédula',
  numeroDocumento: '1043123456',
  primerNombre: 'Pedro',
  segundoNombre: 'Andrés',
  apellidos: 'Pérez Gómez',
  fechaNacimiento: '05-mar-2003',
  genero: 'Masculino',
  correo: 'pedro.perez@example.com',
  celular: '3001234567',
};

/** Devuelve { campo: mensaje } con los errores de validar los datos como CrearPersonaDto. */
async function errores(datos: Record<string, unknown>, clase: new () => object = CrearPersonaDto) {
  const dto = plainToInstance(clase, datos);
  const resultado = aErroresDeCampo(await validate(dto, { whitelist: true }));
  return Object.fromEntries(resultado.map((e) => [e.campo, e.mensaje]));
}

describe('CrearPersonaDto', () => {
  it('acepta una persona válida y deja la fecha como yyyy-mm-dd', async () => {
    const dto = plainToInstance(CrearPersonaDto, VALIDA);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.fechaNacimiento).toBe('2003-03-05');
  });

  it('acepta la fecha de un calendario (yyyy-mm-dd)', async () => {
    expect(await errores({ ...VALIDA, fechaNacimiento: '2003-03-05' })).toEqual({});
  });

  it('el segundo nombre es opcional: vacío o ausente queda sin valor', async () => {
    const vacio = plainToInstance(CrearPersonaDto, { ...VALIDA, segundoNombre: '   ' });
    expect(await validate(vacio)).toHaveLength(0);
    expect(vacio.segundoNombre).toBeNull();

    const { segundoNombre, ...sinSegundo } = VALIDA;
    expect(await errores(sinSegundo)).toEqual({});
  });

  it('recorta los espacios de los textos', async () => {
    const dto = plainToInstance(CrearPersonaDto, { ...VALIDA, primerNombre: '  Pedro  ', correo: ' pedro@example.com ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.primerNombre).toBe('Pedro');
    expect(dto.correo).toBe('pedro@example.com');
  });

  it('acepta los valores límite de longitud', async () => {
    const datos = {
      ...VALIDA,
      numeroDocumento: '1234567890',
      primerNombre: 'a'.repeat(30),
      segundoNombre: 'b'.repeat(30),
      apellidos: 'c'.repeat(60),
    };
    expect(await errores(datos)).toEqual({});
  });

  // Caso CP-03 del plan de pruebas: cada campo con un valor inválido.
  const invalidos: Array<[string, string, unknown, string]> = [
    ['tipoDocumento', 'fuera de la lista', 'Pasaporte', 'Tarjeta de identidad o Cédula'],
    ['numeroDocumento', 'con letras', '12A45', 'solo dígitos'],
    ['numeroDocumento', 'de 11 dígitos', '12345678901', 'máximo 10'],
    ['numeroDocumento', 'vacío', '', 'solo dígitos'],
    ['primerNombre', 'con números', 'Pedro2', 'no puede contener números'],
    ['primerNombre', 'de 31 caracteres', 'a'.repeat(31), 'más de 30'],
    ['primerNombre', 'vacío', '   ', 'obligatorio'],
    ['segundoNombre', 'con números', 'Andr3s', 'no puede contener números'],
    ['segundoNombre', 'de 31 caracteres', 'b'.repeat(31), 'más de 30'],
    ['apellidos', 'con números', 'Pérez 2', 'no pueden contener números'],
    ['apellidos', 'de 61 caracteres', 'c'.repeat(61), 'más de 60'],
    ['apellidos', 'ausentes', undefined, 'obligatorios'],
    ['fechaNacimiento', 'en otro formato', '05/03/2003', 'dd-mmm-yyyy'],
    ['fechaNacimiento', 'inexistente', '31-feb-2003', 'dd-mmm-yyyy'],
    ['fechaNacimiento', 'con un mes que no existe', '05-xyz-2003', 'dd-mmm-yyyy'],
    ['fechaNacimiento', 'futura', '01-ene-2999', 'no puede ser futura'],
    ['fechaNacimiento', 'ausente', undefined, 'dd-mmm-yyyy'],
    ['genero', 'fuera de la lista', 'Otro', 'Masculino, Femenino'],
    ['correo', 'sin arroba', 'pedro.example.com', 'formato válido'],
    ['correo', 'de más de 100 caracteres', `${'a'.repeat(95)}@example.com`, 'más de 100'],
    ['celular', 'de 9 dígitos', '300123456', 'exactamente 10 dígitos'],
    ['celular', 'de 11 dígitos', '30012345678', 'exactamente 10 dígitos'],
    ['celular', 'con letras', '30012345ab', 'exactamente 10 dígitos'],
  ];

  it.each(invalidos)('rechaza %s %s', async (campo, _caso, valor, fragmento) => {
    const resultado = await errores({ ...VALIDA, [campo]: valor });
    expect(Object.keys(resultado)).toEqual([campo]);
    expect(resultado[campo]).toContain(fragmento);
  });

  it('informa todos los campos inválidos a la vez', async () => {
    const resultado = await errores({ ...VALIDA, celular: 'x', correo: 'y', genero: 'z' });
    expect(Object.keys(resultado).sort()).toEqual(['celular', 'correo', 'genero']);
  });
});

describe('ModificarPersonaDto', () => {
  it('valida los mismos campos pero no incluye el número de documento', async () => {
    const dto = plainToInstance(ModificarPersonaDto, { ...VALIDA, numeroDocumento: '999' });
    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto).not.toHaveProperty('numeroDocumento');
    expect(await errores({ ...VALIDA, celular: '1' }, ModificarPersonaDto)).toHaveProperty('celular');
  });
});
