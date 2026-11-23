# libs/common (`@gdp/common`)

Librería compartida por los cinco microservicios (sección 5.3 del diseño). Cada servicio la compila dentro de su propio contenedor.

Cambiar algo aquí afecta a todos los servicios: regístralo en la sección 7 de `CONTEXTO.md` y avisa al grupo.

## Qué ofrece

| Pieza | Para qué |
| --- | --- |
| `ComunModule.forRoot()` | Un solo `import` que deja listo el servicio: conexión a PostgreSQL, guard JWT, validación de DTO y filtro de auditoría |
| `configurarAplicacion(app, opciones)` | Prefijo de ruta del servicio y documentación OpenAPI en `/<prefijo>/docs` |
| `Persona`, `LogTransaccion` | Entidades de TypeORM de las tablas `persona` y `log_transaccion` |
| `CrearPersonaDto`, `ModificarPersonaDto` | Validaciones de la sección 3.3, con los mensajes en español |
| `PersonaRespuesta`, `aPersonaRespuesta(persona, { incluirFoto })` | Forma única en que los servicios devuelven una persona. Con `incluirFoto`, la foto va como `data:image/...;base64,...` |
| `datosParaLog(persona)` | Datos de la persona para el detalle del log, sin la foto |
| `DocumentoPipe` | Valida el documento de la ruta (`/personas/:documento`) |
| `validarFoto(archivo)` | Foto opcional, JPG o PNG reales (por contenido) de máximo 2 MB |
| `parsearFecha`, `formatearFecha` | Fechas `dd-mmm-yyyy` y `yyyy-mm-dd` |
| `@Roles`, `@Publico`, `@Auditar`, `@UsuarioActual` | Decoradores de las rutas |
| `AuditoriaService` | Escribe en el log dentro de la transacción de la operación |
| `AvisoIndexacionService` | Avisa a n8n que una persona cambió (T16), después del commit y sin esperar la respuesta |
| `Rol`, `TipoTransaccion`, `ResultadoTransaccion`, `TIPOS_DOCUMENTO`, `GENEROS` | Valores del dominio |

## Las tres reglas para escribir un microservicio

1. **Toda ruta protegida lleva `@Auditar(tipo)`**, y `@Roles(...)` si no es para los dos roles. Sin `@Auditar`, las peticiones rechazadas de esa ruta no quedan en el log.
2. **Operación exitosa: el log se escribe dentro de la transacción**, con el mismo `manager`. Así no puede quedar una operación sin su registro (DD-02).
3. **Petición rechazada: solo se lanza la excepción de Nest** (`NotFoundException`, `ConflictException`...). El filtro de auditoría escribe el registro de error. No hay que registrarlo a mano.

```ts
@Controller('personas')
export class PersonasController {
  constructor(private readonly dataSource: DataSource, private readonly auditoria: AuditoriaService) {}

  @Post()
  @Roles(Rol.ADMINISTRADOR)
  @Auditar(TipoTransaccion.CREAR)
  async crear(@Body() dto: CrearPersonaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.dataSource.transaction(async (manager) => {
      if (await manager.existsBy(Persona, { numeroDocumento: dto.numeroDocumento })) {
        throw new ConflictException('La persona ya está registrada');   // 409: lo registra el filtro
      }
      await manager.insert(Persona, { ...dto, segundoNombre: dto.segundoNombre ?? null });
      await this.auditoria.registrar(manager, {
        tipo: TipoTransaccion.CREAR,
        numeroDocumento: dto.numeroDocumento,
        usuario: usuario.nombre,
        resultado: ResultadoTransaccion.EXITO,
        detalle: { nuevo: dto },
      });
    });
  }
}
```

Qué hace cada pieza automáticamente:

| Situación | Respuesta | Log |
| --- | --- | --- |
| Sin token, o token inválido o vencido | 401 | No se registra (no hay usuario) |
| Rol sin permiso | 403 | ERROR, con el usuario y el tipo de la ruta |
| Datos inválidos | 400 con `errores: [{ campo, mensaje }]` | ERROR, con la lista de errores en el detalle |
| `NotFoundException`, `ConflictException` | 404, 409 | ERROR, con el motivo |
| Fallo inesperado | 500 | ERROR. La transacción se deshace: no queda la operación ni su log de éxito |

