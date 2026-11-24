import 'reflect-metadata';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  CLAVE_AUDITAR,
  CLAVE_PUBLICO,
  CLAVE_ROLES,
  ResultadoTransaccion,
  TipoTransaccion,
} from '@gdp/common';
import { ADMIN, CONSULTOR, crearEntorno, personaEjemplo } from '../../pruebas-comunes';
import { HealthController } from './health.controller';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

function preparar() {
  const entorno = crearEntorno();
  const servicio = new PersonasService(entorno.dataSource as never, entorno.auditoria as never);
  return { ...entorno, servicio };
}

describe('ms-consultar · PersonasService.consultar', () => {
  it('RF-04: devuelve la ficha completa con la foto como data URL', async () => {
    const { servicio, manager } = preparar();
    manager.findOneBy.mockResolvedValue(personaEjemplo({ foto: Buffer.from('abc'), fotoTipo: 'image/jpeg' }));

    const respuesta = await servicio.consultar('1043123456', CONSULTOR);

    expect(manager.findOneBy).toHaveBeenCalledWith(expect.anything(), { numeroDocumento: '1043123456' });
    expect(respuesta).toMatchObject({ primerNombre: 'Pedro', apellidos: 'Pérez Gómez', tieneFoto: true });
    expect(respuesta.foto).toBe(`data:image/jpeg;base64,${Buffer.from('abc').toString('base64')}`);
  });

  it('una persona sin foto devuelve foto null y tieneFoto false', async () => {
    const { servicio, manager } = preparar();
    manager.findOneBy.mockResolvedValue(personaEjemplo());

    const respuesta = await servicio.consultar('1043123456', ADMIN);

    expect(respuesta.foto).toBeNull();
    expect(respuesta.tieneFoto).toBe(false);
  });

  it('DD-02: la consulta y su log CONSULTAR van en la misma transacción, con el usuario del token', async () => {
    const { servicio, manager, auditoria, registroDeLog, eventos } = preparar();
    manager.findOneBy.mockResolvedValue(personaEjemplo());

    await servicio.consultar('1043123456', CONSULTOR);

    expect(auditoria.registrar.mock.calls[0][0]).toBe(manager);
    expect(registroDeLog()).toMatchObject({
      tipo: TipoTransaccion.CONSULTAR,
      numeroDocumento: '1043123456',
      usuario: 'consultor.prueba',
      resultado: ResultadoTransaccion.EXITO,
    });
    expect(eventos).toEqual(['log', 'commit']);
  });

  it('un documento que no existe responde 404 y no escribe el log de éxito', async () => {
    const { servicio, manager, auditoria } = preparar();
    manager.findOneBy.mockResolvedValue(null);

    await expect(servicio.consultar('1043123456', ADMIN)).rejects.toBeInstanceOf(NotFoundException);

    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  it('si el log falla, la consulta se deshace', async () => {
    const { servicio, manager, auditoria, eventos } = preparar();
    manager.findOneBy.mockResolvedValue(personaEjemplo());
    auditoria.registrar.mockRejectedValue(new Error('log caído'));

    await expect(servicio.consultar('1043123456', ADMIN)).rejects.toThrow('log caído');
    expect(eventos).toEqual(['rollback']);
  });
});

describe('ms-consultar · health (RF-09, CP-07)', () => {
  it('baseDeDatosDisponible es true si la base responde', async () => {
    const { servicio, dataSource } = preparar();
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    await expect(servicio.baseDeDatosDisponible()).resolves.toBe(true);
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('baseDeDatosDisponible es false si la base no responde, sin lanzar el error', async () => {
    const { servicio, dataSource } = preparar();
    dataSource.query.mockRejectedValue(new Error('connection refused'));
    await expect(servicio.baseDeDatosDisponible()).resolves.toBe(false);
  });

  it('el endpoint responde «disponible» cuando hay base de datos', async () => {
    const { servicio, dataSource } = preparar();
    dataSource.query.mockResolvedValue([]);
    await expect(new HealthController(servicio).health()).resolves.toEqual({ estado: 'disponible', servicio: 'ms-consultar' });
  });

  it('el endpoint responde 503 si el servicio corre pero no llega a la base de datos', async () => {
    const { servicio, dataSource } = preparar();
    dataSource.query.mockRejectedValue(new Error('caída'));
    await expect(new HealthController(servicio).health()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('ms-consultar · permisos (RNF-01)', () => {
  it('el health no pide token', () => {
    expect(Reflect.getMetadata(CLAVE_PUBLICO, HealthController.prototype.health)).toBe(true);
  });

  it('consultar no restringe el rol (administrador y consultor) y se audita como CONSULTAR', () => {
    expect(Reflect.getMetadata(CLAVE_ROLES, PersonasController)).toBeUndefined();
    expect(Reflect.getMetadata(CLAVE_ROLES, PersonasController.prototype.consultar)).toBeUndefined();
    expect(Reflect.getMetadata(CLAVE_AUDITAR, PersonasController.prototype.consultar)).toEqual({ tipo: TipoTransaccion.CONSULTAR });
  });
});
