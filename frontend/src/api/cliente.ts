import { keycloak, tokenVigente } from '../auth/sesion';

/** Error de un campo, como lo devuelven los microservicios en un 400. */
export interface ErrorDeCampo {
  campo: string;
  mensaje: string;
}

/** Respuesta de error de la API: 400 (con `errores`), 403, 404, 409, 500... */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly errores: ErrorDeCampo[] = [],
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

const MENSAJES: Record<number, string> = {
  403: 'Tu rol no tiene permiso para esta operación',
  404: 'No se encontró lo que buscabas',
  502: 'El servicio no está disponible en este momento',
  503: 'El servicio no está disponible en este momento',
};

/**
 * Llama a la API por el gateway con el token de la sesión. Devuelve el cuerpo JSON
 * (o `undefined` si la respuesta no tiene cuerpo, como el 204 de borrar) y lanza
 * `ErrorApi` si la respuesta no es exitosa. Con un 401 vuelve al login. Si el servicio está apagado
 * (Traefik responde 404 o 502 sin cuerpo JSON), lanza `ErrorApi` con estado 503.
 *
 *   const persona = await pedirApi<Persona>('/api/consultar/personas/1043123456');
 *   await pedirApi('/api/crear/personas', { method: 'POST', body: formData });
 */
export async function pedirApi<T = unknown>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const token = await tokenVigente();
  const cabeceras = new Headers(opciones.headers);
  cabeceras.set('Authorization', `Bearer ${token}`);
  if (opciones.body && !(opciones.body instanceof FormData) && !cabeceras.has('Content-Type')) {
    cabeceras.set('Content-Type', 'application/json');
  }

  const respuesta = await fetch(ruta, { ...opciones, headers: cabeceras });
  if (respuesta.status === 401) {
    await keycloak.login();
    throw new ErrorApi(401, 'La sesión venció');
  }

  const texto = await respuesta.text();
  let cuerpo: unknown;
  try {
    cuerpo = texto ? JSON.parse(texto) : undefined;
  } catch {
    cuerpo = undefined; // Por ejemplo, la página de error de Traefik cuando un servicio está apagado.
  }
  if (!respuesta.ok) {
    // Un 404 o 502 sin cuerpo JSON no viene del microservicio sino de Traefik: el servicio está
    // apagado. Se informa como 503, para no confundirlo con «no hay una persona con ese documento».
    if (cuerpo === undefined && (respuesta.status === 404 || respuesta.status === 502)) {
      throw new ErrorApi(503, MENSAJES[503]);
    }
    const datos = (cuerpo ?? {}) as { message?: unknown; errores?: ErrorDeCampo[] };
    const mensaje =
      typeof datos.message === 'string'
        ? datos.message
        : (MENSAJES[respuesta.status] ?? `Error ${respuesta.status}`);
    throw new ErrorApi(respuesta.status, mensaje, datos.errores ?? []);
  }
  return cuerpo as T;
}
