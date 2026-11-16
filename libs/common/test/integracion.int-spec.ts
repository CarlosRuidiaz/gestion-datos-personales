import 'reflect-metadata';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  INestApplication,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  Auditar,
  AuditoriaService,
  ComunModule,
  configurarAplicacion,
  CrearPersonaDto,
  DocumentoPipe,
  Persona,
  Publico,
  ResultadoTransaccion,
  Rol,
  Roles,
  TipoTransaccion,
  UsuarioActual,
  UsuarioAutenticado,
} from '../src';

/**
 * Prueba de integración de la librería contra PostgreSQL y Keycloak reales.
 * Monta un microservicio mínimo que usa ComunModule igual que lo hará ms-crear,
 * conectado con el usuario usr_crear, y comprueba el guard, las validaciones y,
 * sobre todo, que la operación y su log se guardan en la misma transacción.
 *
 * Se ejecuta con libs/common/pruebas-integracion.sh (necesita los contenedores arriba).
 */

const DOC = '9999999901';
const DOC_FALLIDO = '9999999902';
const DOC_LOG_FALLIDO = '9999999903';

@Controller('personas')
class PersonasController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Post()
  @Roles(Rol.ADMINISTRADOR)
  @Auditar(TipoTransaccion.CREAR)
  async crear(
    @Body() dto: CrearPersonaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Headers('x-provocar') provocar?: string,
  ) {
    await this.dataSource.transaction(async (manager) => {
      if (await manager.existsBy(Persona, { numeroDocumento: dto.numeroDocumento })) {
        throw new ConflictException('La persona ya está registrada');
      }
      await manager.insert(Persona, { ...dto, segundoNombre: dto.segundoNombre ?? null });
      await this.auditoria.registrar(manager, {
        // Un tipo que la base de datos rechaza, para probar que sin log no hay operación.
        tipo: provocar === 'log-invalido' ? ('NO_EXISTE' as TipoTransaccion) : TipoTransaccion.CREAR,
        numeroDocumento: dto.numeroDocumento,
        usuario: usuario.nombre,
        resultado: ResultadoTransaccion.EXITO,
        detalle: { nuevo: dto },
      });
      if (provocar === 'fallo-despues') {
        throw new Error('Fallo provocado después de guardar la persona y su log');
      }
    });
    return { numeroDocumento: dto.numeroDocumento };
  }

  @Get(':documento')
  @Auditar(TipoTransaccion.CONSULTAR)
  async buscar(@Param('documento', DocumentoPipe) documento: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.dataSource.transaction(async (manager) => {
      const persona = await manager.findOneBy(Persona, { numeroDocumento: documento });
      if (!persona) {
        throw new NotFoundException('No hay una persona con ese documento');
      }
      await this.auditoria.registrar(manager, {
        tipo: TipoTransaccion.CONSULTAR,
        numeroDocumento: documento,
        usuario: usuario.nombre,
        resultado: ResultadoTransaccion.EXITO,
      });
      return { numeroDocumento: persona.numeroDocumento, fechaNacimiento: persona.fechaNacimiento };
    });
  }
}

@Controller('health')
class HealthController {
  @Get()
  @Publico()
  salud() {
    return { estado: 'ok' };
  }
}

@Module({ imports: [ComunModule.forRoot()], controllers: [PersonasController, HealthController] })
class AppDePruebaModule {}

const PERSONA = {
  tipoDocumento: 'Cédula',
  numeroDocumento: DOC,
  primerNombre: 'Prueba',
  segundoNombre: '',
  apellidos: 'De Integración',
  fechaNacimiento: '05-mar-2003',
  genero: 'No binario',
  correo: 'prueba.integracion@example.com',
  celular: '3000000000',
};

