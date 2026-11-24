# frontend

Interfaz web en React con Vite y TypeScript, servida con Nginx detrás de Traefik en `/` (todo lo que no empieza por `/api`). Tarea **T11**: login con Keycloak, menú por rol y contenedor. **T12** hizo las pantallas de crear y modificar, y **T13** las de consultar, borrar y log.

## Qué hace hoy

- **Login (CU-01).** Al abrir la aplicación sin sesión, `keycloak-js` redirige a Keycloak con el flujo de código de autorización y PKCE (S256), cliente `frontend`. Al volver, el token de 5 minutos se renueva solo. El botón «Cerrar sesión» cierra la sesión en Keycloak y vuelve a la aplicación.
- **Menú por rol (sección 8.2 del diseño).** El administrador ve las seis opciones y el consultor solo Consultar, Consulta en lenguaje natural y Consultar log. Cada ruta (`/crear`, `/modificar`, `/consultar`, `/borrar`, `/log`) está protegida por rol: si alguien escribe la dirección sin tener permiso, ve un aviso. La regla de verdad la aplica cada microservicio con el token.
- **Consultar bajo demanda (DD-04, CP-07).** Revisa `GET /api/consultar/health` cada 10 segundos y al volver a la ventana. Si no responde 200 con `"estado":"disponible"`, Consultar aparece como «No disponible en este momento».
- **Crear personas (CU-02, T12).** Formulario vacío que envía `POST /api/crear/personas` como `multipart`, con la foto si la hay. Al guardar confirma a quién registró; un 409 marca el número de documento («Ya hay una persona registrada…») y un 400 marca cada campo con el mensaje del servidor.
- **Modificar datos personales (CU-03, T12).** Busca por documento con `GET /api/modificar/personas/{documento}` (un 404 dice que no hay una persona registrada), llena el mismo formulario con el documento de solo lectura y guarda con `PUT`. La foto se reemplaza eligiendo otra, se conserva si no se toca y se quita con «Quitar la foto actual» (`eliminarFoto=true`).
- **Validaciones (sección 3.3).** El formulario valida cada campo al salir de él y todos al guardar, y lleva el cursor al primer error. Los mensajes son los mismos del servidor. La fecha se elige en el calendario o se escribe como `dd-mmm-yyyy` (05-mar-2001), y no puede ser futura. La foto debe ser JPG o PNG de hasta 2 MB. Las reglas y los mensajes repiten los de `libs/common`: si cambia una regla allí, hay que cambiarla también en `src/persona/` (decisión en la sección 7 de `CONTEXTO.md`).
- **Consultar datos personales (CU-04, T13).** Para los dos roles. Busca por documento en `GET /api/consultar/personas/{documento}` y muestra la ficha completa con la foto (`FichaPersona`, con la misma distribución del formulario). Si ms-consultar está apagado, la pantalla lo dice y las demás opciones siguen funcionando (CP-07).
- **Borrar personas (CU-06, T13).** Solo el administrador. Busca en `GET /api/borrar/personas/{documento}`, muestra la ficha para revisarla y pide confirmación nombrando a la persona; el foco empieza en «Cancelar». Solo «Sí, borrar» llama a `DELETE`. Al terminar recuerda que el historial sigue en el log (CP-05).
- **Consultar log (CU-07, CP-06, T13).** Para los dos roles. Filtros de tipo, documento, desde y hasta (con calendario), que se combinan, sobre una tabla de 20 en 20 con «Anterior» y «Siguiente». La fecha y hora se muestran como `dd-mmm-yyyy hh:mm:ss` en hora de Bogotá, la misma zona en que ms-log aplica los filtros. La columna Detalle resume el registro (antes → después en las modificaciones, los datos que tenía la persona en los borrados, el motivo de los errores, la pregunta y la respuesta de n8n) y «Ver detalle completo» muestra el JSON. Sin resultados dice «No hay transacciones que cumplan los filtros».
- **Servicio apagado.** Si un servicio está apagado, Traefik responde 404 sin JSON; `pedirApi` lo convierte en un `ErrorApi` con estado 503 («El servicio no está disponible en este momento»), para no confundirlo con «no hay una persona con ese documento».
- **Consulta en lenguaje natural.** Abre `N8N_CHAT_URL` en una pestaña nueva (el valor está en `.env.example` y en `n8n/README.md`). Si esa variable está vacía, aparece como «Todavía no está configurado».

## Para seguir programando

