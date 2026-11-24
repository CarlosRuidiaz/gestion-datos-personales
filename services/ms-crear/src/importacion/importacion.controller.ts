import { Controller, HttpCode, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auditar, Rol, Roles, TipoTransaccion, UsuarioActual, UsuarioAutenticado } from '@gdp/common';
import { ArchivoRecibido } from './archivos';
import { ImportacionService, ResultadoImportacion } from './importacion.service';

const ARCHIVOS = FileFieldsInterceptor(
  [
    { name: 'datos', maxCount: 1 },
    { name: 'fotos', maxCount: 50 },
  ],
  { limits: { fileSize: 30 * 1024 * 1024, files: 51 } },
);

const CUERPO = {
  schema: {
    type: 'object',
    properties: {
      datos: { type: 'string', format: 'binary', description: 'Excel (.xlsx) o CSV, una fila por persona' },
      fotos: { type: 'array', items: { type: 'string', format: 'binary' }, description: '.zip con las fotos o imágenes sueltas' },
    },
  },
};

interface Archivos {
  datos?: ArchivoRecibido[];
  fotos?: ArchivoRecibido[];
}

/**
 * Importar personas desde un archivo (T30), solo para el administrador. Es parte de la opción Crear:
 * cada persona se crea igual que desde el formulario.
 */
@ApiTags('importación')
@ApiBearerAuth()
@Roles(Rol.ADMINISTRADOR)
@Controller('personas/importacion')
export class ImportacionController {
  constructor(private readonly importacion: ImportacionService) {}

  @Post('revision')
  @HttpCode(200)
  @UseInterceptors(ARCHIVOS)
  @ApiOperation({ summary: 'Revisa el archivo sin crear nada: columnas reconocidas, fotos y qué pasará con cada fila' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(CUERPO)
  @ApiResponse({ status: 200, description: 'Resultado de la revisión' })
  @ApiResponse({ status: 400, description: 'No se pudo leer el archivo o faltan columnas' })
  revisar(@UploadedFiles() archivos: Archivos = {}): Promise<ResultadoImportacion> {
    return this.importacion.revisar(archivos.datos?.[0], archivos.fotos ?? []);
  }

  @Post()
  @HttpCode(200)
  @Auditar(TipoTransaccion.CREAR, 'Importación de personas')
  @UseInterceptors(ARCHIVOS)
  @ApiOperation({ summary: 'Crea las personas válidas del archivo, con sus fotos. Cada una queda en el log' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(CUERPO)
  @ApiResponse({ status: 200, description: 'Qué pasó con cada fila' })
  @ApiResponse({ status: 400, description: 'No se pudo leer el archivo o faltan columnas' })
  importar(
    @UploadedFiles() archivos: Archivos = {},
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ResultadoImportacion> {
    return this.importacion.importar(archivos.datos?.[0], archivos.fotos ?? [], usuario);
  }
}
