# keycloak

Configuración versionada de Keycloak, el proveedor de identidad (OpenID Connect). Referencia: secciones 5.2 y 9 de `docs/diseno/documento_diseno.md`.

| Archivo | Qué hace |
| --- | --- |
| `realm.json` | Define el realm `gestion-personas`: clientes, roles y usuarios de prueba. Keycloak lo importa solo al arrancar |
| `verificar.sh` | Comprueba el realm, los roles, los usuarios y el login con PKCE |

## Qué contiene el realm

| Elemento | Valor |
| --- | --- |
| Realm | `gestion-personas` |
| Roles | `administrador` y `consultor` (roles de realm, en minúscula) |
| Cliente `frontend` | Público, flujo de código de autorización con PKCE (S256) obligatorio. Vuelve a `http://localhost/*` (aplicación) y a `http://localhost:5173/*` (Vite en desarrollo) |
| Cliente `pruebas` | Público, solo para Postman y scripts: entrega tokens con usuario y contraseña. El frontend no lo usa |
| Usuario `admin.prueba` | Rol `administrador`. Contraseña: `KEYCLOAK_USUARIO_ADMIN_PASSWORD` de `.env` |
| Usuario `consultor.prueba` | Rol `consultor`. Contraseña: `KEYCLOAK_USUARIO_CONSULTOR_PASSWORD` de `.env` |
| Token de acceso | Dura 5 minutos y se renueva con el token de renovación. La sesión se cierra tras 30 minutos sin uso |

Ninguna contraseña está en `realm.json`: Keycloak las toma de las variables de entorno al importar.

## Direcciones

- Consola de administración: <http://localhost:8080>, con `KEYCLOAK_ADMIN` y `KEYCLOAK_ADMIN_PASSWORD` de `.env`. Ese administrador es de Keycloak, no de la aplicación.
- Emisor de los tokens (`iss`): `http://localhost:8080/realms/gestion-personas`, siempre, aunque se pida desde dentro de Docker.
- Descubrimiento OIDC: `http://localhost:8080/realms/gestion-personas/.well-known/openid-configuration`.
- Llaves públicas desde un contenedor de la red `frontal`: `http://keycloak:8080/realms/gestion-personas/protocol/openid-connect/certs`.

## Verificar

Con el contenedor `keycloak` arriba, desde la raíz del repositorio (en Windows, con Git Bash):

```bash
bash keycloak/verificar.sh
```

Debe terminar con `TODO BIEN`. Tarda cerca de un minuto en estar listo después de `docker compose up -d`.

## Cambiar la configuración

Keycloak importa `realm.json` **solo si el realm no existe**. Si cambias el archivo o las contraseñas de los usuarios de prueba, borra el volumen de Keycloak para que se importe de nuevo (no toca la base de datos):

```bash
docker compose rm -sf keycloak
docker volume rm gestion-datos-personales_keycloak_data
docker compose up -d keycloak
```

Lo que se cambie a mano en la consola no queda en el repositorio. Todo cambio que deba compartirse va en `realm.json`.

## Para quien programe contra Keycloak

**Guard JWT de los microservicios (T05):**

- Los tokens se firman con RS256. Las llaves se leen de la URL interna (`KEYCLOAK_INTERNAL_URL`), pero el emisor que se valida es el público (`KEYCLOAK_PUBLIC_URL` + `/realms/` + `KEYCLOAK_REALM`). Son dos direcciones distintas a propósito.
- Los roles están en `realm_access.roles`, por ejemplo `["administrador"]`.
- El usuario que va al log es `preferred_username`.
- El token no trae `aud`. No se debe exigir una audiencia; se validan firma, emisor y vigencia.

**Frontend (T11):**

- Cliente `frontend`, sin secreto. PKCE con S256 es obligatorio: sin `code_challenge` Keycloak rechaza el login.
- Las direcciones de retorno deben empezar por `http://localhost/` o `http://localhost:5173/`. Si el frontend usa otra, hay que agregarla en `realm.json`.

**Pruebas y Postman (T18 y T19):** un token de un usuario de prueba se pide así, sin navegador:

```bash
curl -s -X POST http://localhost:8080/realms/gestion-personas/protocol/openid-connect/token \
  -d grant_type=password -d client_id=pruebas \
  -d username=admin.prueba --data-urlencode "password=LA_CONTRASEÑA_DE_TU_ENV"
```
