import { Module } from '@nestjs/common';
import { ComunModule } from '@gdp/common';
import { LlaveApiGuard } from './llave-api.guard';
import { LogController } from './log.controller';
import { LogService } from './log.service';

@Module({
  imports: [ComunModule.forRoot()],
  controllers: [LogController],
  providers: [LogService, LlaveApiGuard],
})
export class AppModule {}
