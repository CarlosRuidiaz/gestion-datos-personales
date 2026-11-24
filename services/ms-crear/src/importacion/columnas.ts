/**
 * Reconoce las columnas y normaliza los valores de un archivo de personas. La validación de
 * verdad la hace después CrearPersonaDto, la misma del formulario; aquí solo se convierten formas
 * comunes de escribir lo mismo («CC» → «Cédula», «16/03/1965» → «1965-03-16», «1.043.123.456» → «1043123456»).
 */

/** Minúsculas, sin tildes y sin nada que no sea letra o número: «No. Identificación» → «noidentificacion». */
export function normalizar(texto: string): string {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export type Campo =
  | 'tipoDocumento'
  | 'numeroDocumento'
  | 'primerNombre'
  | 'segundoNombre'
  | 'nombres'
  | 'apellidos'
  | 'primerApellido'
  | 'segundoApellido'
  | 'fechaNacimiento'
  | 'genero'
  | 'correo'
  | 'celular'
  | 'foto';

// Nombres de columna aceptados para cada campo, ya normalizados.
const SINONIMOS: Record<Campo, string[]> = {
  tipoDocumento: ['tipodocumento', 'tipodedocumento', 'tipodoc', 'tipo', 'tipoid', 'tipoidentificacion', 'tipodeidentificacion'],
  numeroDocumento: [
    'numerodocumento', 'numerodedocumento', 'nrodocumento', 'nodocumento', 'numdocumento', 'documento', 'doc', 'nrodoc',
    'identificacion', 'numeroidentificacion', 'numerodeidentificacion', 'noidentificacion', 'nroidentificacion', 'id', 'cedula',
  ],
  primerNombre: ['primernombre', 'nombre1', 'nombre', 'pnombre'],
  segundoNombre: ['segundonombre', 'nombre2', 'snombre', 'otronombre', 'otrosnombres'],
  nombres: ['nombres'],
  apellidos: ['apellidos', 'apellido'],
  primerApellido: ['primerapellido', 'apellido1', 'papellido'],
  segundoApellido: ['segundoapellido', 'apellido2', 'sapellido'],
  fechaNacimiento: ['fechanacimiento', 'fechadenacimiento', 'fechanac', 'fnacimiento', 'nacimiento', 'fecha'],
  genero: ['genero', 'sexo'],
  correo: ['correo', 'correoelectronico', 'email', 'mail', 'emailaddress'],
  celular: ['celular', 'cel', 'telefono', 'telefonocelular', 'numerocelular', 'movil', 'telefonomovil', 'tel'],
  foto: ['foto', 'fotografia', 'imagen', 'archivofoto', 'fotoperfil', 'archivo'],
};

export const NOMBRE_DEL_CAMPO: Record<Campo, string> = {
  tipoDocumento: 'Tipo de documento',
  numeroDocumento: 'Número de documento',
  primerNombre: 'Primer nombre',
  segundoNombre: 'Segundo nombre',
  nombres: 'Nombres (primer y segundo)',
  apellidos: 'Apellidos',
  primerApellido: 'Primer apellido',
  segundoApellido: 'Segundo apellido',
  fechaNacimiento: 'Fecha de nacimiento',
  genero: 'Género',
  correo: 'Correo electrónico',
  celular: 'Celular',
  foto: 'Foto (nombre del archivo)',
};

export type MapaDeColumnas = Partial<Record<Campo, number>>;

/** Asigna cada columna del encabezado a un campo. Devuelve el mapa y las columnas que no reconoció. */
export function mapearColumnas(encabezado: string[]): { mapa: MapaDeColumnas; ignoradas: string[] } {
  const mapa: MapaDeColumnas = {};
  const ignoradas: string[] = [];
  encabezado.forEach((nombre, indice) => {
    const clave = normalizar(nombre);
    const campo = (Object.keys(SINONIMOS) as Campo[]).find((c) => SINONIMOS[c].includes(clave));
    if (campo && mapa[campo] === undefined) mapa[campo] = indice;
    else if (clave) ignoradas.push(String(nombre).trim());
  });
  return { mapa, ignoradas };
}

/** Columnas que faltan para poder armar una persona. */
export function columnasFaltantes(mapa: MapaDeColumnas): string[] {
  const faltan: string[] = [];
  if (mapa.tipoDocumento === undefined) faltan.push('tipo de documento');
  if (mapa.numeroDocumento === undefined) faltan.push('número de documento');
  if (mapa.primerNombre === undefined && mapa.nombres === undefined) faltan.push('primer nombre');
  if (mapa.apellidos === undefined && mapa.primerApellido === undefined) faltan.push('apellidos');
  if (mapa.fechaNacimiento === undefined) faltan.push('fecha de nacimiento');
  if (mapa.genero === undefined) faltan.push('género');
  if (mapa.correo === undefined) faltan.push('correo');
  if (mapa.celular === undefined) faltan.push('celular');
  return faltan;
}

/** «CC», «C.C.», «cédula de ciudadanía» → «Cédula». Si no lo reconoce, devuelve el texto tal cual. */
export function tipoDocumento(valor: string): string {
  const v = normalizar(valor);
  if (['cc', 'cedula', 'cedulaciudadania', 'ceduladeciudadania', 'cedulaciudadana'].includes(v)) return 'Cédula';
  if (['ti', 'tarjeta', 'tarjetaidentidad', 'tarjetadeidentidad'].includes(v)) return 'Tarjeta de identidad';
  return valor;
}

/** «M», «hombre» → «Masculino»... Si no lo reconoce, devuelve el texto tal cual. */
export function genero(valor: string): string {
  const v = normalizar(valor);
  if (['m', 'masculino', 'hombre', 'h', 'masc'].includes(v)) return 'Masculino';
  if (['f', 'femenino', 'mujer', 'fem'].includes(v)) return 'Femenino';
  if (['nb', 'nobinario', 'nobinaria', 'nobinarie'].includes(v)) return 'No binario';
  if (['prefieronoreportar', 'prefieronodecir', 'noreporta', 'noreportado', 'nodefinido', 'na'].includes(v)) {
    return 'Prefiero no reportar';
  }
  return valor;
}

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

function fechaValida(anio: number, mes: number, dia: number): string | null {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Fecha como aaaa-mm-dd. Acepta dd-mmm-aaaa, dd/mm/aaaa (día primero, como en Colombia), aaaa-mm-dd y la
 * fecha de Excel (un número). Si no la reconoce, devuelve el texto tal cual y el DTO dará el error.
 */
export function fecha(valor: string): string {
  const v = String(valor).trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, '');
  let m: RegExpExecArray | null;
  let r: string | null = null;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(v))) r = fechaValida(+m[1], +m[2], +m[3]);
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v))) r = fechaValida(+m[3], +m[2], +m[1]);
  else if ((m = /^(\d{1,2})[-/. ]([a-záéíóú]{3,})\.?[-/. ](\d{4})$/i.exec(v))) {
    const mes = MESES[normalizar(m[2]).slice(0, 3)];
    r = mes ? fechaValida(+m[3], mes, +m[1]) : null;
  } else if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    const f = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86_400_000);
    r = fechaValida(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  return r ?? valor;
}

