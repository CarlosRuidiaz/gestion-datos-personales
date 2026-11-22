import { Rol } from '../auth/roles';

export type EstadoOpcion = 'disponible' | 'no-disponible' | 'sin-configurar';

export type ClaveOpcion = 'crear' | 'modificar' | 'consultar' | 'consulta-nl' | 'borrar' | 'log';

export interface OpcionDelMenu {
  clave: ClaveOpcion;
  titulo: string;
  descripcion: string;
  /** Ruta interna, o URL externa si `externa` es true (el chat de n8n). */
  destino: string;
  externa: boolean;
  estado: EstadoOpcion;
}

interface DefinicionDeOpcion {
  clave: ClaveOpcion;
  titulo: string;
  descripcion: string;
  ruta: string;
  externa: boolean;
  roles: readonly Rol[];
}

const AMBOS: readonly Rol[] = [Rol.ADMINISTRADOR, Rol.CONSULTOR];
const SOLO_ADMINISTRADOR: readonly Rol[] = [Rol.ADMINISTRADOR];

/** Las seis opciones del menú principal, en el orden del diseño (sección 1.2). */
export const OPCIONES: readonly DefinicionDeOpcion[] = [
  {
    clave: 'crear',
    titulo: 'Crear personas',
    descripcion: 'Registrar una persona nueva',
    ruta: '/crear',
    externa: false,
    roles: SOLO_ADMINISTRADOR,
  },
  {
    clave: 'modificar',
    titulo: 'Modificar datos personales',
    descripcion: 'Buscar por documento y actualizar sus datos',
    ruta: '/modificar',
    externa: false,
    roles: SOLO_ADMINISTRADOR,
  },
  {
    clave: 'consultar',
    titulo: 'Consultar datos personales',
    descripcion: 'Ver la ficha completa de una persona',
    ruta: '/consultar',
    externa: false,
    roles: AMBOS,
  },
  {
    clave: 'consulta-nl',
    titulo: 'Consulta en lenguaje natural',
    descripcion: 'Preguntar sobre los datos en el chat de n8n',
    ruta: '',
    externa: true,
    roles: AMBOS,
  },
  {
    clave: 'borrar',
    titulo: 'Borrar personas',
    descripcion: 'Buscar por documento, revisar y confirmar el borrado',
    ruta: '/borrar',
    externa: false,
    roles: SOLO_ADMINISTRADOR,
  },
  {
    clave: 'log',
    titulo: 'Consultar log',
    descripcion: 'Revisar las transacciones con filtros',
    ruta: '/log',
    externa: false,
    roles: AMBOS,
  },
];

export interface EstadoDeServicios {
  /** true si GET /api/consultar/health respondió 200 (DD-04). */
  consultarDisponible: boolean;
  /** URL del chat de n8n; vacía si todavía no está configurada. */
  chatUrl: string;
}

/**
 * Opciones que ve el usuario: solo las de su rol (sección 8.2 del diseño). Consultar aparece
 * como no disponible cuando su servicio está apagado, y el chat como sin configurar si no hay URL.
 */
export function opcionesDelMenu(roles: readonly Rol[], servicios: EstadoDeServicios): OpcionDelMenu[] {
  return OPCIONES.filter((o) => o.roles.some((r) => roles.includes(r))).map((o) => {
    let estado: EstadoOpcion = 'disponible';
    if (o.clave === 'consultar' && !servicios.consultarDisponible) estado = 'no-disponible';
    if (o.clave === 'consulta-nl' && !servicios.chatUrl) estado = 'sin-configurar';
    return {
      clave: o.clave,
      titulo: o.titulo,
      descripcion: o.descripcion,
      destino: o.externa ? servicios.chatUrl : o.ruta,
      externa: o.externa,
      estado,
    };
  });
}

/** Roles que pueden entrar a una ruta interna, para proteger las páginas. */
export function rolesDeLaRuta(ruta: string): readonly Rol[] {
  return OPCIONES.find((o) => !o.externa && o.ruta === ruta)?.roles ?? [];
}
