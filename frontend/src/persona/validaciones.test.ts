import { describe, expect, it } from 'vitest';
import { aFormData, datosDesdePersona } from './envio';
import { formatearFecha, parsearFecha } from './fecha';
import { FOTO_MAX_BYTES, PERSONA_VACIA, type DatosPersona } from './tipos';
import { MENSAJE_FECHA, normalizarPersona, validarCampo, validarFoto, validarPersona } from './validaciones';

const HOY = '2026-11-22';

const valida: DatosPersona = {
  tipoDocumento: 'Cédula',
  numeroDocumento: '1043123456',
  primerNombre: 'Pedro',
  segundoNombre: 'Andrés',
  apellidos: 'Pérez Gómez',
  fechaNacimiento: '05-mar-2003',
  genero: 'Masculino',
  correo: 'pedro.perez@ejemplo.com',
  celular: '3001234567',
};

const con = (cambios: Partial<DatosPersona>) => ({ ...valida, ...cambios });
const archivo = (tipo: string, bytes: number) => new File([new Uint8Array(bytes)], 'foto', { type: tipo });

describe('fecha de nacimiento', () => {
  it('acepta dd-mmm-yyyy, con el mes en español y sin importar mayúsculas', () => {
    expect(parsearFecha('05-mar-2001')).toBe('2001-03-05');
    expect(parsearFecha('5-MAR-2001')).toBe('2001-03-05');
    expect(parsearFecha('31-dic-1999')).toBe('1999-12-31');
  });

  it('acepta yyyy-mm-dd, que es lo que entrega el calendario', () => {
    expect(parsearFecha('2001-03-05')).toBe('2001-03-05');
  });

  it('rechaza fechas que no existen y otros formatos', () => {
    for (const texto of ['30-feb-2001', '05-mar-01', '05/03/2001', '05-mzo-2001', 'ayer', '2001-13-01']) {
      expect(parsearFecha(texto)).toBeNull();
    }
  });

  it('convierte yyyy-mm-dd a dd-mmm-yyyy', () => {
    expect(formatearFecha('2003-03-05')).toBe('05-mar-2003');
  });
});

describe('validaciones del formulario (sección 3.3)', () => {
  it('una persona válida no tiene errores', () => {
    expect(validarPersona(valida, null, 'crear', HOY)).toEqual({});
  });

  it('el formulario vacío marca todos los obligatorios, pero no el segundo nombre', () => {
    const errores = validarPersona(PERSONA_VACIA, null, 'crear', HOY);
    expect(Object.keys(errores).sort()).toEqual(
      ['apellidos', 'celular', 'correo', 'fechaNacimiento', 'genero', 'numeroDocumento', 'primerNombre', 'tipoDocumento'].sort(),
    );
    expect(errores.primerNombre).toBe('El primer nombre es obligatorio');
    expect(errores.apellidos).toBe('Los apellidos son obligatorios');
  });

  it.each([
    ['tipoDocumento', 'Pasaporte', 'El tipo de documento debe ser Tarjeta de identidad o Cédula'],
    ['numeroDocumento', '12345678901', 'El número de documento debe tener solo dígitos y máximo 10 caracteres'],
    ['numeroDocumento', '10431234a', 'El número de documento debe tener solo dígitos y máximo 10 caracteres'],
    ['primerNombre', 'Pedro2', 'El primer nombre no puede contener números'],
    ['primerNombre', 'a'.repeat(31), 'El primer nombre no puede tener más de 30 caracteres'],
    ['segundoNombre', 'Andrés3', 'El segundo nombre no puede contener números'],
    ['segundoNombre', 'b'.repeat(31), 'El segundo nombre no puede tener más de 30 caracteres'],
    ['apellidos', 'Pérez 2', 'Los apellidos no pueden contener números'],
    ['apellidos', 'c'.repeat(61), 'Los apellidos no pueden tener más de 60 caracteres'],
    ['fechaNacimiento', '05/03/2003', MENSAJE_FECHA],
    ['fechaNacimiento', '23-nov-2026', 'La fecha de nacimiento no puede ser futura'],
    ['genero', 'Otro', 'El género debe ser Masculino, Femenino, No binario o Prefiero no reportar'],
    ['correo', 'pedro.ejemplo.com', 'El correo electrónico no tiene un formato válido'],
    ['correo', 'pedro@ejemplo', 'El correo electrónico no tiene un formato válido'],
    ['correo', `${'d'.repeat(95)}@e.com`, 'El correo electrónico no puede tener más de 100 caracteres'],
    ['celular', '300123456', 'El celular debe tener exactamente 10 dígitos'],
    ['celular', '30012345678', 'El celular debe tener exactamente 10 dígitos'],
    ['celular', '300-123-45', 'El celular debe tener exactamente 10 dígitos'],
  ] as const)('%s = «%s» da «%s»', (campo, valor, mensaje) => {
    expect(validarCampo(campo, con({ [campo]: valor }), HOY)).toBe(mensaje);
  });

  it('acepta los límites: 10 dígitos de documento, 30 de nombre, 60 de apellidos y la fecha de hoy', () => {
    const limite = con({
      numeroDocumento: '1234567890',
      primerNombre: 'a'.repeat(30),
      apellidos: 'c'.repeat(60),
      fechaNacimiento: '22-nov-2026',
      tipoDocumento: 'Tarjeta de identidad',
      genero: 'Prefiero no reportar',
    });
    expect(validarPersona(limite, null, 'crear', HOY)).toEqual({});
  });

  it('ignora los espacios al inicio y al final', () => {
    expect(validarPersona(con({ primerNombre: '  Pedro  ', celular: ' 3001234567 ' }), null, 'crear', HOY)).toEqual({});
  });

  it('al modificar no valida el número de documento, que no se puede cambiar', () => {
    expect(validarPersona(con({ numeroDocumento: '' }), null, 'modificar', HOY)).toEqual({});
  });
});

