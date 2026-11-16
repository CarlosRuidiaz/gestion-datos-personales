import { Injectable } from '@nestjs/common';
import { JwtPayload, verify } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { configuracionKeycloak, ConfiguracionKeycloak } from '../entorno';
import { UsuarioAutenticado } from './usuario';

/**
 * Valida los tokens de acceso de Keycloak: firma (RS256, con la llave pública del realm),
 * emisor y vigencia. No exige audiencia, porque los tokens de este realm no traen «aud».
 *
 * Las llaves se leen por la red interna de Docker, pero el emisor que se valida es la
 * URL pública de Keycloak, que es la que queda escrita en el token (ver keycloak/README.md).
 */
@Injectable()
export class VerificadorToken {
  private readonly configuracion: ConfiguracionKeycloak;
  private readonly llaves: JwksClient;

  constructor() {
    this.configuracion = configuracionKeycloak();
    this.llaves = new JwksClient({
      jwksUri: this.configuracion.urlLlaves,
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      timeout: 5000,
    });
  }

  /** Devuelve el usuario del token o lanza un error si el token no es válido. */
  async verificar(token: string): Promise<UsuarioAutenticado> {
    const contenido = await new Promise<JwtPayload>((resolver, rechazar) => {
      verify(
        token,
        (cabecera, entregar) => {
          this.llaves
            .getSigningKey(cabecera.kid)
            .then((llave) => entregar(null, llave.getPublicKey()))
            .catch((error) => entregar(error));
        },
        { algorithms: ['RS256'], issuer: this.configuracion.emisor },
        (error, decodificado) => {
          if (error || !decodificado || typeof decodificado === 'string') {
            rechazar(error ?? new Error('Token sin contenido'));
          } else {
            resolver(decodificado);
          }
        },
      );
    });

    const roles = contenido.realm_access?.roles;
    return {
      nombre: String(contenido.preferred_username ?? contenido.sub ?? 'desconocido'),
      roles: Array.isArray(roles) ? roles.map(String) : [],
      id: String(contenido.sub ?? ''),
    };
  }
}
