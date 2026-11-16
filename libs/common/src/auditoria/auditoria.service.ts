import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ResultadoTransaccion, TipoTransaccion } from '../constantes';

export interface RegistroDeLog {
  tipo: TipoTransaccion;
  /** Documento afectado. Null en las consultas en lenguaje natural. */
  numeroDocumento?: string | null;
  /** Usuario autenticado (UsuarioAutenticado.nombre). */
  usuario: string;
  resultado: ResultadoTransaccion;
  /** Valores anteriores y nuevos, o el motivo del error. Nunca la foto. */
  detalle?: Record<string, unknown> | null;
  /** Solo en consultas en lenguaje natural. */
  pregunta?: string | null;
  respuesta?: string | null;
}

/** Sentencia propia y sin RETURNING: quien inserta en el log no puede leerlo (database/README.md). */
const INSERTAR = `
  INSERT INTO log_transaccion (tipo, numero_documento, usuario, resultado, detalle, pregunta, respuesta)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
`;

/**
 * Escribe en el log de auditoría (DD-02 del diseño).
 *
 * Operación exitosa: se registra DENTRO de la transacción de la operación, con el mismo
 * EntityManager, para que sea imposible guardar la operación sin su registro:
 *
 *   await this.dataSource.transaction(async (manager) => {
 *     await manager.save(persona);
 *     await this.auditoria.registrar(manager, { tipo, numeroDocumento, usuario, resultado: EXITO, detalle });
 *   });
 *
 * Petición rechazada (400, 403, 404, 409): el servicio solo lanza la excepción de Nest.
 * El registro de error lo escribe FiltroAuditoria, fuera de la transacción que se deshizo.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Inserta un registro usando el EntityManager de la transacción en curso. */
  async registrar(manager: EntityManager, registro: RegistroDeLog): Promise<void> {
    await manager.query(INSERTAR, [
      registro.tipo,
      registro.numeroDocumento ?? null,
      registro.usuario.slice(0, 100),
      registro.resultado,
      registro.detalle ? JSON.stringify(registro.detalle) : null,
      registro.pregunta ?? null,
      registro.respuesta ?? null,
    ]);
  }

  /**
   * Inserta un registro fuera de cualquier transacción. Lo usan el filtro de auditoría
   * y ms-log (consultas en lenguaje natural). Si el log falla, no tapa el error original.
   */
  async registrarAparte(registro: RegistroDeLog): Promise<void> {
    try {
      await this.registrar(this.dataSource.manager, registro);
    } catch (error) {
      this.logger.error(`No se pudo escribir en el log: ${(error as Error).message}`);
    }
  }
}
