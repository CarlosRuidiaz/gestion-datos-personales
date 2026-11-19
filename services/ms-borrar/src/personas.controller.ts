import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Auditar,
  CONTEXTO_PREVIO_BORRAR,
  DocumentoPipe,
  PersonaRespuesta,
  Rol,
  Roles,
  TipoTransaccion,
  UsuarioActual,
  UsuarioAutenticado,
} from '@gdp/common';
import { PersonasService } from './personas.service';

@ApiTags('personas')
@ApiBearerAuth()
@Roles(Rol.ADMINISTRADOR)
@Controller('personas')
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  @Get(':documento')
  @Auditar(TipoTransaccion.CONSULTAR, CONTEXTO_PREVIO_BORRAR)
  @ApiOperation({ summary: 'Busca la persona que se va a borrar, para revisar sus datos antes de confirmar. Incluye la foto' })
  @ApiParam({ name: 'documento', example: '1043123456' })
  @ApiResponse({ status: 200, type: PersonaRespuesta })
  @ApiResponse({ status: 400, description: 'El documento no es válido' })
  @ApiResponse({ status: 404, description: 'No hay una persona con ese documento' })
  buscar(
    @Param('documento', DocumentoPipe) documento: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<PersonaRespuesta> {
    return this.personas.buscar(documento, usuario);
  }

  @Delete(':documento')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auditar(TipoTransaccion.BORRAR)
  @ApiOperation({ summary: 'Borra la persona. Su historial en el log se conserva' })
  @ApiParam({ name: 'documento', example: '1043123456' })
  @ApiResponse({ status: 204, description: 'Persona borrada' })
  @ApiResponse({ status: 400, description: 'El documento no es válido' })
  @ApiResponse({ status: 404, description: 'No hay una persona con ese documento' })
  borrar(
    @Param('documento', DocumentoPipe) documento: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.personas.borrar(documento, usuario);
  }
}
