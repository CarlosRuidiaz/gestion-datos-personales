/**
 * Filtros y respuesta de GET /api/log (contrato en services/ms-log/README.md y sección 7 de CONTEXTO.md).
 */

export const TIPOS_LOG = ['CREAR', 'MODIFICAR', 'CONSULTAR', 'BORRAR', 'CONSULTA_NL'] as const;
export type TipoLog = (typeof TIPOS_LOG)[number];

export const NOMBRE_TIPO: Record<TipoLog, string> = {
  CREAR: 'Crear',
  MODIFICAR: 'Modificar',
  CONSULTAR: 'Consultar',
  BORRAR: 'Borrar',
  CONSULTA_NL: 'Consulta en lenguaje natural',
};

export const TAMANO_PAGINA = 20;

/** Filtros como los escribe el usuario. Las fechas vienen del calendario (yyyy-mm-dd). */
export interface FiltrosLog {
  tipo: string;
  documento: string;
  desde: string;
  hasta: string;
}

export const SIN_FILTROS: FiltrosLog = { tipo: '', documento: '', desde: '', hasta: '' };

export interface RegistroLog {
  id: string;
  /** ISO 8601 en UTC. */
  fechaHora: string;
  tipo: string;
  numeroDocumento: string | null;
  usuario: string;
  resultado: 'EXITO' | 'ERROR' | string;
  detalle: Record<string, unknown> | null;
  pregunta: string | null;
  respuesta: string | null;
}

export interface PaginaLog {
  total: number;
  pagina: number;
  tamano: number;
  registros: RegistroLog[];
}

export type ErroresFiltros = Partial<Record<keyof FiltrosLog, string>>;

const DOCUMENTO = /^[0-9]{1,10}$/;

/** Revisa los filtros antes de pedir el log, con los mismos mensajes del servidor. */
export function validarFiltros(filtros: FiltrosLog): ErroresFiltros {
  const errores: ErroresFiltros = {};
  const documento = filtros.documento.trim();
  if (documento && !DOCUMENTO.test(documento)) {
    errores.documento = 'El número de documento debe tener solo dígitos y máximo 10 caracteres';
  }
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    errores.hasta = 'La fecha final no puede ser anterior a la inicial';
  }
  return errores;
}

/** Ruta de GET /api/log con los filtros que tienen valor, la página y el tamaño. */
export function rutaDelLog(filtros: FiltrosLog, pagina: number, tamano = TAMANO_PAGINA): string {
  const parametros = new URLSearchParams();
  for (const campo of ['tipo', 'documento', 'desde', 'hasta'] as const) {
    const valor = filtros[campo].trim();
    if (valor) parametros.set(campo, valor);
  }
  parametros.set('pagina', String(pagina));
  parametros.set('tamano', String(tamano));
  return `/api/log?${parametros.toString()}`;
}

/** Número de páginas para un total de registros (al menos 1, para mostrar «Página 1 de 1»). */
export function totalDePaginas(total: number, tamano: number): number {
  return Math.max(1, Math.ceil(total / tamano));
}
