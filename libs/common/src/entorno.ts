/** Lectura de las variables de entorno que comparten los microservicios (ver .env.example). */

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  return valor;
}

function sinBarraFinal(url: string): string {
  return url.replace(/\/+$/, '');
}

export interface ConfiguracionKeycloak {
  /** Emisor (iss) que deben traer los tokens: la URL pública de Keycloak. */
  emisor: string;
  /** Dirección de las llaves públicas, por la red interna de Docker. */
  urlLlaves: string;
}

export function configuracionKeycloak(): ConfiguracionKeycloak {
  const realm = requerida('KEYCLOAK_REALM');
  const publica = sinBarraFinal(requerida('KEYCLOAK_PUBLIC_URL'));
  const interna = sinBarraFinal(process.env.KEYCLOAK_INTERNAL_URL || publica);
  return {
    emisor: `${publica}/realms/${realm}`,
    urlLlaves: `${interna}/realms/${realm}/protocol/openid-connect/certs`,
  };
}

export interface ConfiguracionBaseDeDatos {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface ConfiguracionIndexacion {
  /** Webhook de n8n que actualiza el vector de una persona. Vacío: no se avisa. */
  urlWebhook: string;
}

/** N8N_WEBHOOK_INDEXACION_URL es opcional: sin ella los servicios funcionan, pero no avisan a n8n. */
export function configuracionIndexacion(): ConfiguracionIndexacion {
  return { urlWebhook: (process.env.N8N_WEBHOOK_INDEXACION_URL ?? '').trim() };
}

/** Cada servicio recibe en DB_USER y DB_PASSWORD su propio usuario de base de datos (sección 6.3 del diseño). */
export function configuracionBaseDeDatos(): ConfiguracionBaseDeDatos {
  return {
    host: process.env.DB_HOST || 'postgres',
    port: Number(process.env.DB_PORT || 5432),
    database: requerida('DB_NAME'),
    username: requerida('DB_USER'),
    password: requerida('DB_PASSWORD'),
  };
}
