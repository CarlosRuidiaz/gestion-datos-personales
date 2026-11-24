import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import {
  CLAVE_AUDITAR,
  CLAVE_PUBLICO,
  CLAVE_ROLES,
  LogTransaccion,
  ResultadoTransaccion,
  TipoTransaccion,
} from '@gdp/common';
import { crearEntorno } from '../../pruebas-comunes';
import { USUARIO_N8N } from './consulta-nl.dto';
import { TAMANO_POR_DEFECTO } from './filtros-log.dto';
import { LlaveApiGuard } from './llave-api.guard';
import { LogController } from './log.controller';
import { LogService } from './log.service';

function registro(sobre: Partial<LogTransaccion> = {}): LogTransaccion {
  return Object.assign(new LogTransaccion(), {
    id: '7',
    fechaHora: new Date('2026-11-22T15:30:00Z'),
    tipo: TipoTransaccion.CREAR,
    numeroDocumento: '1043123456',
    usuario: 'admin.prueba',
    resultado: ResultadoTransaccion.EXITO,
    detalle: { nuevo: { primerNombre: 'Pedro' } },
    pregunta: null,
    respuesta: null,
    ...sobre,
  });
}

/** Constructor de consultas falso: anota cada condición y devuelve las filas que se le indiquen. */
function preparar(filas: LogTransaccion[] = [], total = filas.length) {
  const entorno = crearEntorno();
  const consulta = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([filas, total]),
  };
  entorno.dataSource.getRepository.mockReturnValue({ createQueryBuilder: jest.fn().mockReturnValue(consulta) });
  const servicio = new LogService(entorno.dataSource as never, entorno.auditoria as never);
  const condiciones = () => consulta.andWhere.mock.calls.map(([texto]) => texto as string);
  return { ...entorno, servicio, consulta, condiciones };
}

describe('ms-log · LogService.consultar (RF-07, CP-06)', () => {
  it('sin filtros no agrega ninguna condición y usa la paginación por defecto', async () => {
    const { servicio, consulta, condiciones } = preparar([registro()], 1);

    const pagina = await servicio.consultar({});

    expect(condiciones()).toEqual([]);
    expect(consulta.skip).toHaveBeenCalledWith(0);
    expect(consulta.take).toHaveBeenCalledWith(TAMANO_POR_DEFECTO);
    expect(pagina).toMatchObject({ total: 1, pagina: 1, tamano: TAMANO_POR_DEFECTO });
  });

  it('filtra por tipo con un parámetro (consulta parametrizada, sin concatenar texto)', async () => {
    const { servicio, consulta } = preparar();
    await servicio.consultar({ tipo: TipoTransaccion.MODIFICAR });
    expect(consulta.andWhere).toHaveBeenCalledWith('log.tipo = :tipo', { tipo: 'MODIFICAR' });
  });

  it('filtra por número de documento', async () => {
    const { servicio, consulta } = preparar();
    await servicio.consultar({ documento: '1043123456' });
    expect(consulta.andWhere).toHaveBeenCalledWith('log.numeroDocumento = :documento', { documento: '1043123456' });
  });

  it('«desde» incluye todo ese día y «hasta» incluye todo su último día (hasta + 1 día, exclusivo)', async () => {
    const { servicio, consulta } = preparar();

    await servicio.consultar({ desde: '2026-11-01', hasta: '2026-11-30' });

    const [textoDesde, paramsDesde] = consulta.andWhere.mock.calls[0];
    const [textoHasta, paramsHasta] = consulta.andWhere.mock.calls[1];
    expect(textoDesde).toContain('log.fechaHora >=');
    expect(paramsDesde).toMatchObject({ desde: '2026-11-01', zona: expect.any(String) });
    expect(textoHasta).toContain('log.fechaHora <');
    expect(textoHasta).toContain(':hasta AS date) + 1');
    expect(paramsHasta).toMatchObject({ hasta: '2026-11-30', zona: expect.any(String) });
  });

  it('los filtros se combinan: tipo, documento y fechas a la vez', async () => {
    const { servicio, condiciones } = preparar();
    await servicio.consultar({ tipo: TipoTransaccion.BORRAR, documento: '1043123456', desde: '2026-11-01', hasta: '2026-11-30' });
    expect(condiciones()).toHaveLength(4);
  });

  it('«desde» y «hasta» el mismo día es válido (ese día completo)', async () => {
    const { servicio } = preparar();
    await expect(servicio.consultar({ desde: '2026-11-22', hasta: '2026-11-22' })).resolves.toBeDefined();
  });

  it('«desde» posterior a «hasta» responde 400 con el campo «hasta» y no consulta la base', async () => {
    const { servicio, consulta } = preparar();

    const error = await servicio.consultar({ desde: '2026-12-31', hasta: '2026-01-01' }).catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse().errores).toEqual([expect.objectContaining({ campo: 'hasta' })]);
    expect(consulta.getManyAndCount).not.toHaveBeenCalled();
  });

  it('ordena del más reciente al más antiguo, y por id para desempatar', async () => {
    const { servicio, consulta } = preparar();
    await servicio.consultar({});
    expect(consulta.orderBy).toHaveBeenCalledWith('log.fechaHora', 'DESC');
    expect(consulta.addOrderBy).toHaveBeenCalledWith('log.id', 'DESC');
  });

  it('pagina: la página 3 de 10 registros salta los primeros 20', async () => {
    const { servicio, consulta } = preparar([], 45);

    const pagina = await servicio.consultar({ pagina: 3, tamano: 10 });

    expect(consulta.skip).toHaveBeenCalledWith(20);
    expect(consulta.take).toHaveBeenCalledWith(10);
    expect(pagina).toMatchObject({ total: 45, pagina: 3, tamano: 10, registros: [] });
  });

  it('devuelve cada registro con la fecha en ISO 8601 y las columnas en camelCase', async () => {
    const { servicio } = preparar([registro()], 1);

    const { registros } = await servicio.consultar({});

    expect(registros[0]).toEqual({
      id: '7',
      fechaHora: '2026-11-22T15:30:00.000Z',
      tipo: 'CREAR',
      numeroDocumento: '1043123456',
      usuario: 'admin.prueba',
      resultado: 'EXITO',
      detalle: { nuevo: { primerNombre: 'Pedro' } },
      pregunta: null,
      respuesta: null,
    });
  });
});

