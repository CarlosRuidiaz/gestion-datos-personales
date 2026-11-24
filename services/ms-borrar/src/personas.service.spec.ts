import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import {
  CLAVE_AUDITAR,
  CLAVE_ROLES,
  CONTEXTO_PREVIO_BORRAR,
  Persona,
  ResultadoTransaccion,
  Rol,
  TipoTransaccion,
} from '@gdp/common';
import { ADMIN, crearEntorno, personaEjemplo } from '../../pruebas-comunes';
import { CONFIRMACION_BORRAR_TODAS, PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

const DOC = '1043123456';

function preparar(existente: Persona | null = personaEjemplo()) {
  const entorno = crearEntorno();
  const servicio = new PersonasService(entorno.dataSource as never, entorno.auditoria as never, entorno.indexacion as never);
  entorno.manager.findOneBy.mockResolvedValue(existente);
  entorno.manager.delete.mockResolvedValue({ affected: 1, raw: [] });
  return { ...entorno, servicio };
}

describe('ms-borrar · PersonasService.buscar (búsqueda previa)', () => {
  it('devuelve la ficha con la foto para revisarla y la deja en el log con el contexto del borrado', async () => {
    const { servicio, registroDeLog, eventos, auditoria, manager } = preparar(personaEjemplo({ foto: Buffer.from('x'), fotoTipo: 'image/png' }));

    const respuesta = await servicio.buscar(DOC, ADMIN);

    expect(auditoria.registrar.mock.calls[0][0]).toBe(manager); // el log va en la transacción

    expect(respuesta.foto).toMatch(/^data:image\/png;base64,/);
    expect(registroDeLog()).toMatchObject({
      tipo: TipoTransaccion.CONSULTAR,
      numeroDocumento: DOC,
      resultado: ResultadoTransaccion.EXITO,
      detalle: { contexto: CONTEXTO_PREVIO_BORRAR },
    });
    expect(eventos).toEqual(['log', 'commit']);
  });

  it('un documento que no existe responde 404', async () => {
    const { servicio, auditoria } = preparar(null);
    await expect(servicio.buscar(DOC, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});

describe('ms-borrar · PersonasService.borrar', () => {
  it('CP-05: borra la persona y el log BORRAR guarda los datos que tenía, para que su historial quede completo', async () => {
    const { servicio, manager, registroDeLog } = preparar();

    await servicio.borrar(DOC, ADMIN);

    expect(manager.delete).toHaveBeenCalledWith(Persona, { numeroDocumento: DOC });
    expect(registroDeLog()).toMatchObject({
      tipo: TipoTransaccion.BORRAR,
      numeroDocumento: DOC,
      usuario: 'admin.prueba',
      resultado: ResultadoTransaccion.EXITO,
    });
    expect(registroDeLog().detalle.anterior).toMatchObject({
      numeroDocumento: DOC,
      primerNombre: 'Pedro',
      apellidos: 'Pérez Gómez',
      correo: 'pedro.perez@example.com',
    });
    expect(registroDeLog().detalle.teniaFoto).toBe(false);
  });

  it('el log no guarda la foto, solo si la tenía', async () => {
    const { servicio, registroDeLog } = preparar(personaEjemplo({ foto: Buffer.from('secreto'), fotoTipo: 'image/png' }));

    await servicio.borrar(DOC, ADMIN);

    expect(registroDeLog().detalle.teniaFoto).toBe(true);
    expect(JSON.stringify(registroDeLog().detalle)).not.toContain('secreto');
  });

  it('el borrado y su log van en la misma transacción, y el aviso a n8n después del commit', async () => {
    const { servicio, manager, auditoria, eventos, indexacion } = preparar();

    await servicio.borrar(DOC, ADMIN);

    expect(auditoria.registrar.mock.calls[0][0]).toBe(manager);
    expect(eventos).toEqual(['log', 'commit', 'aviso']);
    expect(indexacion.avisar).toHaveBeenCalledWith(DOC, TipoTransaccion.BORRAR);
  });

  it('un documento que no existe responde 404 sin borrar, sin log de éxito y sin aviso', async () => {
    const { servicio, manager, auditoria, indexacion } = preparar(null);

    await expect(servicio.borrar(DOC, ADMIN)).rejects.toBeInstanceOf(NotFoundException);

    expect(manager.delete).not.toHaveBeenCalled();
    expect(auditoria.registrar).not.toHaveBeenCalled();
    expect(indexacion.avisar).not.toHaveBeenCalled();
  });

  it('dos borrados simultáneos: si el DELETE no afectó ninguna fila, el segundo recibe 404 sin log de éxito', async () => {
    const { servicio, manager, auditoria, eventos, indexacion } = preparar();
    manager.delete.mockResolvedValue({ affected: 0, raw: [] });

    await expect(servicio.borrar(DOC, ADMIN)).rejects.toBeInstanceOf(NotFoundException);

    expect(auditoria.registrar).not.toHaveBeenCalled();
    expect(eventos).toEqual(['rollback']);
    expect(indexacion.avisar).not.toHaveBeenCalled();
  });

  it('no bloquea la fila con SELECT ... FOR UPDATE: usr_borrar no tiene permiso de UPDATE (sección 6.3)', async () => {
    const { servicio, manager } = preparar();
    await servicio.borrar(DOC, ADMIN);
    expect(manager.findOne).not.toHaveBeenCalled();
    expect(manager.findOneBy).toHaveBeenCalledWith(Persona, { numeroDocumento: DOC });
  });

  it('RF-08: si el log falla, el borrado se deshace y no hay aviso a n8n', async () => {
    const { servicio, auditoria, eventos, indexacion } = preparar();
    auditoria.registrar.mockRejectedValue(new Error('log caído'));

    await expect(servicio.borrar(DOC, ADMIN)).rejects.toThrow('log caído');

    expect(eventos).toEqual(['rollback']);
    expect(indexacion.avisar).not.toHaveBeenCalled();
  });
});

describe('ms-borrar · PersonasService.borrarTodas', () => {
  it('borra una por una, cada una con su BORRAR en el log y su aviso a n8n, sin tocar el resto del log', async () => {
    const { servicio, dataSource, manager, auditoria, indexacion, eventos } = preparar();
    dataSource.getRepository.mockReturnValue({
      find: jest.fn().mockResolvedValue([{ numeroDocumento: '111' }, { numeroDocumento: '222' }]),
    });
    manager.findOneBy.mockImplementation(async (_e: unknown, { numeroDocumento }: { numeroDocumento: string }) =>
      personaEjemplo({ numeroDocumento }),
    );

    await expect(servicio.borrarTodas(ADMIN)).resolves.toEqual({ borradas: 2 });

    expect(manager.delete.mock.calls.map((c) => c[1])).toEqual([{ numeroDocumento: '111' }, { numeroDocumento: '222' }]);
    expect(auditoria.registrar.mock.calls.map((c) => (c[1] as { tipo: string }).tipo)).toEqual(['BORRAR', 'BORRAR']);
    expect(indexacion.avisar.mock.calls).toEqual([['111', 'BORRAR'], ['222', 'BORRAR']]);
    expect(eventos).toEqual(['log', 'commit', 'aviso', 'log', 'commit', 'aviso']);
    expect(manager.query).not.toHaveBeenCalled(); // nada de TRUNCATE ni DELETE sobre el log
  });

  it('si otra persona ya fue borrada al mismo tiempo, sigue con las demás', async () => {
    const { servicio, dataSource, manager } = preparar();
    dataSource.getRepository.mockReturnValue({
      find: jest.fn().mockResolvedValue([{ numeroDocumento: '111' }, { numeroDocumento: '222' }]),
    });
    manager.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(personaEjemplo({ numeroDocumento: '222' }));

    await expect(servicio.borrarTodas(ADMIN)).resolves.toEqual({ borradas: 1 });
  });
});

describe('ms-borrar · borrar todas: confirmación', () => {
  it('sin escribir la confirmación exacta responde 400 y no borra nada', () => {
    const personas = { borrarTodas: jest.fn() };
    const controlador = new PersonasController(personas as never);
    expect(() => controlador.borrarTodas(undefined, ADMIN)).toThrow('Falta confirmar');
    expect(() => controlador.borrarTodas('borrar todas', ADMIN)).toThrow('Falta confirmar');
    expect(personas.borrarTodas).not.toHaveBeenCalled();
    controlador.borrarTodas(CONFIRMACION_BORRAR_TODAS, ADMIN);
    expect(personas.borrarTodas).toHaveBeenCalledWith(ADMIN);
  });

  it('se audita como BORRAR con su contexto', () => {
    expect(Reflect.getMetadata(CLAVE_AUDITAR, PersonasController.prototype.borrarTodas)).toEqual({
      tipo: TipoTransaccion.BORRAR,
      contexto: 'Borrar todas las personas',
    });
  });
});

describe('ms-borrar · PersonasController (RNF-01)', () => {
  it('todo el controlador es solo para el administrador', () => {
    expect(Reflect.getMetadata(CLAVE_ROLES, PersonasController)).toEqual([Rol.ADMINISTRADOR]);
  });

  it('la búsqueda previa se audita como CONSULTAR con su contexto y el borrado como BORRAR', () => {
    expect(Reflect.getMetadata(CLAVE_AUDITAR, PersonasController.prototype.buscar)).toEqual({
      tipo: TipoTransaccion.CONSULTAR,
      contexto: CONTEXTO_PREVIO_BORRAR,
    });
    expect(Reflect.getMetadata(CLAVE_AUDITAR, PersonasController.prototype.borrar)).toEqual({ tipo: TipoTransaccion.BORRAR });
  });
});
