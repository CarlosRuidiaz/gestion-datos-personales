/**
 * Valores del dominio y forma de una persona en la API. Repiten los de `libs/common`
 * (constantes.ts y persona.respuesta.ts): el frontend no comparte código con los servicios.
 */

export const TIPOS_DOCUMENTO = ['Tarjeta de identidad', 'Cédula'] as const;
export const GENEROS = ['Masculino', 'Femenino', 'No binario', 'Prefiero no reportar'] as const;

export const LONGITUD = {
  numeroDocumento: 10,
  nombre: 30,
  apellidos: 60,
  correo: 100,
  celular: 10,
} as const;

export const FOTO_MAX_BYTES = 2 * 1024 * 1024;
export const FOTO_TIPOS = ['image/jpeg', 'image/png'] as const;

/** Persona como la devuelven los servicios (`PersonaRespuesta`). */
export interface PersonaApi {
  numeroDocumento: string;
  tipoDocumento: string;
  primerNombre: string;
  segundoNombre: string | null;
  apellidos: string;
  /** Siempre yyyy-mm-dd. */
  fechaNacimiento: string;
  genero: string;
  correo: string;
  celular: string;
  tieneFoto: boolean;
  /** Solo donde se pide: `data:image/...;base64,...` o null. */
  foto?: string | null;
}

/** Valores del formulario, tal como los escribe el usuario. */
export interface DatosPersona {
  tipoDocumento: string;
  numeroDocumento: string;
  primerNombre: string;
  segundoNombre: string;
  apellidos: string;
  /** Lo que hay en el campo: dd-mmm-yyyy escrito o elegido en el calendario. */
  fechaNacimiento: string;
  genero: string;
  correo: string;
  celular: string;
}

export type CampoPersona = keyof DatosPersona;
/** Campos que pueden tener un mensaje de error, incluida la foto. */
export type CampoConError = CampoPersona | 'foto';

export const CAMPOS: CampoConError[] = [
  'tipoDocumento',
  'numeroDocumento',
  'primerNombre',
  'segundoNombre',
  'apellidos',
  'fechaNacimiento',
  'genero',
  'foto',
  'correo',
  'celular',
];

export const PERSONA_VACIA: DatosPersona = {
  tipoDocumento: '',
  numeroDocumento: '',
  primerNombre: '',
  segundoNombre: '',
  apellidos: '',
  fechaNacimiento: '',
  genero: '',
  correo: '',
  celular: '',
};

/** Lo que el formulario entrega al guardar: datos ya recortados y la fecha como yyyy-mm-dd. */
export interface EnvioPersona {
  datos: DatosPersona;
  foto: File | null;
  eliminarFoto: boolean;
}