- **Pantallas:** cada una está en `src/paginas/` y su ruta en `src/App.tsx`, protegida por rol con `RutaConRol`.
- **Llamar a la API:** usa `pedirApi` de `src/api/cliente.ts`. Pone el token (renovándolo si hace falta), vuelve al login con un 401 y lanza `ErrorApi` (con 503 si el servicio está apagado) con `estado`, `message` y `errores: [{ campo, mensaje }]` (el formato de los 400 de la sección 7 de `CONTEXTO.md`), listo para mostrar cada mensaje junto a su campo.

  ```ts
  const persona = await pedirApi<Persona>(`/api/consultar/personas/${documento}`);
  await pedirApi('/api/crear/personas', { method: 'POST', body: formData }); // multipart con foto
  await pedirApi(`/api/borrar/personas/${documento}`, { method: 'DELETE' }); // 204: devuelve undefined
  ```

- **Buscar por documento:** `BusquedaPorDocumento` (`src/componentes/`) valida el número, llama a `ruta/{documento}` y muestra «No hay una persona registrada…» con un 404. La usan Modificar, Consultar y Borrar, cada una con su ruta.
- **Mostrar una persona:** `FichaPersona` y `nombreCompleto` (`src/persona/FichaPersona.tsx`).
- **Mensajes de resultado:** `Alerta` (`src/componentes/`), con `tipo="exito"` o `"error"`.
- **Persona y fecha:** el tipo `PersonaApi`, los nombres de los campos y `formatearFecha` (yyyy-mm-dd a dd-mmm-yyyy, para mostrar) están en `src/persona/`.
- **Usuario y estado de Consultar:** `useSesion()` (de `src/auth/ContextoSesion.tsx`) da el usuario (`nombre`, `roles`) y `consultarDisponible`.
- **Contratos:** la forma de una persona es `PersonaRespuesta` (`libs/common`), con la foto como `data:image/...;base64,...`. El contrato de `GET /api/log` está en `services/ms-log/README.md`.
- **Estilos:** `src/estilos.css`, con los colores en variables.

## Configuración

La aplicación lee su configuración de `/config.js` al cargar, no del código compilado. En el contenedor, `nginx/40-config-js.sh` lo escribe al arrancar con estas variables de `.env`: `KEYCLOAK_PUBLIC_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID` y `N8N_CHAT_URL`. Así la misma imagen sirve en otro equipo o en Azure sin volver a construirla. Solo lleva datos públicos: el cliente `frontend` no tiene secreto.

Si cambias una de esas variables, basta con recrear el contenedor: `docker compose up -d frontend`.

## Desarrollo

Con el resto del sistema arriba (`docker compose --profile consultar up -d --build`):

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, con recarga en caliente; /api va al gateway
npm test         # pruebas del menú, las rutas, las validaciones y el formulario (Vitest)
npm run build    # compila a dist/ (lo mismo que hace el Dockerfile)
```

En desarrollo se usa `public/config.js`. Keycloak ya acepta `http://localhost:5173` como dirección de retorno.

El frontend no está en los workspaces de npm de la raíz: tiene su propio `package-lock.json` y su contenedor se construye con el contexto en esta carpeta.

## Verificar

Con todo arriba, desde la raíz del repositorio (en Windows, con Git Bash):

```bash
bash frontend/verificar.sh
```

Debe terminar con `TODO BIEN`. Comprueba lo siguiente:

- Nginx sirve la aplicación y sus rutas.
- `config.js` se genera desde `.env`.
- `/api` sigue yendo a los microservicios, y con ms-consultar apagado su ruta responde 404 y no la página.
- El login con PKCE funciona tal como lo hace `keycloak-js`: vuelve a `http://localhost/`, el canje del código pasa CORS y los roles llegan en el token.

Lo que se dibuja después del login lo cubren las pruebas de `npm test`.

## Archivos

- `src/main.tsx`: inicia la sesión con Keycloak antes de pintar la aplicación.
- `src/App.tsx`: rutas, cada una protegida por rol.
- `src/auth/`: sesión con Keycloak (`sesion.ts`), roles y contexto de sesión.
- `src/menu/`: opciones del menú por rol (`opciones.ts`, con pruebas) y chequeo de Consultar.
- `src/api/cliente.ts`: `pedirApi` y `ErrorApi`.
- `src/persona/`: formulario de persona (`FormularioPersona.tsx`), validaciones y fecha (con pruebas), armado del cuerpo `multipart` y traducción de los errores de la API.
- `src/persona/FichaPersona.tsx`: ficha de solo lectura de una persona.
- `src/log/`: filtros y ruta de `GET /api/log`, formato de fecha y hora y resumen del detalle (con pruebas), y la tabla.
- `src/paginas/`: menú, crear, modificar, consultar, borrar (`BorrarPersona.tsx`, con la confirmación) y log (`ConsultarLog.tsx`).
- `src/componentes/`: marco con usuario y cierre de sesión, protección por rol, búsqueda por documento y avisos.
- `nginx/`: configuración de Nginx y script que genera `config.js`.
- `Dockerfile`: construye con Node 24 y sirve con `nginx:1.28-alpine`.
