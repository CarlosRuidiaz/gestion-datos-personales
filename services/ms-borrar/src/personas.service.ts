import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  aPersonaRespuesta,
  AuditoriaService,
  AvisoIndexacionService,
  CONTEXTO_PREVIO_BORRAR,
  datosParaLog,
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
    private readonly indexacion: AvisoIndexacionService,
  ) {}

  /**
   * Búsqueda previa al borrado, para que el usuario revise los datos y confirme (CU-06).
   * La hace este mismo servicio para no depender de ms-consultar, y queda en el log
   * con el tipo CONSULTAR (sección 5.2 del diseño).
   */
  async buscar(documento: string, usuario: UsuarioAutenticado): Promise<PersonaRespuesta> {
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
        detalle: { contexto: CONTEXTO_PREVIO_BORRAR },
      });
      return aPersonaRespuesta(persona, { incluirFoto: true });
    });
  }

  /**
   * Borra la persona y registra el log en la misma transacción. El detalle guarda los
   * datos que tenía (sin la foto), así su historial queda completo (CP-05).
   */
  async borrar(documento: string, usuario: UsuarioAutenticado): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Sin SELECT ... FOR UPDATE: exige permiso de UPDATE y usr_borrar solo tiene SELECT y
      // DELETE (sección 6.3 del diseño). El DELETE ya bloquea la fila; si otro borrado
      // simultáneo ganó, no afecta ninguna fila y se responde 404.
      const persona = await manager.findOneBy(Persona, { numeroDocumento: documento });
      if (!persona) {
        throw new NotFoundException(MENSAJE_NO_ENCONTRADA);
      }
      const resultado = await manager.delete(Persona, { numeroDocumento: documento });
      if (!resultado.affected) {
        throw new NotFoundException(MENSAJE_NO_ENCONTRADA);
      }
      await this.auditoria.registrar(manager, {
        tipo: TipoTransaccion.BORRAR,
        numeroDocumento: documento,
        usuario: usuario.nombre,
        resultado: ResultadoTransaccion.EXITO,
        detalle: { anterior: datosParaLog(persona), teniaFoto: persona.foto !== null },
      });
    });
    // Ya confirmado el borrado: n8n quita el vector de la persona. No se espera la respuesta.
    void this.indexacion.avisar(documento, TipoTransaccion.BORRAR);
  }

  /**
   * Borra todas las personas (T30), una por una con borrar(): cada una con su BORRAR en el log, con
   * los datos que tenía, y su aviso a n8n. El log no se toca. Devuelve cuántas se borraron.
   */
  async borrarTodas(usuario: UsuarioAutenticado): Promise<{ borradas: number }> {
    const personas = await this.dataSource
      .getRepository(Persona)
      .find({ select: { numeroDocumento: true }, order: { numeroDocumento: 'ASC' } });
    let borradas = 0;
    for (const { numeroDocumento } of personas) {
      try {
        await this.borrar(numeroDocumento, usuario);
        borradas++;
      } catch (error) {
        // Otro usuario la borró al mismo tiempo: ya no está, que es lo que se pedía.
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return { borradas };
  }
}
