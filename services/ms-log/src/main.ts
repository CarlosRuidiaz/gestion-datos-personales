import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configurarAplicacion } from '@gdp/common';
import { AppModule } from './app.module';

async function iniciar() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app, {
    prefijo: 'api/log',
    titulo: 'ms-log',
    descripcion: 'Gestión de Datos Personales: opción Consultar log y registro de las consultas en lenguaje natural',
  });
  await app.listen(3000);
}
iniciar();
