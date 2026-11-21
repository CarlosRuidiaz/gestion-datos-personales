# ms-log

Microservicio NestJS de la opción **Consultar log** (RF-07) y del registro de las consultas en lenguaje natural que hace n8n (sección 7.2 del diseño). Ruta en el gateway: `/api/log`. Usuario de base de datos: `usr_log`, el único con SELECT sobre `log_transaccion` (además de INSERT). Nadie puede modificar ni borrar el log.

Está hecho con la plantilla de `libs/common` (ver su `README.md`). Documentación OpenAPI en <http://localhost/api/log/docs>.

## Rutas

| Método y ruta | Quién | Respuestas |
| --- | --- | --- |
| `GET /api/log?tipo=&documento=&desde=&hasta=&pagina=&tamano=` | Administrador y consultor (token de Keycloak) | 200, 400, 401 |
| `POST /api/log/consulta-nl` | n8n, con la cabecera `X-API-Key` | 201, 400, 401 |

### `GET /api/log`

Todos los filtros son opcionales y se combinan. Un filtro vacío (`?tipo=`) cuenta como no enviado.

| Parámetro | Valores |
| --- | --- |
| `tipo` | `CREAR`, `MODIFICAR`, `CONSULTAR`, `BORRAR` o `CONSULTA_NL` |
| `documento` | Número de documento exacto: solo dígitos, máximo 10 |
| `desde`, `hasta` | Días completos, como `yyyy-mm-dd` o `dd-mmm-yyyy` (`05-mar-2026`). Se interpretan en la zona horaria del servicio (`TZ`, America/Bogota): `hasta` incluye todo ese día. `desde` no puede ser posterior a `hasta` |
| `pagina` | Desde 1. Por defecto 1 |
| `tamano` | De 1 a 100. Por defecto 20 |

Respuesta, del registro más reciente al más antiguo:

```json
{
  "total": 57,
  "pagina": 1,
  "tamano": 20,
  "registros": [
    {
      "id": "42",
      "fechaHora": "2026-11-21T15:04:05.123Z",
      "tipo": "MODIFICAR",
      "numeroDocumento": "1043123456",
      "usuario": "admin.prueba",
      "resultado": "EXITO",
      "detalle": { "anterior": { "correo": "a@example.com" }, "nuevo": { "correo": "b@example.com" } },
      "pregunta": null,
      "respuesta": null
    }
  ]
}
```

- `id` va como texto (es `BIGSERIAL`) y `fechaHora` en ISO 8601 (UTC). Para mostrarla en hora local, basta con `new Date(fechaHora)` en el navegador.
- Un filtro inválido responde 400 con el formato común `errores: [{ campo, mensaje }]`.
- Consultar el log **no** se registra en el log: no es una transacción sobre los datos personales (sección 7 de `CONTEXTO.md`).

### `POST /api/log/consulta-nl`

La usa el flujo de chat de n8n (T15) al terminar cada consulta, también cuando el modelo falla. No lleva token de Keycloak: lleva la llave `N8N_LOG_API_KEY` en la cabecera `X-API-Key`.

```json
{
  "pregunta": "¿Cuál es el empleado más joven que se ha registrado?",
  "respuesta": "La persona más joven registrada es Ana Torres, de 15 años.",
  "resultado": "EXITO",
  "detalle": { "sesion": "..." }
}
```

| Campo | Regla |
| --- | --- |
| `pregunta` | Obligatoria, máximo 4000 caracteres |
| `respuesta` | Opcional (puede faltar si el modelo falló), máximo 20000 caracteres |
| `resultado` | `EXITO` o `ERROR` |
| `detalle` | Objeto JSON opcional, por ejemplo `{ "motivo": "Se agotó la cuota diaria del modelo" }` |

- Queda en el log con tipo `CONSULTA_NL`, sin documento y con `n8n` como usuario. Responde 201.
- Sin llave, o con una llave distinta: 401, y no se registra (no hay un usuario identificado, igual que con los tokens).
- Con la llave correcta pero un cuerpo inválido: 400, y el rechazo sí queda en el log como `CONSULTA_NL` con resultado `ERROR`.
- Si la base de datos falla, responde 500: n8n nunca recibe un 201 sin que el registro exista.

Ejemplo para probar a mano (en Git Bash, desde la raíz):

```bash
curl -i -X POST http://localhost/api/log/consulta-nl -H 'Content-Type: application/json' -H "X-API-Key: $(grep ^N8N_LOG_API_KEY= .env | cut -d= -f2-)" -d '{"pregunta":"prueba","respuesta":"ok","resultado":"EXITO"}'
```

## Variables de entorno

Las de `libs/common` (`DB_*` y `KEYCLOAK_*`) más `N8N_LOG_API_KEY`, que Compose exige. Si cambias la llave en `.env`, recrea el contenedor con `docker compose up -d ms-log` y actualiza la misma llave en n8n.

## Verificación

```bash
bash services/ms-log/verificar.sh
```

Prueba por el gateway los permisos, cada filtro solo y combinado (CP-06), los límites de los días en hora de Bogotá, la paginación, los filtros inválidos y el registro de n8n con y sin llave. Si ms-borrar está arriba, comprueba además que el historial de una persona borrada se sigue consultando (CP-05). Inserta sus registros de prueba directamente en la base de datos y los borra al terminar.
