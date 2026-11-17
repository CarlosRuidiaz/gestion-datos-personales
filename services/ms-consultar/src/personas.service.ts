import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  aPersonaRespuesta,
  AuditoriaService,
  Persona,
  PersonaRespuesta,
  ResultadoTransaccion,
  TipoTransaccion,
  UsuarioAutenticado,
} from '@gdp/common';

const MENSAJE_NO_ENCONTRADA = 'No hay una persona registrada con ese número de documento';

@Injectable()
export class PersonasService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Busca la persona por documento y devuelve la ficha completa con la foto (RF-04).
   * La consulta y su registro de log van en la misma transacción (DD-02).
   * El 404 lo deja en el log el filtro de auditoría.
   */
  async consultar(documento: string, usuario: UsuarioAutenticado): Promise<PersonaRespuesta> {
    return this.dataSource.transaction(async (manager) => {
      const persona = await manager.findOneBy(Persona, { numeroDocumento: documento });
      if (!persona) {
        throw new NotFoundException(MENSAJE_NO_ENCONTRADA);
      }
      await this.auditoria.registrar(manager, {
        tipo: TipoTransaccion.CONSULTAR,
        numeroDocumento: documento,
        usuario: usuario.nombre,
        resultado: ResultadoTransaccion.EXITO,
      });
      return aPersonaRespuesta(persona, { incluirFoto: true });
    });
  }

  /** true si la base de datos responde. Lo usa el endpoint health. */
  async baseDeDatosDisponible(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
