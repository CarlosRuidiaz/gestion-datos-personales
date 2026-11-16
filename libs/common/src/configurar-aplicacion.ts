import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface OpcionesDeAplicacion {
  /** Prefijo de ruta del servicio en el gateway, sin barra inicial: 'api/crear'. */
  prefijo: string;
  /** Título de la documentación OpenAPI: 'ms-crear'. */
  titulo: string;
  descripcion?: string;
}

/**
 * Configuración común del arranque de cada microservicio (main.ts):
 * prefijo de ruta propio y documentación OpenAPI en /<prefijo>/docs.
 * La validación, el guard y el filtro de auditoría los pone ComunModule.
 */
export function configurarAplicacion(app: INestApplication, opciones: OpcionesDeAplicacion): void {
  app.setGlobalPrefix(opciones.prefijo);
  app.enableShutdownHooks();

  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(opciones.titulo)
      .setDescription(opciones.descripcion ?? 'Gestión de Datos Personales')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(`${opciones.prefijo}/docs`, app, documento);
}
