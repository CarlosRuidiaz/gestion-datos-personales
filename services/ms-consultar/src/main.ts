import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configurarAplicacion } from '@gdp/common';
import { AppModule } from './app.module';

async function iniciar() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app, {
    prefijo: 'api/consultar',
    titulo: 'ms-consultar',
    descripcion: 'Gestión de Datos Personales: opción Consultar Datos Personales',
  });
  await app.listen(3000);
}
iniciar();