describe('foto', () => {
  it('es opcional', () => {
    expect(validarFoto(null)).toBeUndefined();
  });

  it('acepta JPG y PNG de hasta 2 MB', () => {
    expect(validarFoto(archivo('image/jpeg', FOTO_MAX_BYTES))).toBeUndefined();
    expect(validarFoto(archivo('image/png', 1000))).toBeUndefined();
  });

  it('rechaza más de 2 MB y otros tipos', () => {
    expect(validarFoto(archivo('image/png', FOTO_MAX_BYTES + 1))).toBe('La foto no puede superar los 2 MB');
    expect(validarFoto(archivo('image/gif', 1000))).toBe('La foto debe ser una imagen JPG o PNG');
    expect(validarFoto(archivo('application/pdf', 1000))).toBe('La foto debe ser una imagen JPG o PNG');
  });

  it('el error de la foto queda en el campo foto', () => {
    expect(validarPersona(valida, archivo('image/gif', 10), 'crear', HOY)).toEqual({
      foto: 'La foto debe ser una imagen JPG o PNG',
    });
  });
});

describe('envío a la API', () => {
  it('normaliza: recorta y deja la fecha como yyyy-mm-dd', () => {
    const datos = normalizarPersona(con({ primerNombre: ' Pedro ', fechaNacimiento: '05-mar-2003' }));
    expect(datos.primerNombre).toBe('Pedro');
    expect(datos.fechaNacimiento).toBe('2003-03-05');
  });

  it('al crear envía el documento y la foto', () => {
    const foto = archivo('image/png', 10);
    const cuerpo = aFormData({ datos: valida, foto, eliminarFoto: false }, 'crear');
    expect(cuerpo.get('numeroDocumento')).toBe('1043123456');
    expect(cuerpo.get('foto')).toBeInstanceOf(File);
    expect(cuerpo.has('eliminarFoto')).toBe(false);
  });

  it('al modificar no envía el documento y el segundo nombre vacío va como texto vacío', () => {
    const cuerpo = aFormData({ datos: con({ segundoNombre: '' }), foto: null, eliminarFoto: false }, 'modificar');
    expect(cuerpo.has('numeroDocumento')).toBe(false);
    expect(cuerpo.get('segundoNombre')).toBe('');
    expect(cuerpo.has('foto')).toBe(false);
    expect(cuerpo.has('eliminarFoto')).toBe(false);
  });

  it('al modificar, quitar la foto envía eliminarFoto=true', () => {
    const cuerpo = aFormData({ datos: valida, foto: null, eliminarFoto: true }, 'modificar');
    expect(cuerpo.get('eliminarFoto')).toBe('true');
  });

  it('llena el formulario desde la API con la fecha en dd-mmm-yyyy', () => {
    const datos = datosDesdePersona({
      ...valida,
      fechaNacimiento: '2003-03-05',
      segundoNombre: null,
      tieneFoto: false,
    });
    expect(datos.fechaNacimiento).toBe('05-mar-2003');
    expect(datos.segundoNombre).toBe('');
  });
});