function entorno(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable ${nombre}. Ejecuta la prueba con pruebas-integracion.sh`);
  return valor;
}

async function pedirToken(usuario: string, clave: string): Promise<string> {
  const url = `${entorno('KEYCLOAK_INTERNAL_URL')}/realms/${entorno('KEYCLOAK_REALM')}/protocol/openid-connect/token`;
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'pruebas', username: usuario, password: clave }),
  });
  const cuerpo = (await respuesta.json()) as { access_token?: string };
  if (!cuerpo.access_token) throw new Error(`Keycloak no entregó un token para ${usuario}`);
  return cuerpo.access_token;
}

describe('ComunModule contra PostgreSQL y Keycloak reales', () => {
  let app: INestApplication;
  let superusuario: Client;
  let tokenAdmin: string;
  let tokenConsultor: string;
  const inicio = new Date();

  /** Registros del log de un documento, leídos con el superusuario (usr_crear no puede leer el log). */
  async function logDe(documento: string) {
    const { rows } = await superusuario.query(
      'SELECT tipo, usuario, resultado, detalle FROM log_transaccion WHERE numero_documento = $1 ORDER BY id',
      [documento],
    );
    return rows as Array<{ tipo: string; usuario: string; resultado: string; detalle: Record<string, any> | null }>;
  }
  async function existePersona(documento: string): Promise<boolean> {
    const { rowCount } = await superusuario.query('SELECT 1 FROM persona WHERE numero_documento = $1', [documento]);
    return rowCount === 1;
  }
  async function limpiar() {
    await superusuario.query("DELETE FROM persona WHERE numero_documento LIKE '99999999%'");
    await superusuario.query(
      "DELETE FROM log_transaccion WHERE numero_documento LIKE '99999999%' OR (usuario IN ('admin.prueba', 'consultor.prueba') AND fecha_hora >= $1)",
      [inicio],
    );
  }

  beforeAll(async () => {
    // El microservicio de prueba se conecta como lo hará ms-crear.
    process.env.DB_NAME = entorno('POSTGRES_DB');
    process.env.DB_USER = 'usr_crear';
    process.env.DB_PASSWORD = entorno('DB_PASSWORD_CREAR');

    superusuario = new Client({
      host: process.env.DB_HOST || 'postgres',
      port: Number(process.env.DB_PORT || 5432),
      database: entorno('POSTGRES_DB'),
      user: entorno('POSTGRES_USER'),
      password: entorno('POSTGRES_PASSWORD'),
    });
    await superusuario.connect();
    await limpiar();

    tokenAdmin = await pedirToken('admin.prueba', entorno('KEYCLOAK_USUARIO_ADMIN_PASSWORD'));
    tokenConsultor = await pedirToken('consultor.prueba', entorno('KEYCLOAK_USUARIO_CONSULTOR_PASSWORD'));

    const modulo = await Test.createTestingModule({ imports: [AppDePruebaModule] }).compile();
    // Sin registro en consola: los errores 500 de estas pruebas son provocados.
    app = modulo.createNestApplication({ logger: false });
    configurarAplicacion(app, { prefijo: 'api/prueba', titulo: 'servicio de prueba' });
    await app.init();
  });

  afterAll(async () => {
    await limpiar();
    await app?.close();
    await superusuario?.end();
  });

  const servidor = () => request(app.getHttpServer());

  it('la ruta pública responde sin token', async () => {
    await servidor().get('/api/prueba/health').expect(200, { estado: 'ok' });
  });

  it('sin token responde 401 y no deja nada en el log', async () => {
    await servidor().post('/api/prueba/personas').send(PERSONA).expect(401);
    await servidor().post('/api/prueba/personas').set('Authorization', 'Bearer token-falso').send(PERSONA).expect(401);
    expect(await logDe(DOC)).toHaveLength(0);
    expect(await existePersona(DOC)).toBe(false);
  });

  it('el consultor recibe 403 en una ruta de escritura y el intento queda en el log', async () => {
    await servidor().post('/api/prueba/personas').set('Authorization', `Bearer ${tokenConsultor}`).send(PERSONA).expect(403);
    const log = await logDe(DOC);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ tipo: 'CREAR', usuario: 'consultor.prueba', resultado: 'ERROR' });
    expect(log[0].detalle?.estado).toBe(403);
    expect(await existePersona(DOC)).toBe(false);
  });

  it('datos inválidos: 400 con la lista de campos, y queda en el log', async () => {
    const respuesta = await servidor()
      .post('/api/prueba/personas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ ...PERSONA, celular: '123', correo: 'sin-arroba' })
      .expect(400);
    expect(respuesta.body.errores).toEqual([
      { campo: 'correo', mensaje: 'El correo electrónico no tiene un formato válido' },
      { campo: 'celular', mensaje: 'El celular debe tener exactamente 10 dígitos' },
    ]);
    const log = await logDe(DOC);
    expect(log).toHaveLength(2);
    expect(log[1]).toMatchObject({ tipo: 'CREAR', usuario: 'admin.prueba', resultado: 'ERROR' });
    expect(log[1].detalle?.estado).toBe(400);
    expect(log[1].detalle?.errores).toHaveLength(2);
  });

  it('crea la persona y su registro de log en la misma transacción', async () => {
    await servidor().post('/api/prueba/personas').set('Authorization', `Bearer ${tokenAdmin}`).send(PERSONA).expect(201);
    expect(await existePersona(DOC)).toBe(true);
    const log = await logDe(DOC);
    expect(log).toHaveLength(3);
    expect(log[2]).toMatchObject({ tipo: 'CREAR', usuario: 'admin.prueba', resultado: 'EXITO' });
    expect(log[2].detalle?.nuevo.fechaNacimiento).toBe('2003-03-05');
  });

  it('documento repetido: 409, y queda en el log', async () => {
    await servidor().post('/api/prueba/personas').set('Authorization', `Bearer ${tokenAdmin}`).send(PERSONA).expect(409);
    const log = await logDe(DOC);
    expect(log).toHaveLength(4);
    expect(log[3]).toMatchObject({ resultado: 'ERROR' });
    expect(log[3].detalle).toMatchObject({ estado: 409, motivo: 'La persona ya está registrada' });
  });

  it('el consultor puede consultar, y la consulta queda en el log', async () => {
    const respuesta = await servidor().get(`/api/prueba/personas/${DOC}`).set('Authorization', `Bearer ${tokenConsultor}`).expect(200);
    expect(respuesta.body).toEqual({ numeroDocumento: DOC, fechaNacimiento: '2003-03-05' });
    const log = await logDe(DOC);
    expect(log[log.length - 1]).toMatchObject({ tipo: 'CONSULTAR', usuario: 'consultor.prueba', resultado: 'EXITO' });
  });

  it('documento no encontrado: 404, y queda en el log', async () => {
    await servidor().get('/api/prueba/personas/9999999999').set('Authorization', `Bearer ${tokenAdmin}`).expect(404);
    const log = await logDe('9999999999');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ tipo: 'CONSULTAR', resultado: 'ERROR' });
  });

  it('documento con letras en la ruta: 400, y el valor recibido queda en el detalle', async () => {
    await servidor().get('/api/prueba/personas/99ABC').set('Authorization', `Bearer ${tokenAdmin}`).expect(400);
    const { rows } = await superusuario.query(
      "SELECT numero_documento FROM log_transaccion WHERE detalle ->> 'documentoRecibido' = '99ABC' AND fecha_hora >= $1",
      [inicio],
    );
    expect(rows).toEqual([{ numero_documento: null }]);
  });

  it('si la operación falla después de guardar, no queda ni la persona ni su log de éxito', async () => {
    await servidor()
      .post('/api/prueba/personas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('x-provocar', 'fallo-despues')
      .send({ ...PERSONA, numeroDocumento: DOC_FALLIDO })
      .expect(500);
    expect(await existePersona(DOC_FALLIDO)).toBe(false);
    const log = await logDe(DOC_FALLIDO);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ tipo: 'CREAR', resultado: 'ERROR' });
    expect(log[0].detalle?.estado).toBe(500);
  });

  it('si el log no se puede escribir, la persona no se guarda', async () => {
    await servidor()
      .post('/api/prueba/personas')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('x-provocar', 'log-invalido')
      .send({ ...PERSONA, numeroDocumento: DOC_LOG_FALLIDO })
      .expect(500);
    expect(await existePersona(DOC_LOG_FALLIDO)).toBe(false);
  });

  it('publica la documentación OpenAPI bajo su prefijo', async () => {
    const respuesta = await servidor().get('/api/prueba/docs-json').expect(200);
    expect(Object.keys(respuesta.body.paths)).toEqual(
      expect.arrayContaining(['/api/prueba/personas', '/api/prueba/personas/{documento}', '/api/prueba/health']),
    );
    expect(respuesta.body.components.schemas.CrearPersonaDto.properties.numeroDocumento).toBeDefined();
  });

  it('el servicio no puede leer, modificar ni borrar el log', async () => {
    const dataSource = app.get(DataSource);
    await expect(dataSource.query('SELECT 1 FROM log_transaccion LIMIT 1')).rejects.toThrow(/permission denied/);
    await expect(dataSource.query("UPDATE log_transaccion SET resultado = 'EXITO'")).rejects.toThrow(/permission denied/);
    await expect(dataSource.query('DELETE FROM log_transaccion')).rejects.toThrow(/permission denied/);
  });
});
