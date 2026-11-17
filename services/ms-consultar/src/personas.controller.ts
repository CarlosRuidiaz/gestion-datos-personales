import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Auditar,
  DocumentoPipe,
  PersonaRespuesta,
  TipoTransaccion,
  UsuarioActual,
  UsuarioAutenticado,
} from '@gdp/common';
import { PersonasService } from './personas.service';

/** Sin @Roles: pueden consultar el administrador y el consultor (sección 4.3 del diseño). */
@ApiTags('personas')
@ApiBearerAuth()
@Controller('personas')
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  @Get(':documento')
  @Auditar(TipoTransaccion.CONSULTAR)
  @ApiOperation({ summary: 'Busca una persona por documento y devuelve todos sus datos, incluida la foto' })
  @ApiParam({ name: 'documento', example: '1043123456' })
  @ApiResponse({ status: 200, type: PersonaRespuesta })
  @ApiResponse({ status: 400, description: 'El documento no es válido' })
  @ApiResponse({ status: 404, description: 'No hay una persona con ese documento' })
  consultar(
    @Param('documento', DocumentoPipe) documento: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<PersonaRespuesta> {
    return this.personas.consultar(documento, usuario);
  }
}
