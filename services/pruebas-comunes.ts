/**
 * Piezas que comparten las pruebas unitarias de los microservicios: una base de datos falsa que
 * lleva la cuenta de lo que pasó y en qué orden, y una persona de ejemplo. No es código de producción.
 */
import { Persona, UsuarioAutenticado } from '@gdp/common';

export const ADMIN: UsuarioAutenticado = { nombre: 'admin.prueba', roles: ['administrador'], id: 'id-admin' };
export const CONSULTOR: UsuarioAutenticado = { nombre: 'consultor.prueba', roles: ['consultor'], id: 'id-consultor' };

/** Una persona completa y válida, sin foto. `sobre` cambia los campos que se necesiten. */
export function personaEjemplo(sobre: Partial<Persona> = {}): Persona {
  return Object.assign(new Persona(), {
    numeroDocumento: '1043123456',
    tipoDocumento: 'Cédula',
    primerNombre: 'Pedro',
    segundoNombre: 'Andrés',
    apellidos: 'Pérez Gómez',
    fechaNacimiento: '2003-03-05',
    genero: 'Masculino',
    correo: 'pedro.perez@example.com',
    celular: '3001234567',
    foto: null,
    fotoTipo: null,
    fechaCreacion: new Date('2026-11-20T10:00:00Z'),
    fechaActualizacion: new Date('2026-11-20T10:00:00Z'),
    ...sobre,
  });
}

/**
 * Entorno falso de un servicio. `dataSource.transaction` ejecuta el trabajo con el mismo `manager` y
 * anota «commit» si termina bien o «rollback» si lanza un error. `auditoria.registrar` anota «log» y
 * `indexacion.avisar` anota «aviso»: `eventos` muestra el orden real de lo que hizo el servicio.
 */
export function crearEntorno() {
  const eventos: string[] = [];

  const manager = {
    existsBy: jest.fn(),
    insert: jest.fn(),
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };

  // El manager «suelto» del DataSource es distinto del de la transacción a propósito: si un servicio
  // escribiera el log con él, quedaría fuera de la transacción y las pruebas lo detectan.
  const dataSource = {
    manager: { query: jest.fn() },
    query: jest.fn(),
    getRepository: jest.fn(),
    transaction: jest.fn(async (trabajo: (m: typeof manager) => Promise<unknown>) => {
      try {
        const resultado = await trabajo(manager);
        eventos.push('commit');
        return resultado;
      } catch (error) {
        eventos.push('rollback');
        throw error;
      }
    }),
  };

  const auditoria = {
    registrar: jest.fn(async (_manager: unknown, _registro: unknown) => {
      eventos.push('log');
    }),
    registrarAparte: jest.fn(),
  };

  const indexacion = {
    avisar: jest.fn(async (_documento: string, _operacion: string) => {
      eventos.push('aviso');
    }),
  };

  /** El registro que recibió `auditoria.registrar` en su llamada número `n` (desde 0). */
  const registroDeLog = (n = 0) => auditoria.registrar.mock.calls[n][1] as Record<string, any>;

  return { eventos, manager, dataSource, auditoria, indexacion, registroDeLog };
}
