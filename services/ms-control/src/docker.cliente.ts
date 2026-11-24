import { Injectable } from '@nestjs/common';

/** Contenedor tal como lo devuelve GET /containers/json del Docker Engine. */
export interface ContenedorDocker {
  Id: string;
  Names: string[];
  State: string;
}

/**
 * Habla con el Docker Engine a través de docker-proxy (tecnativa/docker-socket-proxy), que solo
 * deja listar contenedores, detenerlos y arrancarlos. ms-control nunca monta el socket de Docker.
 */
@Injectable()
export class DockerCliente {
  private readonly base = (process.env.DOCKER_PROXY_URL || 'http://docker-proxy:2375').replace(/\/+$/, '');

  /** Contenedores (encendidos o no) que tienen todas las etiquetas indicadas. */
  async listar(etiquetas: string[]): Promise<ContenedorDocker[]> {
    const filtros = encodeURIComponent(JSON.stringify({ label: etiquetas }));
    const respuesta = await this.pedir(`/containers/json?all=1&filters=${filtros}`, 'GET');
    return (await respuesta.json()) as ContenedorDocker[];
  }

  /** Detiene el contenedor. Docker responde 304 si ya estaba detenido. */
  async detener(id: string): Promise<void> {
    await this.pedir(`/containers/${encodeURIComponent(id)}/stop?t=10`, 'POST');
  }

  /** Arranca el contenedor. Docker responde 304 si ya estaba encendido. */
  async arrancar(id: string): Promise<void> {
    await this.pedir(`/containers/${encodeURIComponent(id)}/start`, 'POST');
  }

  private async pedir(ruta: string, metodo: 'GET' | 'POST'): Promise<Response> {
    const respuesta = await fetch(`${this.base}${ruta}`, { method: metodo, signal: AbortSignal.timeout(20_000) });
    if (!respuesta.ok && respuesta.status !== 304) {
      throw new Error(`Docker respondió ${respuesta.status} a ${metodo} ${ruta}`);
    }
    return respuesta;
  }
}
