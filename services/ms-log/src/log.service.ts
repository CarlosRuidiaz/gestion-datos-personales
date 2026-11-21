import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AuditoriaService,
  errorDeCampos,
  LogTransaccion,
  ResultadoTransaccion,
  TipoTransaccion,
} from '@gdp/common';
import { ConsultaNlDto, USUARIO_N8N } from './consulta-nl.dto';
import { FiltrosLogDto, TAMANO_POR_DEFECTO } from './filtros-log.dto';
import { aRegistroLogRespuesta, PaginaLogRespuesta } from './log.respuesta';

/** Zona horaria con la que se interpretan los días de los filtros (la misma de los contenedores). */
const ZONA_HORARIA = process.env.TZ || 'America/Bogota';

@Injectable()
export class LogService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Consulta del log con filtros por tipo, documento y rango de fechas (RF-07, CP-06).
   * Consulta parametrizada; cada filtro usa su índice (idx_log_tipo, idx_log_numero_documento, idx_log_fecha_hora).
   */
  async consultar(filtros: FiltrosLogDto): Promise<PaginaLogRespuesta> {
    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      throw errorDeCampos([{ campo: 'hasta', mensaje: 'La fecha «hasta» no puede ser anterior a la fecha «desde»' }]);
    }
    const pagina = filtros.pagina ?? 1;
    const tamano = filtros.tamano ?? TAMANO_POR_DEFECTO;

    const consulta = this.dataSource.getRepository(LogTransaccion).createQueryBuilder('log');
    if (filtros.tipo) {
      consulta.andWhere('log.tipo = :tipo', { tipo: filtros.tipo });
    }
    if (filtros.documento) {
      consulta.andWhere('log.numeroDocumento = :documento', { documento: filtros.documento });
    }
    // Los días se convierten a instantes en la zona horaria del servicio: así «hasta»
    // incluye todo ese día y no depende de la zona horaria de la sesión de PostgreSQL.
    if (filtros.desde) {
      consulta.andWhere('log.fechaHora >= (CAST(CAST(:desde AS date) AS timestamp) AT TIME ZONE :zona)', {
        desde: filtros.desde,
        zona: ZONA_HORARIA,
      });
    }
    if (filtros.hasta) {
      consulta.andWhere('log.fechaHora < (CAST(CAST(:hasta AS date) + 1 AS timestamp) AT TIME ZONE :zona)', {
        hasta: filtros.hasta,
        zona: ZONA_HORARIA,
      });
    }

    const [registros, total] = await consulta
      .orderBy('log.fechaHora', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip((pagina - 1) * tamano)
      .take(tamano)
      .getManyAndCount();

    return { total, pagina, tamano, registros: registros.map(aRegistroLogRespuesta) };
  }

  /**
   * Registra una consulta en lenguaje natural que envía n8n (sección 7.2 del diseño).
   * Usa registrar() y no registrarAparte(): si el insert falla, n8n debe recibir un error y no un 201.
   */
  async registrarConsultaNl(consulta: ConsultaNlDto): Promise<void> {
    await this.auditoria.registrar(this.dataSource.manager, {
      tipo: TipoTransaccion.CONSULTA_NL,
      numeroDocumento: null,
      usuario: USUARIO_N8N,
      resultado: consulta.resultado as ResultadoTransaccion,
      detalle: consulta.detalle ?? null,
      pregunta: consulta.pregunta,
      respuesta: consulta.respuesta ?? null,
    });
  }
}