/** Quita puntos, comas, espacios y guiones: «1.043.123.456» → «1043123456». */
export function documento(valor: string): string {
  return String(valor).trim().replace(/[.,\s-]/g, '');
}

/** Quita espacios, guiones, paréntesis y el indicativo de Colombia: «+57 300 123 4567» → «3001234567». */
export function celular(valor: string): string {
  let v = String(valor).trim().replace(/[\s()\-.]/g, '');
  if (/^\+?57\d{10}$/.test(v)) v = v.replace(/^\+?57/, '');
  return v;
}

export interface FilaNormalizada {
  tipoDocumento: string;
  numeroDocumento: string;
  primerNombre: string;
  segundoNombre: string | null;
  apellidos: string;
  fechaNacimiento: string;
  genero: string;
  correo: string;
  celular: string;
  /** Nombre del archivo de la foto, si la fila lo trae. */
  foto: string;
}

/** Arma los datos de una persona a partir de una fila, con los valores normalizados. */
export function leerFila(fila: string[], mapa: MapaDeColumnas): FilaNormalizada {
  const celda = (campo: Campo) =>
    mapa[campo] === undefined ? '' : String(fila[mapa[campo]] ?? '').trim().replace(/\s+/g, ' ');
  let primerNombre = celda('primerNombre');
  let segundoNombre = celda('segundoNombre');
  if (!primerNombre && mapa.nombres !== undefined) {
    const [primero, ...resto] = celda('nombres').split(' ');
    primerNombre = primero ?? '';
    segundoNombre = segundoNombre || resto.join(' ');
  }
  const apellidos =
    celda('apellidos') || [celda('primerApellido'), celda('segundoApellido')].filter(Boolean).join(' ');
  return {
    tipoDocumento: tipoDocumento(celda('tipoDocumento')),
    numeroDocumento: documento(celda('numeroDocumento')),
    primerNombre,
    segundoNombre: segundoNombre || null,
    apellidos,
    fechaNacimiento: fecha(celda('fechaNacimiento')),
    genero: genero(celda('genero')),
    correo: celda('correo').toLowerCase(),
    celular: celular(celda('celular')),
    foto: celda('foto'),
  };
}
