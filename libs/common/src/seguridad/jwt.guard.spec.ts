import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { generateKeyPairSync, KeyObject } from 'crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { sign } from 'jsonwebtoken';
import { Rol, TipoTransaccion } from '../constantes';
import { Auditar, Publico, Roles } from './decoradores';
import { JwtGuard } from './jwt.guard';
import { DatosDePeticion } from './usuario';
import { VerificadorToken } from './verificador-token.service';

/**
 * Prueba el guard con tokens RS256 reales, firmados aquí, y un servidor local que
 * publica la llave pública igual que lo hace Keycloak. No necesita Keycloak.
 */
const REALM = 'realm-de-prueba';
const EMISOR = `http://keycloak.publico.test/realms/${REALM}`;
const KID = 'llave-de-prueba';

class Rutas {
  @Auditar(TipoTransaccion.CREAR)
  @Roles(Rol.ADMINISTRADOR)
  soloAdministrador() {}

  @Auditar(TipoTransaccion.CONSULTAR)
  @Roles(Rol.ADMINISTRADOR, Rol.CONSULTOR)
  ambos() {}

  @Auditar(TipoTransaccion.CONSULTAR)
  sinRolesDeclarados() {}

  @Publico()
  publica() {}
}

describe('JwtGuard', () => {
  let servidor: Server;
  let llavePrivada: KeyObject;
  let otraLlavePrivada: KeyObject;
  let guard: JwtGuard;

  beforeAll(async () => {
    const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
    llavePrivada = par.privateKey;
    otraLlavePrivada = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const jwk = { ...par.publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };

    servidor = createServer((_peticion, respuesta) => {
      respuesta.setHeader('content-type', 'application/json');
      respuesta.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
    const puerto = (servidor.address() as AddressInfo).port;

    // Dos direcciones distintas, como en Docker: las llaves por la interna, el emisor es la pública.
    process.env.KEYCLOAK_REALM = REALM;
    process.env.KEYCLOAK_PUBLIC_URL = 'http://keycloak.publico.test';
    process.env.KEYCLOAK_INTERNAL_URL = `http://127.0.0.1:${puerto}`;
    guard = new JwtGuard(new Reflector(), new VerificadorToken());
  });

  afterAll(async () => {
    await new Promise((cerrado) => servidor.close(cerrado));
  });

  function token(roles: string[], opciones: { emisor?: string; llave?: KeyObject; vence?: number } = {}): string {
    return sign(
      { preferred_username: 'usuario.prueba', realm_access: { roles } },
      opciones.llave ?? llavePrivada,
      {
        algorithm: 'RS256',
        keyid: KID,
        issuer: opciones.emisor ?? EMISOR,
        subject: 'id-123',
        expiresIn: opciones.vence ?? 300,
      },
    );
  }

  function contexto(ruta: keyof Rutas, autorizacion?: string) {
    const peticion: DatosDePeticion & { headers: Record<string, string> } = {
      headers: autorizacion ? { authorization: autorizacion } : {},
    };
    const ejecucion = {
      getHandler: () => Rutas.prototype[ruta],
      getClass: () => Rutas,
      switchToHttp: () => ({ getRequest: () => peticion }),
    } as unknown as ExecutionContext;
    return { ejecucion, peticion };
  }

  it('deja pasar al administrador y entrega el usuario y el tipo de transacción', async () => {
    const { ejecucion, peticion } = contexto('soloAdministrador', `Bearer ${token([Rol.ADMINISTRADOR])}`);
    await expect(guard.canActivate(ejecucion)).resolves.toBe(true);
    expect(peticion.usuario).toEqual({ nombre: 'usuario.prueba', roles: [Rol.ADMINISTRADOR], id: 'id-123' });
    expect(peticion.auditoria).toEqual({ tipo: TipoTransaccion.CREAR });
  });

  it('responde 403 al consultor en una ruta de escritura, y deja sus datos para el log', async () => {
    const { ejecucion, peticion } = contexto('soloAdministrador', `Bearer ${token([Rol.CONSULTOR])}`);
    await expect(guard.canActivate(ejecucion)).rejects.toBeInstanceOf(ForbiddenException);
    expect(peticion.usuario?.nombre).toBe('usuario.prueba');
    expect(peticion.auditoria).toEqual({ tipo: TipoTransaccion.CREAR });
  });

  it('deja pasar al consultor en las rutas de consulta', async () => {
    await expect(guard.canActivate(contexto('ambos', `Bearer ${token([Rol.CONSULTOR])}`).ejecucion)).resolves.toBe(true);
  });

  it('sin @Roles exige uno de los dos roles de la aplicación', async () => {
    await expect(
      guard.canActivate(contexto('sinRolesDeclarados', `Bearer ${token([Rol.CONSULTOR])}`).ejecucion),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contexto('sinRolesDeclarados', `Bearer ${token(['otro-rol'])}`).ejecucion),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('responde 401 sin token o con una cabecera mal formada', async () => {
    for (const cabecera of [undefined, 'Bearer', 'Basic abc', 'no-es-un-token']) {
      const { ejecucion, peticion } = contexto('ambos', cabecera);
      await expect(guard.canActivate(ejecucion)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(peticion.usuario).toBeUndefined();
    }
  });

  it('responde 401 con un token vencido', async () => {
    const vencido = token([Rol.ADMINISTRADOR], { vence: -10 });
    await expect(guard.canActivate(contexto('ambos', `Bearer ${vencido}`).ejecucion)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('responde 401 con un token de otro emisor', async () => {
    const ajeno = token([Rol.ADMINISTRADOR], { emisor: 'http://otro-keycloak.test/realms/otro' });
    await expect(guard.canActivate(contexto('ambos', `Bearer ${ajeno}`).ejecucion)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('responde 401 con un token firmado con otra llave', async () => {
    const falso = token([Rol.ADMINISTRADOR], { llave: otraLlavePrivada });
    await expect(guard.canActivate(contexto('ambos', `Bearer ${falso}`).ejecucion)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('responde 401 con un token sin firma (alg none)', async () => {
    const cuerpo = Buffer.from(JSON.stringify({ iss: EMISOR, realm_access: { roles: [Rol.ADMINISTRADOR] } })).toString('base64url');
    const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    await expect(
      guard.canActivate(contexto('ambos', `Bearer ${cabecera}.${cuerpo}.`).ejecucion),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('las rutas públicas no piden token', async () => {
    await expect(guard.canActivate(contexto('publica').ejecucion)).resolves.toBe(true);
  });
});
