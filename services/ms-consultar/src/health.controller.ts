import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Publico } from '@gdp/common';
import { PersonasService } from './personas.service';

/**
 * GET /api/consultar/health, sin token. El frontend lo usa para saber si mostrar
 * Consultar como disponible (notas del equipo). Si el contenedor está apagado,
 * Traefik responde 404 porque la ruta desaparece del gateway (DD-04).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly personas: PersonasService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Indica si el servicio de consulta está disponible. No requiere token' })
  @ApiResponse({ status: 200, description: 'Disponible' })
  @ApiResponse({ status: 503, description: 'El servicio corre pero no llega a la base de datos' })
  async health(): Promise<{ estado: string; servicio: string }> {
    if (!(await this.personas.baseDeDatosDisponible())) {
      throw new ServiceUnavailableException('El servicio de consulta no tiene acceso a la base de datos');
    }
    return { estado: 'disponible', servicio: 'ms-consultar' };
  }
}
