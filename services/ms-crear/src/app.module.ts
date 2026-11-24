import { Module } from '@nestjs/common';
import { ComunModule } from '@gdp/common';
import { ImportacionController } from './importacion/importacion.controller';
import { ImportacionService } from './importacion/importacion.service';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

@Module({
  imports: [ComunModule.forRoot()],
  controllers: [PersonasController, ImportacionController],
  providers: [PersonasService, ImportacionService],
})
export class AppModule {}