describe('ms-log · LogService.registrarConsultaNl (sección 7.2)', () => {
  it('registra CONSULTA_NL con la pregunta, la respuesta y n8n como usuario, sin documento', async () => {
    const { servicio, auditoria, dataSource } = preparar();

    await servicio.registrarConsultaNl({
      pregunta: '¿Cuál es el empleado más joven?',
      respuesta: 'Isabella Cardona Ruiz',
      resultado: 'EXITO',
      detalle: { sesion: 'abc' },
    });

    expect(auditoria.registrar).toHaveBeenCalledWith(dataSource.manager, {
      tipo: TipoTransaccion.CONSULTA_NL,
      numeroDocumento: null,
      usuario: USUARIO_N8N,
      resultado: ResultadoTransaccion.EXITO,
      detalle: { sesion: 'abc' },
      pregunta: '¿Cuál es el empleado más joven?',
      respuesta: 'Isabella Cardona Ruiz',
    });
  });

  it('si el modelo falló y no hay respuesta ni detalle, los guarda como null (resultado ERROR)', async () => {
    const { servicio, registroDeLog } = preparar();

    await servicio.registrarConsultaNl({ pregunta: '¿Y el mayor?', resultado: 'ERROR' });

    expect(registroDeLog()).toMatchObject({ resultado: ResultadoTransaccion.ERROR, respuesta: null, detalle: null });
  });

  it('si no se puede escribir en el log, el error llega a n8n (no responde 201 en falso)', async () => {
    const { servicio, auditoria } = preparar();
    auditoria.registrar.mockRejectedValue(new Error('log caído'));

    await expect(servicio.registrarConsultaNl({ pregunta: 'hola', resultado: 'EXITO' })).rejects.toThrow('log caído');
    expect(auditoria.registrarAparte).not.toHaveBeenCalled();
  });
});

