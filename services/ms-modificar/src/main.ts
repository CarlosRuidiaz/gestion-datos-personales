import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configurarAplicacion } from '@gdp/common';
import { AppModule } from './app.module';

async function iniciar() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app, {
    prefijo: 'api/modificar',
    titulo: 'ms-modificar',
    descripcion: 'Gestión de Datos Personales: opción Modificar Datos Personales',
  });
  await app.listen(3000);
}
iniciar();
