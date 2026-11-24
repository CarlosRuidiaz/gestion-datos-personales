import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Rol, Roles, UsuarioActual, UsuarioAutenticado } from '@gdp/common';
import { ConsultarService, EstadoConsultar } from './consultar.service';

/** Solo el administrador puede ver y cambiar el estado de Consultar (T24). */
@ApiTags('consultar')
@ApiBearerAuth()
@Roles(Rol.ADMINISTRADOR)
@Controller('consultar')
export class ConsultarController {
  constructor(private readonly consultar: ConsultarService) {}

  @Get()
  @ApiOperation({ summary: 'Indica si ms-consultar está encendido y cuántas réplicas tiene' })
  @ApiResponse({ status: 200, description: '{ encendido, replicas, enEjecucion }' })
  @ApiResponse({ status: 503, description: 'No se pudo hablar con Docker' })
  estado(): Promise<EstadoConsultar> {
    return this.consultar.estado();
  }

  @Post('apagar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Detiene todas las réplicas de ms-consultar' })
  apagar(@UsuarioActual() usuario: UsuarioAutenticado): Promise<EstadoConsultar> {
    return this.consultar.apagar(usuario);
  }

  @Post('encender')
  @HttpCode(200)
  @ApiOperation({ summary: 'Arranca las réplicas detenidas de ms-consultar' })
  @ApiResponse({ status: 409, description: 'El contenedor no existe: falta arrancar con --profile consultar' })
  encender(@UsuarioActual() usuario: UsuarioAutenticado): Promise<EstadoConsultar> {
    return this.consultar.encender(usuario);
  }
}