describe('ms-log · LlaveApiGuard (llave de API de n8n)', () => {
  const LLAVE = 'llave-de-prueba-larga-0123456789';
  const original = process.env.N8N_LOG_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.N8N_LOG_API_KEY;
    else process.env.N8N_LOG_API_KEY = original;
  });

  function contexto(headers: Record<string, unknown>) {
    const peticion: Record<string, any> = { headers };
    return { peticion, contexto: { switchToHttp: () => ({ getRequest: () => peticion }) } as never };
  }

  function guard(llave: string | undefined = LLAVE) {
    if (llave === undefined) delete process.env.N8N_LOG_API_KEY;
    else process.env.N8N_LOG_API_KEY = llave;
    return new LlaveApiGuard();
  }

  it('con la llave correcta deja pasar y pone a n8n como usuario de la petición', () => {
    const { peticion, contexto: ctx } = contexto({ 'x-api-key': LLAVE });
    expect(guard().canActivate(ctx)).toBe(true);
    expect(peticion.usuario).toEqual({ nombre: USUARIO_N8N, roles: [], id: USUARIO_N8N });
  });

  it('sin llave responde 401', () => {
    expect(() => guard().canActivate(contexto({}).contexto)).toThrow('Falta la llave de API');
  });

  it('con la llave vacía responde 401', () => {
    expect(() => guard().canActivate(contexto({ 'x-api-key': '' }).contexto)).toThrow('Falta la llave de API');
  });

  it('con una llave distinta responde 401, aunque tenga el mismo largo', () => {
    const casi = LLAVE.slice(0, -1) + 'X';
    expect(() => guard().canActivate(contexto({ 'x-api-key': casi }).contexto)).toThrow('no es válida');
  });

  it('con una llave más corta o más larga responde 401 sin lanzar otro tipo de error', () => {
    expect(() => guard().canActivate(contexto({ 'x-api-key': 'corta' }).contexto)).toThrow('no es válida');
    expect(() => guard().canActivate(contexto({ 'x-api-key': LLAVE + LLAVE }).contexto)).toThrow('no es válida');
  });

  it('una llave repetida en la cabecera (arreglo) no se acepta', () => {
    expect(() => guard().canActivate(contexto({ 'x-api-key': [LLAVE, LLAVE] }).contexto)).toThrow('Falta la llave de API');
  });

  it('si el servidor no tiene N8N_LOG_API_KEY configurada rechaza todo, incluso una llave vacía o cualquiera', () => {
    const g = guard(undefined);
    expect(() => g.canActivate(contexto({ 'x-api-key': '' }).contexto)).toThrow();
    expect(() => g.canActivate(contexto({ 'x-api-key': 'cualquiera' }).contexto)).toThrow();
  });

  it('no deja usuario en la petición cuando la llave es incorrecta', () => {
    const { peticion, contexto: ctx } = contexto({ 'x-api-key': 'otra' });
    expect(() => guard().canActivate(ctx)).toThrow();
    expect(peticion.usuario).toBeUndefined();
  });
});

describe('ms-log · LogController (RNF-01)', () => {
  it('GET /api/log lo ven los dos roles y no se audita (revisar el log no es una transacción)', () => {
    expect(Reflect.getMetadata(CLAVE_ROLES, LogController.prototype.consultar)).toBeUndefined();
    expect(Reflect.getMetadata(CLAVE_AUDITAR, LogController.prototype.consultar)).toBeUndefined();
    expect(Reflect.getMetadata(CLAVE_PUBLICO, LogController.prototype.consultar)).toBeUndefined();
  });

  it('POST /api/log/consulta-nl no usa token de Keycloak: es pública para el guard JWT pero la protege la llave de API', () => {
    const ruta = LogController.prototype.registrarConsultaNl;
    expect(Reflect.getMetadata(CLAVE_PUBLICO, ruta)).toBe(true);
    expect(Reflect.getMetadata('__guards__', ruta)).toContain(LlaveApiGuard);
    expect(Reflect.getMetadata(CLAVE_AUDITAR, ruta)).toEqual({ tipo: TipoTransaccion.CONSULTA_NL });
  });
});
