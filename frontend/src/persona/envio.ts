import type { ErrorDeCampo } from '../api/cliente';
import { formatearFecha } from './fecha';
import { CAMPOS, type CampoConError, type DatosPersona, type EnvioPersona, type PersonaApi } from './tipos';
import type { ErroresPersona } from './validaciones';

/** Llena el formulario con una persona de la API (la fecha pasa de yyyy-mm-dd a dd-mmm-yyyy). */
export function datosDesdePersona(persona: PersonaApi): DatosPersona {
  return {
    tipoDocumento: persona.tipoDocumento,
    numeroDocumento: persona.numeroDocumento,
    primerNombre: persona.primerNombre,
    segundoNombre: persona.segundoNombre ?? '',
    apellidos: persona.apellidos,
    fechaNacimiento: formatearFecha(persona.fechaNacimiento),
    genero: persona.genero,
    correo: persona.correo,
    celular: persona.celular,
  };
}

/**
 * Cuerpo multipart para `POST /api/crear/personas` y `PUT /api/modificar/personas/{documento}`.
 * - Al modificar no se envía el número de documento (no se puede cambiar).
 * - El segundo nombre vacío se envía como texto vacío, que el servidor guarda como null.
 * - `eliminarFoto` solo se envía al modificar y cuando no hay una foto nueva.
 */
export function aFormData(envio: EnvioPersona, modo: 'crear' | 'modificar'): FormData {
  const formulario = new FormData();
  for (const [campo, valor] of Object.entries(envio.datos)) {
    if (modo === 'modificar' && campo === 'numeroDocumento') continue;
    formulario.append(campo, valor);
  }
  if (envio.foto) {
    formulario.append('foto', envio.foto);
  } else if (modo === 'modificar' && envio.eliminarFoto) {
    formulario.append('eliminarFoto', 'true');
  }
  return formulario;
}

/**
 * Separa los errores de un 400 de la API: los de campos del formulario van junto a su campo
 * y el resto (si llegara alguno) se muestra arriba como mensaje general.
 */
export function separarErroresDeApi(errores: ErrorDeCampo[]): { porCampo: ErroresPersona; otros: string[] } {
  const porCampo: ErroresPersona = {};
  const otros: string[] = [];
  for (const { campo, mensaje } of errores) {
    if ((CAMPOS as string[]).includes(campo)) {
      porCampo[campo as CampoConError] ??= mensaje;
    } else {
      otros.push(mensaje);
    }
  }
  return { porCampo, otros };
}

/** Lee un archivo como `data:...;base64,...`, para mostrar la foto recién guardada sin pedirla otra vez. */
export function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(archivo);
  });
}
