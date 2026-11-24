import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConsultarService } from './consultar.service';
import { ContenedorDocker, DockerCliente } from './docker.cliente';

const ADMIN = { nombre: 'admin.prueba', roles: ['administrador'], id: '1' };

const replica = (Id: string, State: string): ContenedorDocker => ({ Id, State, Names: [`/${Id}`] });

/** Docker falso: guarda el estado de cada contenedor y cambia con detener y arrancar. */
function dockerFalso(inicial: ContenedorDocker[]) {
  const contenedores = inicial.map((c) => ({ ...c }));
  const docker = {
    listar: jest.fn(async (_etiquetas: string[]) => contenedores.map((c) => ({ ...c }))),
    detener: jest.fn(async (id: string) => {
      contenedores.find((c) => c.Id === id)!.State = 'exited';
    }),
    arrancar: jest.fn(async (id: string) => {
      contenedores.find((c) => c.Id === id)!.State = 'running';
    }),
  };
  return { docker, servicio: new ConsultarService(docker as unknown as DockerCliente) };
}

describe('ConsultarService', () => {
  it('busca solo los contenedores de ms-consultar del proyecto', async () => {
    const { docker, servicio } = dockerFalso([replica('a', 'running')]);
    await servicio.estado();
    expect(docker.listar).toHaveBeenCalledWith([
      'com.docker.compose.project=gestion-datos-personales',
      'com.docker.compose.service=ms-consultar',
    ]);
  });

  it('informa encendido si hay al menos una réplica en ejecución', async () => {
    const { servicio } = dockerFalso([replica('a', 'running'), replica('b', 'exited')]);
    await expect(servicio.estado()).resolves.toEqual({ encendido: true, replicas: 2, enEjecucion: 1 });
  });

  it('apagar detiene todas las réplicas en ejecución y ninguna otra', async () => {
    const { docker, servicio } = dockerFalso([replica('a', 'running'), replica('b', 'running'), replica('c', 'exited')]);
    await expect(servicio.apagar(ADMIN)).resolves.toEqual({ encendido: false, replicas: 3, enEjecucion: 0 });
    expect(docker.detener.mock.calls.map(([id]) => id).sort()).toEqual(['a', 'b']);
  });

  it('encender arranca solo las réplicas detenidas', async () => {
    const { docker, servicio } = dockerFalso([replica('a', 'exited'), replica('b', 'running')]);
    await expect(servicio.encender(ADMIN)).resolves.toEqual({ encendido: true, replicas: 2, enEjecucion: 2 });
    expect(docker.arrancar).toHaveBeenCalledTimes(1);
    expect(docker.arrancar).toHaveBeenCalledWith('a');
  });

  it('apagar o encender dos veces no hace nada la segunda vez', async () => {
    const { docker, servicio } = dockerFalso([replica('a', 'running')]);
    await servicio.apagar(ADMIN);
    await servicio.apagar(ADMIN);
    expect(docker.detener).toHaveBeenCalledTimes(1);
    await servicio.encender(ADMIN);
    await servicio.encender(ADMIN);
    expect(docker.arrancar).toHaveBeenCalledTimes(1);
  });

  it('encender sin contenedores creados responde 409', async () => {
    const { servicio } = dockerFalso([]);
    await expect(servicio.encender(ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it('apagar sin contenedores creados no falla', async () => {
    const { servicio } = dockerFalso([]);
    await expect(servicio.apagar(ADMIN)).resolves.toEqual({ encendido: false, replicas: 0, enEjecucion: 0 });
  });

  it('si Docker no responde o rechaza la orden, devuelve 503', async () => {
    const { docker, servicio } = dockerFalso([replica('a', 'running')]);
    docker.listar.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(servicio.estado()).rejects.toBeInstanceOf(ServiceUnavailableException);
    docker.detener.mockRejectedValueOnce(new Error('Docker respondió 403'));
    await expect(servicio.apagar(ADMIN)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
