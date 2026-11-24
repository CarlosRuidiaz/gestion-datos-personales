import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtGuard, VerificadorToken } from '@gdp/common';
import { ConsultarController } from './consultar.controller';
import { ConsultarService } from './consultar.service';
import { DockerCliente } from './docker.cliente';
import { HealthController } from './health.controller';

/**
 * ms-control no usa la base de datos, así que no importa ComunModule (que abre la conexión).
 * Solo toma de @gdp/common el guard JWT con roles, igual que los demás servicios.
 */
@Module({
  controllers: [HealthController, ConsultarController],
  providers: [VerificadorToken, DockerCliente, ConsultarService, { provide: APP_GUARD, useClass: JwtGuard }],
})
export class AppModule {}
