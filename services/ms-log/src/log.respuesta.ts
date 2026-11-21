import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LogTransaccion, ResultadoTransaccion, TipoTransaccion } from '@gdp/common';

/** Un registro del log tal como lo devuelve GET /api/log. */
export class RegistroLogRespuesta {
  @ApiProperty({ example: '42', description: 'BIGSERIAL: va como texto para no perder precisión' })
  id: string;

  @ApiProperty({ example: '2026-11-21T15:04:05.123Z', description: 'Fecha y hora en ISO 8601 (UTC)' })
  fechaHora: string;

  @ApiProperty({ enum: TipoTransaccion })
  tipo: string;

  @ApiPropertyOptional({ example: '1043123456', nullable: true, description: 'Nulo en las consultas en lenguaje natural' })
  numeroDocumento: string | null;

  @ApiProperty({ example: 'admin.prueba' })
  usuario: string;

  @ApiProperty({ enum: ResultadoTransaccion })
  resultado: string;

  @ApiPropertyOptional({ nullable: true, description: 'Valores anteriores y nuevos, o el motivo del error' })
  detalle: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, description: 'Solo en consultas en lenguaje natural' })
  pregunta: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Solo en consultas en lenguaje natural' })
  respuesta: string | null;
}

/** Página de resultados de GET /api/log. */
export class PaginaLogRespuesta {
  @ApiProperty({ example: 57, description: 'Total de registros que cumplen los filtros' })
  total: number;

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 20 })
  tamano: number;

  @ApiProperty({ type: [RegistroLogRespuesta], description: 'Del más reciente al más antiguo' })
  registros: RegistroLogRespuesta[];
}

export function aRegistroLogRespuesta(registro: LogTransaccion): RegistroLogRespuesta {
  return {
    id: registro.id,
    fechaHora: registro.fechaHora.toISOString(),
    tipo: registro.tipo,
    numeroDocumento: registro.numeroDocumento,
    usuario: registro.usuario,
    resultado: registro.resultado,
    detalle: registro.detalle,
    pregunta: registro.pregunta,
    respuesta: registro.respuesta,
  };
}
