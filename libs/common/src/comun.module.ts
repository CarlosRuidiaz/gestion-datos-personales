import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FiltroAuditoria } from './auditoria/auditoria.filter';
import { AuditoriaService } from './auditoria/auditoria.service';
import { configuracionBaseDeDatos } from './entorno';
import { AvisoIndexacionService } from './indexacion/aviso-indexacion.service';
import { LogTransaccion } from './log/log-transaccion.entity';
import { Persona } from './persona/persona.entity';
import { JwtGuard } from './seguridad/jwt.guard';
import { VerificadorToken } from './seguridad/verificador-token.service';
import { crearValidationPipe } from './validacion/validacion';

/**
 * Módulo que importa cada microservicio en su AppModule: ComunModule.forRoot().
 * Deja configurado, igual para todos:
 * - la conexión a PostgreSQL con el usuario propio del servicio (DB_USER y DB_PASSWORD);
 * - el guard JWT con roles, en todas las rutas;
 * - la validación de los DTO, con la lista de campos y mensajes;
 * - el filtro que registra en el log las peticiones rechazadas;
 * - AuditoriaService, para registrar las operaciones exitosas dentro de su transacción;
 * - AvisoIndexacionService, para avisar a n8n después del commit (crear, modificar y borrar).
 */
@Global()
@Module({})
export class ComunModule {
  static forRoot(): DynamicModule {
    return {
      module: ComunModule,
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: () => ({
            type: 'postgres' as const,
            ...configuracionBaseDeDatos(),
            entities: [Persona, LogTransaccion],
            // El esquema lo define database/init.sql. Los servicios no pueden crear ni alterar tablas.
            synchronize: false,
          }),
        }),
      ],
      providers: [
        VerificadorToken,
        AuditoriaService,
        AvisoIndexacionService,
        { provide: APP_GUARD, useClass: JwtGuard },
        { provide: APP_PIPE, useFactory: crearValidationPipe },
        { provide: APP_FILTER, useClass: FiltroAuditoria },
      ],
      exports: [VerificadorToken, AuditoriaService, AvisoIndexacionService],
    };
  }
}
