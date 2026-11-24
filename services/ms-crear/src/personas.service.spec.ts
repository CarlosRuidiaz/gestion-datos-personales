import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import {
  CLAVE_AUDITAR,
  CLAVE_ROLES,
  CrearPersonaDto,
  Persona,
  ResultadoTransaccion,
  Rol,
  TipoTransaccion,
} from '@gdp/common';
import { ADMIN, crearEntorno, personaEjemplo } from '../../pruebas-comunes';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

const DTO: CrearPersonaDto = {
  tipoDocumento: 'Cédula',
  numeroDocumento: '1043123456',
  primerNombre: 'Pedro',
  segundoNombre: 'Andrés',
  apellidos: 'Pérez Gómez',
  fechaNacimiento: '2003-03-05',
  genero: 'Masculino',
  correo: 'pedro.perez@example.com',
  celular: '3001234567',
};

function preparar() {
  const entorno = crearEntorno();
  const servicio = new PersonasService(entorno.dataSource as never, entorno.auditoria as never, entorno.indexacion as never);
  entorno.manager.existsBy.mockResolvedValue(false);
  entorno.manager.insert.mockResolvedValue(undefined);
  entorno.manager.findOneByOrFail.mockResolvedValue(personaEjemplo());
  return { ...entorno, servicio };
}

describe('ms-crear · PersonasService.crear', () => {
  it('CP-01: crea la persona, escribe el log CREAR y avisa a n8n, en ese orden', async () => {
    const { servicio, manager, eventos, registroDeLog, indexacion } = preparar();

    const respuesta = await servicio.crear(DTO, null, ADMIN);

    expect(respuesta.numeroDocumento).toBe('1043123456');
    expect(respuesta.fechaNacimiento).toBe('2003-03-05');
    expect(respuesta.tieneFoto).toBe(false);
    expect(manager.insert).toHaveBeenCalledTimes(1);
    expect(registroDeLog()).toMatchObject({
      tipo: TipoTransaccion.CREAR,
      numeroDocumento: '1043123456',
      usuario: 'admin.prueba',
      resultado: ResultadoTransaccion.EXITO,
    });
    expect(registroDeLog().detalle.nuevo.primerNombre).toBe('Pedro');
    // La persona y su log se guardan antes del commit; el aviso a n8n va después (DD-02, paso 6).
    expect(eventos).toEqual(['log', 'commit', 'aviso']);
    expect(indexacion.avisar).toHaveBeenCalledWith('1043123456', TipoTransaccion.CREAR);
  });

  it('DD-02: el log se escribe con el mismo manager de la transacción', async () => {
    const { servicio, manager, auditoria } = preparar();
    await servicio.crear(DTO, null, ADMIN);
    expect(auditoria.registrar.mock.calls[0][0]).toBe(manager);
  });

  it('el detalle del log no trae la foto', async () => {
    const { servicio, manager, registroDeLog } = preparar();
    manager.findOneByOrFail.mockResolvedValue(personaEjemplo({ foto: Buffer.from('imagen'), fotoTipo: 'image/png' }));

    await servicio.crear(DTO, { foto: Buffer.from('imagen'), fotoTipo: 'image/png' } as never, ADMIN);

    expect(JSON.stringify(registroDeLog().detalle)).not.toContain('imagen');
    expect(registroDeLog().detalle.nuevo.tieneFoto).toBe(true);
  });

  it('guarda el segundo nombre y la foto como null cuando no llegan', async () => {
    const { servicio, manager } = preparar();

    await servicio.crear({ ...DTO, segundoNombre: undefined }, null, ADMIN);

    const guardado = manager.insert.mock.calls[0][1];
    expect(manager.insert.mock.calls[0][0]).toBe(Persona);
    expect(guardado.segundoNombre).toBeNull();
    expect(guardado.foto).toBeNull();
    expect(guardado.fotoTipo).toBeNull();
  });

  it('guarda la foto y su tipo cuando llegan', async () => {
    const { servicio, manager } = preparar();
    const foto = Buffer.from('bytes');

    await servicio.crear(DTO, { foto, fotoTipo: 'image/jpeg' } as never, ADMIN);

    expect(manager.insert.mock.calls[0][1].foto).toBe(foto);
    expect(manager.insert.mock.calls[0][1].fotoTipo).toBe('image/jpeg');
  });

  it('CP-02: con un documento existente responde 409 sin guardar nada ni avisar a n8n', async () => {
    const { servicio, manager, eventos, indexacion } = preparar();
    manager.existsBy.mockResolvedValue(true);

    await expect(servicio.crear(DTO, null, ADMIN)).rejects.toBeInstanceOf(ConflictException);

    expect(manager.insert).not.toHaveBeenCalled();
    // El registro de error lo escribe el filtro de auditoría, no el servicio.
    expect(eventos).toEqual(['rollback']);
    expect(indexacion.avisar).not.toHaveBeenCalled();
  });

  it('dos peticiones simultáneas: la llave primaria repetida (23505) también responde 409', async () => {
    const { servicio, manager } = preparar();
    manager.insert.mockRejectedValue(new QueryFailedError('INSERT', [], Object.assign(new Error('duplicado'), { code: '23505' })));

    await expect(servicio.crear(DTO, null, ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it('otro error de la base de datos se propaga tal cual (no se disfraza de 409)', async () => {
    const { servicio, manager, indexacion } = preparar();
    manager.insert.mockRejectedValue(new QueryFailedError('INSERT', [], Object.assign(new Error('caída'), { code: '57P01' })));

    await expect(servicio.crear(DTO, null, ADMIN)).rejects.toBeInstanceOf(QueryFailedError);
    expect(indexacion.avisar).not.toHaveBeenCalled();
  });

  it('RF-08: si el log falla, la transacción se deshace y no hay aviso a n8n', async () => {
    const { servicio, auditoria, eventos, indexacion } = preparar();
    auditoria.registrar.mockRejectedValue(new Error('no se pudo escribir el log'));

    await expect(servicio.crear(DTO, null, ADMIN)).rejects.toThrow('no se pudo escribir el log');

    expect(eventos).toEqual(['rollback']);
    expect(indexacion.avisar).not.toHaveBeenCalled();
  });

  it('si n8n está caído la persona queda creada: el aviso no se espera', async () => {
    const { servicio, indexacion } = preparar();
    indexacion.avisar.mockReturnValue(new Promise(() => undefined)); // nunca responde

    await expect(servicio.crear(DTO, null, ADMIN)).resolves.toMatchObject({ numeroDocumento: '1043123456' });
  });
});

describe('ms-crear · PersonasController (RNF-01)', () => {
  it('solo el administrador puede crear, y la ruta queda auditada como CREAR', () => {
    const ruta = PersonasController.prototype.crear;
    expect(Reflect.getMetadata(CLAVE_ROLES, ruta)).toEqual([Rol.ADMINISTRADOR]);
    expect(Reflect.getMetadata(CLAVE_AUDITAR, ruta)).toEqual({ tipo: TipoTransaccion.CREAR });
  });
});
