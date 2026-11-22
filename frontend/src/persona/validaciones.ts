import { hoyIso, parsearFecha } from './fecha';
import {
  FOTO_MAX_BYTES,
  FOTO_TIPOS,
  GENEROS,
  LONGITUD,
  TIPOS_DOCUMENTO,
  type CampoConError,
  type DatosPersona,
} from './tipos';

/**
 * Validaciones del formulario de persona (sección 3.3 del diseño). Avisan al usuario antes de enviar;
 * la regla de verdad la aplica cada microservicio. Los mensajes son los mismos de `libs/common`,
 * así el usuario lee lo mismo venga el error del navegador o del servidor.
 */

export type ErroresPersona = Partial<Record<CampoConError, string>>;

const TIENE_NUMEROS = /[0-9]/;
const SOLO_DIGITOS_DOCUMENTO = /^[0-9]{1,10}$/;
const CELULAR = /^[0-9]{10}$/;
// Misma regla que la restricción persona_correo_chk de database/init.sql.
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const MENSAJE_FECHA =
  'La fecha de nacimiento debe elegirse en el calendario o escribirse como dd-mmm-yyyy (por ejemplo, 05-mar-2001)';

function validarNombre(valor: string, etiqueta: string, maximo: number, obligatorio: boolean, plural = false): string | undefined {
  const texto = valor.trim();
  if (!texto) return obligatorio ? `${etiqueta} ${plural ? 'son obligatorios' : 'es obligatorio'}` : undefined;
  if (texto.length > maximo) return `${etiqueta} no ${plural ? 'pueden' : 'puede'} tener más de ${maximo} caracteres`;
  if (TIENE_NUMEROS.test(texto)) return `${etiqueta} no ${plural ? 'pueden' : 'puede'} contener números`;
  return undefined;
}

/** Valida un campo del formulario. Devuelve el mensaje de error o undefined si está bien. */
export function validarCampo(campo: keyof DatosPersona, datos: DatosPersona, hoy: string = hoyIso()): string | undefined {
  const valor = datos[campo].trim();
  switch (campo) {
    case 'tipoDocumento':
      if (!valor) return 'El tipo de documento es obligatorio';
      return (TIPOS_DOCUMENTO as readonly string[]).includes(valor)
        ? undefined
        : 'El tipo de documento debe ser Tarjeta de identidad o Cédula';
    case 'numeroDocumento':
      if (!valor) return 'El número de documento es obligatorio';
      return SOLO_DIGITOS_DOCUMENTO.test(valor)
        ? undefined
        : 'El número de documento debe tener solo dígitos y máximo 10 caracteres';
    case 'primerNombre':
      return validarNombre(valor, 'El primer nombre', LONGITUD.nombre, true);
    case 'segundoNombre':
      return validarNombre(valor, 'El segundo nombre', LONGITUD.nombre, false);
    case 'apellidos':
      return validarNombre(valor, 'Los apellidos', LONGITUD.apellidos, true, true);
    case 'fechaNacimiento': {
      if (!valor) return 'La fecha de nacimiento es obligatoria';
      const iso = parsearFecha(valor);
      if (!iso) return MENSAJE_FECHA;
      return iso > hoy ? 'La fecha de nacimiento no puede ser futura' : undefined;
    }
    case 'genero':
      if (!valor) return 'El género es obligatorio';
      return (GENEROS as readonly string[]).includes(valor)
        ? undefined
        : 'El género debe ser Masculino, Femenino, No binario o Prefiero no reportar';
    case 'correo':
      if (!valor) return 'El correo electrónico es obligatorio';
      if (valor.length > LONGITUD.correo) return 'El correo electrónico no puede tener más de 100 caracteres';
      return CORREO.test(valor) ? undefined : 'El correo electrónico no tiene un formato válido';
    case 'celular':
      if (!valor) return 'El celular es obligatorio';
      return CELULAR.test(valor) ? undefined : 'El celular debe tener exactamente 10 dígitos';
  }
}

/**
 * Valida el archivo de la foto: JPG o PNG de máximo 2 MB. El servidor además revisa
 * los primeros bytes del archivo; aquí basta con el tipo que informa el navegador.
 */
export function validarFoto(foto: File | null): string | undefined {
  if (!foto) return undefined;
  if (!(FOTO_TIPOS as readonly string[]).includes(foto.type)) return 'La foto debe ser una imagen JPG o PNG';
  if (foto.size > FOTO_MAX_BYTES) return 'La foto no puede superar los 2 MB';
  return undefined;
}

/**
 * Valida todo el formulario. En el modo modificar el número de documento no se valida,
 * porque viene de la búsqueda y no se puede cambiar.
 */
export function validarPersona(
  datos: DatosPersona,
  foto: File | null,
  modo: 'crear' | 'modificar' = 'crear',
  hoy: string = hoyIso(),
): ErroresPersona {
  const errores: ErroresPersona = {};
  for (const campo of Object.keys(datos) as (keyof DatosPersona)[]) {
    if (modo === 'modificar' && campo === 'numeroDocumento') continue;
    const mensaje = validarCampo(campo, datos, hoy);
    if (mensaje) errores[campo] = mensaje;
  }
  const errorFoto = validarFoto(foto);
  if (errorFoto) errores.foto = errorFoto;
  return errores;
}

/** Datos listos para enviar: recortados y con la fecha como yyyy-mm-dd. Llamar solo si validarPersona no dio errores. */
export function normalizarPersona(datos: DatosPersona): DatosPersona {
  const recortados = Object.fromEntries(
    Object.entries(datos).map(([campo, valor]) => [campo, valor.trim()]),
  ) as unknown as DatosPersona;
  return { ...recortados, fechaNacimiento: parsearFecha(recortados.fechaNacimiento) ?? recortados.fechaNacimiento };
}