Formato del error de validación, para el frontend:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Hay campos con errores",
  "errores": [{ "campo": "celular", "mensaje": "El celular debe tener exactamente 10 dígitos" }]
}
```

Otros detalles:

- **Fechas.** La API recibe `dd-mmm-yyyy` (mes en español, `05-mar-2001`) o `yyyy-mm-dd`. Después de validar, `dto.fechaNacimiento` siempre es `yyyy-mm-dd`, que es como se guarda. Para mostrarla se usa `formatearFecha`.
- **Foto.** Llega como archivo (`multipart/form-data`), no en el DTO. En el controlador: `validarFoto(archivo)` devuelve `{ foto, fotoTipo }` o `null`, y lanza el 400 del campo `foto` si no es válida.
- **Log.** Nunca se escribe con `save()` ni `insert()` de TypeORM sobre `LogTransaccion`: agregan `RETURNING` y fallan por permisos. Siempre con `AuditoriaService`. El detalle no debe incluir la foto.
- **Rutas sin token.** Solo las marcadas con `@Publico()`, como `GET /api/consultar/health`.
- **Sin `@Roles`.** La ruta admite a cualquier usuario con uno de los dos roles de la aplicación.
- **Búsquedas previas.** En Modificar y Borrar, la búsqueda lleva `@Auditar(TipoTransaccion.CONSULTAR, CONTEXTO_PREVIO_MODIFICAR)` (o `CONTEXTO_PREVIO_BORRAR`), y el registro de éxito pone ese mismo texto en `detalle.contexto`.
- **Formularios `multipart`.** El 403 se decide antes de leer el formulario, así que ese registro del log queda sin número de documento.
- **Ejemplo real.** `services/ms-crear` es el primer servicio hecho con esta plantilla, con su `verificar.sh`.

### Aviso a n8n (T16)

ms-crear, ms-modificar y ms-borrar avisan a n8n para que actualice el vector de la persona (sección 5.2 del diseño, contrato en `n8n/README.md`). El aviso va **después** de que la transacción quedó confirmada y **sin `await`**:

```ts
const creada = await this.guardar(dto, foto, usuario);          // persona y log, en su transacción
void this.indexacion.avisar(creada.numeroDocumento, TipoTransaccion.CREAR);
return creada;
```

- `AvisoIndexacionService.avisar()` nunca lanza errores. Si n8n está apagado, tarda más de 5 segundos o responde con error, el servicio responde igual y deja una advertencia en su log («n8n no recibió el aviso…»). El flujo «Reindexar todo» de n8n corrige el índice después.
- Solo se avisa cuando la operación salió bien: nunca en un 400, 403, 404 o 409.
- ms-modificar solo avisa si cambió algún dato. Cambiar solo la foto, o guardar sin cambios, no avisa, porque la foto no forma parte del texto indexado.
- La URL sale de `N8N_WEBHOOK_INDEXACION_URL`. Si está vacía, no se avisa y el servicio lo advierte al arrancar.
- `services/verificar-indexacion.sh` lo comprueba de extremo a extremo.

## Cómo crear un microservicio que la use

Esta plantilla está probada de extremo a extremo (construcción en Docker, ruta por Traefik, token de Keycloak y log). Cambia `ms-crear`, `api/crear` y `usr_crear` por los del servicio.

`services/ms-crear/package.json` (mismas versiones que la librería):

```json
{
  "name": "ms-crear",
  "version": "1.0.0",
  "private": true,
  "scripts": { "build": "tsc -p tsconfig.json", "start": "node dist/main.js" },
  "dependencies": {
    "@gdp/common": "*",
    "@nestjs/common": "^11.2.10",
    "@nestjs/core": "^11.2.10",
    "@nestjs/platform-express": "^11.2.10",
    "@nestjs/swagger": "^11.4.8",
    "@nestjs/typeorm": "^11.0.3",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.4",
    "pg": "^8.23.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "typeorm": "^0.3.31"
  },
  "devDependencies": { "@types/node": "^24", "typescript": "^5.9.3" }
}
```

`services/ms-crear/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "types": ["node"] },
  "include": ["src/**/*.ts"]
}
```

`services/ms-crear/src/main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configurarAplicacion } from '@gdp/common';
import { AppModule } from './app.module';

async function iniciar() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app, { prefijo: 'api/crear', titulo: 'ms-crear' });
  await app.listen(3000);
}
iniciar();
```

`services/ms-crear/src/app.module.ts`:

```ts
@Module({ imports: [ComunModule.forRoot()], controllers: [PersonasController] })
export class AppModule {}
```

`services/ms-crear/Dockerfile` (el contexto de construcción es la raíz del repositorio):

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci --no-audit --no-fund
RUN npm run build -w @gdp/common && npm run build -w ms-crear
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["node", "services/ms-crear/dist/main.js"]
```

Después de crear el `package.json` del servicio, ejecuta `npm install` **en la raíz** del repositorio y sube el `package-lock.json` actualizado: sin eso, `npm ci` falla dentro de Docker. El bloque del servicio en `docker-compose.yml` ya está escrito, comentado, al final de ese archivo.

Variables de entorno que lee la librería: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `KEYCLOAK_PUBLIC_URL`, `KEYCLOAK_INTERNAL_URL` y `KEYCLOAK_REALM`.

## Desarrollo de la librería

Desde la raíz del repositorio:

```bash
npm install
```

```bash
npm run build:common
```

```bash
npm run test:common
```

Las pruebas unitarias no necesitan contenedores. Las de integración sí (PostgreSQL y Keycloak arriba) y corren dentro de un contenedor temporal de Node, porque la base de datos no publica puertos:

```bash
bash libs/common/pruebas-integracion.sh
```

Montan un microservicio mínimo con `ComunModule`, conectado como `usr_crear`, y comprueban el guard con tokens reales, las validaciones y que la operación y su log se guardan o se deshacen juntos.

Versiones: NestJS 11, TypeORM 0.3, TypeScript 5.9 y Node 24. No se usan las versiones mayores más nuevas (NestJS 12, TypeORM 1, TypeScript 7); el motivo está en la sección 7 de `CONTEXTO.md`.
