import { Module } from '@nestjs/common';
import { ComunModule } from '@gdp/common';
import { HealthController } from './health.controller';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

@Module({
  imports: [ComunModule.forRoot()],
  controllers: [HealthController, PersonasController],
  providers: [PersonasService],
})
export class AppModule {}
