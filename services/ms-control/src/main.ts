import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configurarAplicacion } from '@gdp/common';
import { AppModule } from './app.module';

async function iniciar() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app, {
    prefijo: 'api/control',
    titulo: 'ms-control',
    descripcion: 'Gestión de Datos Personales: apagar y encender el servicio de consulta (T24)',
  });
  await app.listen(3000);
}
iniciar();
