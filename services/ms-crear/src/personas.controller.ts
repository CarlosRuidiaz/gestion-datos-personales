import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
  ApiExtraModels,
} from '@nestjs/swagger';
import {
  ArchivoSubido,
  Auditar,
  CrearPersonaDto,
  PersonaRespuesta,
  Rol,
  Roles,
  TipoTransaccion,
  UsuarioActual,
  UsuarioAutenticado,
  validarFoto,
} from '@gdp/common';
import { PersonasService } from './personas.service';

/**
 * Tope de subida. Es mayor que los 2 MB permitidos a propósito: así una foto de 3 MB
 * recibe el error 400 del campo «foto» (validarFoto) y no un 413 genérico.
 */
const LIMITE_DE_SUBIDA = 8 * 1024 * 1024;

@ApiTags('personas')
@ApiBearerAuth()
@ApiExtraModels(CrearPersonaDto)
@Controller('personas')
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  @Post()
  @Roles(Rol.ADMINISTRADOR)
  @Auditar(TipoTransaccion.CREAR)
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: LIMITE_DE_SUBIDA, files: 1 } }))
  @ApiOperation({ summary: 'Crea una persona. La foto es opcional (JPG o PNG, máximo 2 MB)' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(CrearPersonaDto) },
        { type: 'object', properties: { foto: { type: 'string', format: 'binary' } } },
      ],
    },
  })
  @ApiResponse({ status: 201, type: PersonaRespuesta, description: 'Persona creada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos: lista de campos con su mensaje' })
  @ApiResponse({ status: 401, description: 'Falta el token o venció' })
  @ApiResponse({ status: 403, description: 'El rol no tiene permiso' })
  @ApiResponse({ status: 409, description: 'El número de documento ya existe' })
  crear(
    @Body() dto: CrearPersonaDto,
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<PersonaRespuesta> {
    return this.personas.crear(dto, validarFoto(archivo), usuario);
  }
}
