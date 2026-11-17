import { Module } from '@nestjs/common';
import { ComunModule } from '@gdp/common';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

@Module({
  imports: [ComunModule.forRoot()],
  controllers: [PersonasController],
  providers: [PersonasService],
})
export class AppModule {}
