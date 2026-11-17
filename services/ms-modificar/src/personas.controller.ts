import { Body, Controller, Get, Param, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ArchivoSubido,
  Auditar,
  CONTEXTO_PREVIO_MODIFICAR,
  DocumentoPipe,
  PersonaRespuesta,
  Rol,
  Roles,
  TipoTransaccion,
  UsuarioActual,
  UsuarioAutenticado,
  validarFoto,
} from '@gdp/common';
import { ActualizarPersonaDto } from './actualizar-persona.dto';
import { PersonasService } from './personas.service';

/** Tope de subida, mayor que los 2 MB permitidos: así una foto de 3 MB recibe el 400 del campo «foto». */
const LIMITE_DE_SUBIDA = 8 * 1024 * 1024;

@ApiTags('personas')
@ApiBearerAuth()
@ApiExtraModels(ActualizarPersonaDto)
@Roles(Rol.ADMINISTRADOR)
@Controller('personas')
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  @Get(':documento')
  @Auditar(TipoTransaccion.CONSULTAR, CONTEXTO_PREVIO_MODIFICAR)
  @ApiOperation({ summary: 'Busca la persona que se va a modificar. Incluye la foto' })
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

  @Put(':documento')
  @Auditar(TipoTransaccion.MODIFICAR)
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: LIMITE_DE_SUBIDA, files: 1 } }))
  @ApiOperation({ summary: 'Modifica los datos de una persona. El número de documento no se puede cambiar' })
  @ApiParam({ name: 'documento', example: '1043123456' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(ActualizarPersonaDto) },
        { type: 'object', properties: { foto: { type: 'string', format: 'binary' } } },
      ],
    },
  })
  @ApiResponse({ status: 200, type: PersonaRespuesta, description: 'Persona actualizada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos: lista de campos con su mensaje' })
  @ApiResponse({ status: 404, description: 'No hay una persona con ese documento' })
  modificar(
    @Param('documento', DocumentoPipe) documento: string,
    @Body() dto: ActualizarPersonaDto,
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<PersonaRespuesta> {
    return this.personas.modificar(documento, dto, validarFoto(archivo), usuario);
  }
}
