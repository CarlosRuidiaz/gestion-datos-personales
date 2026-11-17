import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configurarAplicacion } from '@gdp/common';
import { AppModule } from './app.module';

async function iniciar() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app, {
    prefijo: 'api/crear',
    titulo: 'ms-crear',
    descripcion: 'Gestión de Datos Personales: opción Crear Personas',
  });
  await app.listen(3000);
}
iniciar();
