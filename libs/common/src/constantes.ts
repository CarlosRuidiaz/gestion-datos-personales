/** Valores del dominio. Coinciden con el enunciado y con las restricciones de database/init.sql. */

export const TIPOS_DOCUMENTO = ['Tarjeta de identidad', 'Cédula'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const GENEROS = ['Masculino', 'Femenino', 'No binario', 'Prefiero no reportar'] as const;
export type Genero = (typeof GENEROS)[number];

/** Tipos de transacción del log (columna log_transaccion.tipo). */
export enum TipoTransaccion {
  CREAR = 'CREAR',
  MODIFICAR = 'MODIFICAR',
  CONSULTAR = 'CONSULTAR',
  BORRAR = 'BORRAR',
  CONSULTA_NL = 'CONSULTA_NL',
}

export enum ResultadoTransaccion {
  EXITO = 'EXITO',
  ERROR = 'ERROR',
}

/** Roles de realm definidos en keycloak/realm.json. */
export enum Rol {
  ADMINISTRADOR = 'administrador',
  CONSULTOR = 'consultor',
}

export const FOTO_MAX_BYTES = 2 * 1024 * 1024;
export const FOTO_TIPOS = ['image/jpeg', 'image/png'] as const;
export type FotoTipo = (typeof FOTO_TIPOS)[number];

export const LONGITUD = {
  numeroDocumento: 10,
  nombre: 30,
  apellidos: 60,
  correo: 100,
  celular: 10,
} as const;
