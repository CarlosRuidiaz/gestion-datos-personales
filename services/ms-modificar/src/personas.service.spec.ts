import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CLAVE_AUDITAR,
  CLAVE_ROLES,
  CONTEXTO_PREVIO_MODIFICAR,
  Persona,
  ResultadoTransaccion,
  Rol,
  TipoTransaccion,
} from '@gdp/common';
import { ADMIN, crearEntorno, personaEjemplo } from '../../pruebas-comunes';
import { ActualizarPersonaDto } from './actualizar-persona.dto';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

const DOC = '1043123456';

/** Los datos de la persona de ejemplo, tal como los manda el formulario. */
const IGUAL: ActualizarPersonaDto = {
  tipoDocumento: 'Cédula',
  primerNombre: 'Pedro',
  segundoNombre: 'Andrés',
  apellidos: 'Pérez Gómez',
  fechaNacimiento: '2003-03-05',
  genero: 'Masculino',
  correo: 'pedro.perez@example.com',
  celular: '3001234567',
};

function preparar(existente: Persona | null = personaEjemplo()) {
  const entorno = crearEntorno();
  const servicio = new PersonasService(entorno.dataSource as never, entorno.auditoria as never, entorno.indexacion as never);
  entorno.manager.findOneBy.mockResolvedValue(existente);
  entorno.manager.findOne.mockResolvedValue(existente);
  entorno.manager.update.mockResolvedValue(undefined);
  entorno.manager.findOneByOrFail.mockImplementation(async () => existente);
  return { ...entorno, servicio };
}

