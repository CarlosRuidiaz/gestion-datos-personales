# frontend

Interfaz web en React con Vite y TypeScript, servida con Nginx detrás de Traefik en `/` (todo lo que no empieza por `/api`). Tarea **T11**: login con Keycloak, menú por rol y contenedor. Las pantallas las llenan **T12** (crear y modificar) y **T13** (consultar, borrar y log).

## Qué hace hoy

- **Login (CU-01).** Al abrir la aplicación sin sesión, `keycloak-js` redirige a Keycloak con el flujo de código de autorización y PKCE (S256), cliente `frontend`. Al volver, el token de 5 minutos se renueva solo. El botón «Cerrar sesión» cierra la sesión en Keycloak y vuelve a la aplicación.
- **Menú por rol (sección 8.2 del diseño).** El administrador ve las seis opciones y el consultor solo Consultar, Consulta en lenguaje natural y Consultar log. Cada ruta (`/crear`, `/modificar`, `/consultar`, `/borrar`, `/log`) está protegida por rol: si alguien escribe la dirección sin tener permiso, ve un aviso. La regla de verdad la aplica cada microservicio con el token.
- **Consultar bajo demanda (DD-04, CP-07).** Revisa `GET /api/consultar/health` cada 10 segundos y al volver a la ventana. Si no responde 200 con `"estado":"disponible"`, Consultar aparece como «No disponible en este momento».
- **Consulta en lenguaje natural.** Abre `N8N_CHAT_URL` en una pestaña nueva. Mientras esa variable esté vacía (hasta T15), aparece como «Todavía no está configurado».

## Para T12 y T13

- **Dónde va cada pantalla:** reemplaza el `EnConstruccion` de su ruta en `src/App.tsx`. La ruta ya está protegida por rol con `RutaConRol`.
- **Llamar a la API:** usa `pedirApi` de `src/api/cliente.ts`. Pone el token (renovándolo si hace falta), vuelve al login con un 401 y lanza `ErrorApi` con `estado`, `message` y `errores: [{ campo, mensaje }]` (el formato de los 400 de la sección 7 de `CONTEXTO.md`), listo para mostrar cada mensaje junto a su campo.

  ```ts
  const persona = await pedirApi<Persona>(`/api/consultar/personas/${documento}`);
  await pedirApi('/api/crear/personas', { method: 'POST', body: formData }); // multipart con foto
  await pedirApi(`/api/borrar/personas/${documento}`, { method: 'DELETE' }); // 204: devuelve undefined
  ```

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
npm test         # pruebas del menú por rol y de las pantallas (Vitest)
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
- `src/paginas/`, `src/componentes/`: menú, marco con usuario y cierre de sesión, avisos.
- `nginx/`: configuración de Nginx y script que genera `config.js`.
- `Dockerfile`: construye con Node 24 y sirve con `nginx:1.28-alpine`.
