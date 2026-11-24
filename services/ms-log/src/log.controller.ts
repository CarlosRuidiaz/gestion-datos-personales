import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auditar, Publico, TipoTransaccion } from '@gdp/common';
import { ConsultaNlDto } from './consulta-nl.dto';
import { FiltrosLogDto } from './filtros-log.dto';
import { CABECERA_LLAVE, LlaveApiGuard } from './llave-api.guard';
import { PaginaLogRespuesta } from './log.respuesta';
import { LogService } from './log.service';

@ApiTags('log')
@Controller()
export class LogController {
  constructor(private readonly log: LogService) {}

  /**
   * Sin @Auditar a propósito: revisar el log no es una transacción sobre los datos personales
   * y la columna tipo no tiene un valor para ello.
   * Sin @Roles: la usan los dos roles de la aplicación.
   */
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulta el log con filtros por tipo, documento y rango de fechas, del más reciente al más antiguo' })
  @ApiResponse({ status: 200, type: PaginaLogRespuesta })
  @ApiResponse({ status: 400, description: 'Algún filtro no es válido' })
  @ApiResponse({ status: 401, description: 'Falta el token o ya venció' })
  consultar(@Query() filtros: FiltrosLogDto): Promise<PaginaLogRespuesta> {
    return this.log.consultar(filtros);
  }

  @Post('consulta-nl')
  @Publico()
  @UseGuards(LlaveApiGuard)
  @Auditar(TipoTransaccion.CONSULTA_NL)
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: CABECERA_LLAVE, required: true, description: 'Llave de API de n8n (N8N_LOG_API_KEY)' })
  @ApiOperation({ summary: 'Registra una consulta en lenguaje natural. Solo la usa n8n' })
  @ApiResponse({ status: 201, description: 'Consulta registrada en el log' })
  @ApiResponse({ status: 400, description: 'El cuerpo no es válido. Queda en el log como CONSULTA_NL con resultado ERROR' })
  @ApiResponse({ status: 401, description: 'Falta la llave de API o no es válida' })
  async registrarConsultaNl(@Body() consulta: ConsultaNlDto): Promise<{ mensaje: string }> {
    await this.log.registrarConsultaNl(consulta);
    return { mensaje: 'Consulta registrada en el log' };
  }
}
