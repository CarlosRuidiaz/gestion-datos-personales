import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '@gdp/common';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @Publico()
  @ApiOperation({ summary: 'Indica si ms-control está arriba. No requiere token' })
  health(): { estado: string; servicio: string } {
    return { estado: 'disponible', servicio: 'ms-control' };
  }
}
