import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configurarAplicacion } from '@gdp/common';
import { AppModule } from './app.module';

async function iniciar() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app, {
    prefijo: 'api/borrar',
    titulo: 'ms-borrar',
    descripcion: 'Gestión de Datos Personales: opción Borrar Personas',
  });
  await app.listen(3000);
}
iniciar();
