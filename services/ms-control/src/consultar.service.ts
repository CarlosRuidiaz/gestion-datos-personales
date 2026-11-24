import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { UsuarioAutenticado } from '@gdp/common';
import { ContenedorDocker, DockerCliente } from './docker.cliente';

export interface EstadoConsultar {
  /** true si al menos una réplica de ms-consultar está en ejecución. */
  encendido: boolean;
  /** Réplicas creadas por Docker Compose (encendidas o no). */
  replicas: number;
  enEjecucion: number;
}

export const MENSAJE_SIN_CREAR =
  'El contenedor de Consultar no existe. Arranca el sistema con docker compose --profile consultar up -d';
export const MENSAJE_SIN_DOCKER = 'No se pudo hablar con Docker para cambiar el estado de Consultar';

/**
 * Apaga y enciende ms-consultar (RF-09) deteniendo y arrancando sus contenedores, igual que
 * docker compose stop y start. Traefik quita o vuelve a poner la ruta /api/consultar solo (DD-04).
 * Actúa sobre todas las réplicas, así que también sirve si se escaló.
 */
@Injectable()
export class ConsultarService {
  private readonly logger = new Logger(ConsultarService.name);
  private readonly etiquetas = [
    `com.docker.compose.project=${process.env.COMPOSE_PROJECT || 'gestion-datos-personales'}`,
    'com.docker.compose.service=ms-consultar',
  ];

  constructor(private readonly docker: DockerCliente) {}

  async estado(): Promise<EstadoConsultar> {
    return resumir(await this.contenedores());
  }

  async apagar(usuario: UsuarioAutenticado): Promise<EstadoConsultar> {
    const contenedores = await this.contenedores();
    await this.enDocker(() =>
      Promise.all(contenedores.filter((c) => c.State === 'running').map((c) => this.docker.detener(c.Id))),
    );
    this.logger.log(`${usuario.nombre} apagó Consultar`);
    return this.estado();
  }

  async encender(usuario: UsuarioAutenticado): Promise<EstadoConsultar> {
    const contenedores = await this.contenedores();
    if (contenedores.length === 0) {
      throw new ConflictException(MENSAJE_SIN_CREAR);
    }
    await this.enDocker(() =>
      Promise.all(contenedores.filter((c) => c.State !== 'running').map((c) => this.docker.arrancar(c.Id))),
    );
    this.logger.log(`${usuario.nombre} encendió Consultar`);
    return this.estado();
  }

  private contenedores(): Promise<ContenedorDocker[]> {
    return this.enDocker(() => this.docker.listar(this.etiquetas));
  }

  private async enDocker<T>(accion: () => Promise<T>): Promise<T> {
    try {
      return await accion();
    } catch (error) {
      this.logger.error((error as Error).message);
      throw new ServiceUnavailableException(MENSAJE_SIN_DOCKER);
    }
  }
}

export function resumir(contenedores: ContenedorDocker[]): EstadoConsultar {
  const enEjecucion = contenedores.filter((c) => c.State === 'running').length;
  return { encendido: enEjecucion > 0, replicas: contenedores.length, enEjecucion };
}