describe('ms-modificar · PersonasService.buscar (búsqueda previa)', () => {
  it('devuelve la ficha con la foto y la deja en el log como CONSULTAR con su contexto', async () => {
    const { servicio, registroDeLog, eventos, auditoria, manager } = preparar(personaEjemplo({ foto: Buffer.from('x'), fotoTipo: 'image/png' }));

    const respuesta = await servicio.buscar(DOC, ADMIN);

    expect(auditoria.registrar.mock.calls[0][0]).toBe(manager); // el log va en la transacción

    expect(respuesta.foto).toMatch(/^data:image\/png;base64,/);
    expect(registroDeLog()).toMatchObject({
      tipo: TipoTransaccion.CONSULTAR,
      numeroDocumento: DOC,
      usuario: 'admin.prueba',
      resultado: ResultadoTransaccion.EXITO,
      detalle: { contexto: CONTEXTO_PREVIO_MODIFICAR },
    });
    expect(eventos).toEqual(['log', 'commit']);
  });

  it('un documento que no existe responde 404 y no escribe el log de éxito', async () => {
    const { servicio, auditoria } = preparar(null);
    await expect(servicio.buscar(DOC, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});

describe('ms-modificar · PersonasService.modificar', () => {
  it('CP-04: al cambiar el correo actualiza solo ese campo y el log guarda el valor anterior y el nuevo', async () => {
    const { servicio, manager, registroDeLog, eventos, indexacion, auditoria } = preparar();

    await servicio.modificar(DOC, { ...IGUAL, correo: 'nuevo@example.com' }, null, ADMIN);

    expect(auditoria.registrar.mock.calls[0][0]).toBe(manager); // el log va en la misma transacción

    expect(manager.update).toHaveBeenCalledWith(Persona, { numeroDocumento: DOC }, { correo: 'nuevo@example.com' });
    expect(registroDeLog()).toMatchObject({
      tipo: TipoTransaccion.MODIFICAR,
      numeroDocumento: DOC,
      resultado: ResultadoTransaccion.EXITO,
      detalle: { anterior: { correo: 'pedro.perez@example.com' }, nuevo: { correo: 'nuevo@example.com' } },
    });
    expect(Object.keys(registroDeLog().detalle.nuevo)).toEqual(['correo']);
    expect(eventos).toEqual(['log', 'commit', 'aviso']);
    expect(indexacion.avisar).toHaveBeenCalledWith(DOC, TipoTransaccion.MODIFICAR);
  });

  it('bloquea la fila mientras modifica, para que dos modificaciones simultáneas se apliquen una tras otra', async () => {
    const { servicio, manager } = preparar();
    await servicio.modificar(DOC, IGUAL, null, ADMIN);
    expect(manager.findOne).toHaveBeenCalledWith(Persona, {
      where: { numeroDocumento: DOC },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('el número de documento no se puede cambiar: nunca entra en el UPDATE', async () => {
    const { servicio, manager } = preparar();
    const dto = { ...IGUAL, correo: 'otro@example.com', numeroDocumento: '9999999999' } as ActualizarPersonaDto;

    await servicio.modificar(DOC, dto, null, ADMIN);

    expect(manager.update.mock.calls[0][1]).toEqual({ numeroDocumento: DOC });
    expect(manager.update.mock.calls[0][2]).not.toHaveProperty('numeroDocumento');
  });

  it('un documento que no existe responde 404 sin actualizar, sin log de éxito y sin aviso', async () => {
    const { servicio, manager, auditoria, indexacion } = preparar(null);

    await expect(servicio.modificar(DOC, IGUAL, null, ADMIN)).rejects.toBeInstanceOf(NotFoundException);

    expect(manager.update).not.toHaveBeenCalled();
    expect(auditoria.registrar).not.toHaveBeenCalled();
    expect(indexacion.avisar).not.toHaveBeenCalled();
  });

  it('sin cambios no actualiza la base, lo deja anotado en el log y no avisa a n8n', async () => {
    const { servicio, manager, registroDeLog, indexacion } = preparar();

    await servicio.modificar(DOC, IGUAL, null, ADMIN);

    expect(manager.update).not.toHaveBeenCalled();
    expect(registroDeLog().detalle).toMatchObject({ anterior: {}, nuevo: {}, sinCambios: true });
    expect(indexacion.avisar).not.toHaveBeenCalled();
  });

  it('el segundo nombre se puede quitar: queda como null', async () => {
    const { servicio, manager, registroDeLog } = preparar();

    await servicio.modificar(DOC, { ...IGUAL, segundoNombre: undefined }, null, ADMIN);

    expect(manager.update.mock.calls[0][2]).toEqual({ segundoNombre: null });
    expect(registroDeLog().detalle.anterior).toEqual({ segundoNombre: 'Andrés' });
    expect(registroDeLog().detalle.nuevo).toEqual({ segundoNombre: null });
  });

  it('registra cada campo que cambió, y solo esos', async () => {
    const { servicio, registroDeLog } = preparar();

    await servicio.modificar(DOC, { ...IGUAL, primerNombre: 'Pablo', celular: '3109998877' }, null, ADMIN);

    expect(Object.keys(registroDeLog().detalle.nuevo).sort()).toEqual(['celular', 'primerNombre']);
  });

  describe('foto', () => {
    it('una foto nueva en una persona sin foto queda «agregada»', async () => {
      const { servicio, manager, registroDeLog } = preparar();
      const foto = Buffer.from('nueva');

      await servicio.modificar(DOC, IGUAL, { foto, fotoTipo: 'image/png' } as never, ADMIN);

      expect(manager.update.mock.calls[0][2]).toEqual({ foto, fotoTipo: 'image/png' });
      expect(registroDeLog().detalle.foto).toBe('agregada');
      expect(JSON.stringify(registroDeLog().detalle)).not.toContain('nueva');
    });

    it('una foto nueva en una persona con foto queda «reemplazada»', async () => {
      const { servicio, registroDeLog } = preparar(personaEjemplo({ foto: Buffer.from('vieja'), fotoTipo: 'image/png' }));
      await servicio.modificar(DOC, IGUAL, { foto: Buffer.from('nueva'), fotoTipo: 'image/jpeg' } as never, ADMIN);
      expect(registroDeLog().detalle.foto).toBe('reemplazada');
    });

    it('eliminarFoto quita la foto que había', async () => {
      const { servicio, manager, registroDeLog } = preparar(personaEjemplo({ foto: Buffer.from('vieja'), fotoTipo: 'image/png' }));

      await servicio.modificar(DOC, { ...IGUAL, eliminarFoto: true }, null, ADMIN);

      expect(manager.update.mock.calls[0][2]).toEqual({ foto: null, fotoTipo: null });
      expect(registroDeLog().detalle.foto).toBe('eliminada');
    });

    it('eliminarFoto en una persona sin foto no cambia nada', async () => {
      const { servicio, manager } = preparar();
      await servicio.modificar(DOC, { ...IGUAL, eliminarFoto: true }, null, ADMIN);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('sin archivo ni eliminarFoto, la foto se conserva', async () => {
      const { servicio, manager } = preparar(personaEjemplo({ foto: Buffer.from('vieja'), fotoTipo: 'image/png' }));
      await servicio.modificar(DOC, { ...IGUAL, correo: 'otro@example.com' }, null, ADMIN);
      expect(manager.update.mock.calls[0][2]).not.toHaveProperty('foto');
    });

    it('cambiar solo la foto no avisa a n8n: la foto no forma parte del texto indexado', async () => {
      const { servicio, indexacion } = preparar();
      await servicio.modificar(DOC, IGUAL, { foto: Buffer.from('x'), fotoTipo: 'image/png' } as never, ADMIN);
      expect(indexacion.avisar).not.toHaveBeenCalled();
    });
  });

  it('RF-08: si el log falla, la modificación se deshace y no hay aviso a n8n', async () => {
    const { servicio, auditoria, eventos, indexacion } = preparar();
    auditoria.registrar.mockRejectedValue(new Error('log caído'));

    await expect(servicio.modificar(DOC, { ...IGUAL, correo: 'otro@example.com' }, null, ADMIN)).rejects.toThrow('log caído');

    expect(eventos).toEqual(['rollback']);
    expect(indexacion.avisar).not.toHaveBeenCalled();
  });
});

describe('ms-modificar · ActualizarPersonaDto.eliminarFoto', () => {
  const convertir = (eliminarFoto: unknown) =>
    plainToInstance(ActualizarPersonaDto, { ...IGUAL, eliminarFoto }).eliminarFoto;

  it('en un formulario multipart llega como texto: «true» y «1» son verdadero', () => {
    expect(convertir('true')).toBe(true);
    expect(convertir('1')).toBe(true);
    expect(convertir(true)).toBe(true);
  });

  it('«false», «0», vacío o ausente son falso', () => {
    expect(convertir('false')).toBe(false);
    expect(convertir('0')).toBe(false);
    expect(convertir('')).toBe(false);
    expect(convertir(undefined)).toBe(false);
  });

  it('un valor que no es booleano se rechaza', async () => {
    const dto = plainToInstance(ActualizarPersonaDto, { ...IGUAL, eliminarFoto: 'quizás' });
    const errores = await validate(dto);
    expect(errores.map((e) => e.property)).toContain('eliminarFoto');
  });
});

describe('ms-modificar · PersonasController (RNF-01)', () => {
  it('todo el controlador es solo para el administrador', () => {
    expect(Reflect.getMetadata(CLAVE_ROLES, PersonasController)).toEqual([Rol.ADMINISTRADOR]);
  });

  it('la búsqueda previa se audita como CONSULTAR con su contexto y la modificación como MODIFICAR', () => {
    expect(Reflect.getMetadata(CLAVE_AUDITAR, PersonasController.prototype.buscar)).toEqual({
      tipo: TipoTransaccion.CONSULTAR,
      contexto: CONTEXTO_PREVIO_MODIFICAR,
    });
    expect(Reflect.getMetadata(CLAVE_AUDITAR, PersonasController.prototype.modificar)).toEqual({ tipo: TipoTransaccion.MODIFICAR });
  });
});
