# Guía de configuración inicial y prueba en un equipo limpio

Esta guía lleva el proyecto desde un equipo sin nada hasta la aplicación funcionando, con la consulta en lenguaje natural de n8n incluida (RNF-05 y sección 10 del diseño). Sirve para el equipo de desarrollo y para preparar el computador de la presentación.

Todos los comandos se ejecutan desde la raíz del repositorio, en una terminal Bash: Git Bash o WSL en Windows, o la terminal de macOS o Linux. En Windows, Docker Desktop debe estar abierto.

| Parte | Qué contiene |
| --- | --- |
| [1. Requisitos](#1-requisitos) | Qué debe tener el equipo antes de empezar |
| [2. Instalación](#2-instalación-paso-a-paso) | Del `git clone` a la aplicación abierta en el navegador |
| [3. Configuración inicial de n8n](#3-configuración-inicial-de-n8n) | Lo que se hace una sola vez, con la ruta automática y la manual |
| [4. Prueba completa](#4-prueba-completa-en-un-equipo-limpio) | La lista de comprobaciones, con lo que debe salir en cada una |
| [5. Apagar y empezar de cero](#5-apagar-reiniciar-y-empezar-de-cero) | Qué se conserva y qué se pierde |
| [6. Antes de la presentación](#6-antes-de-la-presentación) | Lista para el equipo donde se presenta |
| [7. Problemas frecuentes](#7-problemas-frecuentes) | Síntoma, causa y solución |

## 1. Requisitos

| Requisito | Detalle |
| --- | --- |
| Docker Desktop | En Windows, con WSL2 y la virtualización activada en la BIOS. El sistema completo usa entre 2 y 3 GB de RAM, y el equipo debe tener al menos 8 GB |
| Git y una terminal Bash | En Windows, Git Bash o una terminal de WSL |
| Puertos libres | 80 (aplicación), 8080 (Keycloak) y 5678 (n8n) |
| Internet | Para bajar las imágenes y para que n8n llame a Gemini |
| Llave de Google Gemini | Gratuita. Se crea en Google AI Studio (aistudio.google.com), con la opción para crear una llave de API |
| Node.js 22 o superior | **Opcional.** Solo para las pruebas de `libs/common` con `npm` y para la colección de Postman con `newman` |

Para saber si un puerto está ocupado, en PowerShell: `netstat -ano | findstr ":80 "` (cambia el número por el puerto). En Bash: `docker ps --format "table {{.Names}}\t{{.Ports}}"` muestra qué contenedores publican puertos. Si algo ocupa uno de los tres, hay que cerrarlo antes de empezar (ver el problema 4 de la parte 7).

Solo se usan datos ficticios: el nivel gratuito de Gemini puede usar lo que recibe para mejorar el servicio.

## 2. Instalación paso a paso

### 2.1 Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd gestion-datos-personales
```

### 2.2 Crear el archivo `.env`

El `.env` guarda las contraseñas y las llaves. No se sube al repositorio. Este bloque lo crea con contraseñas aleatorias y deja a un lado la llave de Gemini:

```bash
cp .env.example .env

poner() { sed -i "s|^$1=.*|$1=$2|" .env; }

poner POSTGRES_PASSWORD "$(openssl rand -hex 16)"
for v in CREAR MODIFICAR CONSULTAR BORRAR LOG N8N; do
  poner "DB_PASSWORD_$v" "$(openssl rand -hex 16)"
done
poner KEYCLOAK_ADMIN_PASSWORD "$(openssl rand -hex 12)"
poner KEYCLOAK_USUARIO_ADMIN_PASSWORD "$(openssl rand -hex 12)"
poner KEYCLOAK_USUARIO_CONSULTOR_PASSWORD "$(openssl rand -hex 12)"
poner N8N_ENCRYPTION_KEY "$(openssl rand -hex 32)"
poner N8N_LOG_API_KEY "$(openssl rand -hex 32)"
```

`poner` es solo un atajo que define el bloque: reemplaza el valor de una variable en `.env`. Se usan valores hexadecimales para que no tengan caracteres que rompan Docker o los scripts. En macOS, `sed -i` pide un argumento extra: usa `sed -i ''`.

Después, abre `.env` en un editor y pega la llave de Gemini después de `GEMINI_API_KEY=`, sin comillas ni espacios. `GROQ_API_KEY` se deja vacía (es opcional y hoy no se usa).

Variables que **no** se tocan: `TZ`, `POSTGRES_DB`, `POSTGRES_USER`, `DB_HOST`, `DB_PORT`, `KEYCLOAK_ADMIN`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, las URLs, `N8N_CHAT_URL` y `N8N_WEBHOOK_INDEXACION_URL`. Ya traen el valor correcto.

Comprueba que no quedó nada vacío por error:

```bash
grep -E "^[A-Z_]+=$" .env
```

Solo debe salir `GROQ_API_KEY`.

Para saber con qué contraseña entrar a la aplicación:

```bash
grep -E "KEYCLOAK_USUARIO" .env
```

> **Las contraseñas se asignan una sola vez.** Las de la base de datos y las de los usuarios de Keycloak se guardan en sus volúmenes de Docker la primera vez que arrancan. Si las cambias en `.env` después, no tendrán efecto (ver la parte 5). `N8N_ENCRYPTION_KEY` tampoco se cambia nunca después de configurar n8n. Guarda una copia del `.env` fuera del repositorio.

### 2.3 Arrancar todo

```bash
docker compose --profile consultar up -d --build
```

La primera vez baja unas cuatro imágenes pesadas (n8n y Keycloak pasan de 250 MB) y construye las de los microservicios y del frontend. Puede tardar 15 minutos o más, según la conexión. Si falla una descarga con `tls: bad record MAC`, vuelve a ejecutar el mismo comando (problema 1 de la parte 7).

Cuando termine:

```bash
docker compose ps
```

`gateway`, `postgres`, `keycloak` y `n8n` deben estar `healthy`, y ninguno en `Restarting`. Keycloak tarda cerca de un minuto más en quedar listo.

### 2.4 Cargar los datos de prueba

```bash
bash database/cargar-datos-prueba.sh
```

Inserta 20 personas ficticias con su registro `CREAR` en el log. Se puede repetir sin duplicar nada. Termina con «Falta ejecutar «Reindexar todo» en n8n»: eso se hace en la parte 3.

### 2.5 Configurar n8n (una sola vez)

Sigue la parte 3 completa. Sin ese paso, la aplicación funciona, pero el chat no.

### 2.6 Abrir la aplicación

Abre **<http://localhost>**. La aplicación te redirige al login de Keycloak. Entra con:

| Usuario | Rol | Contraseña (en `.env`) | Qué ve en el menú |
| --- | --- | --- | --- |
| `admin.prueba` | Administrador | `KEYCLOAK_USUARIO_ADMIN_PASSWORD` | Las seis opciones |
| `consultor.prueba` | Consultor | `KEYCLOAK_USUARIO_CONSULTOR_PASSWORD` | Consultar datos, consulta en lenguaje natural y log |

Usa siempre `localhost`, no `127.0.0.1`: Keycloak solo acepta volver a `http://localhost/` y rechazaría el login desde otra dirección.

Otras direcciones: la consola de Keycloak está en <http://localhost:8080> (con `KEYCLOAK_ADMIN` y `KEYCLOAK_ADMIN_PASSWORD`; ese administrador no es de la aplicación) y n8n en <http://localhost:5678>.

## 3. Configuración inicial de n8n

Es el único paso de la instalación que no arranca con un solo comando (RNF-05). Se hace **una vez** por equipo, y otra vez si se borra el volumen `n8n_data`.

### 3.1 Crear la cuenta de administrador de n8n

Abre <http://localhost:5678>. La primera vez, n8n pide crear la cuenta de administrador (*owner*): escribe un correo, un nombre y una contraseña de al menos 8 caracteres, con un número y una mayúscula. Anótalos.

- Es una cuenta **local**: vive en tu volumen, no es de n8n.io y n8n no envía ningún correo. Cualquier correo sirve.
- El chat de la consulta en lenguaje natural se protege con esta cuenta (sección 7.1 del diseño). Para usar el chat hay que haber iniciado sesión en <http://localhost:5678> en el mismo navegador.
- Si después del registro n8n ofrece una encuesta o una licencia gratuita, se pueden saltar.

### 3.2 Cargar credenciales, importar los flujos y publicarlos (ruta automática)

```bash
bash n8n/configurar.sh
```

El script se puede repetir las veces que haga falta. Hace tres cosas:

1. Crea tres credenciales con los valores de `.env`, que n8n guarda cifrados con `N8N_ENCRYPTION_KEY`:

   | Credencial | Id fijo | Datos |
   | --- | --- | --- |
   | PostgreSQL (usr_n8n) | `gdpCredPostgres1` | host `postgres`, usuario `usr_n8n`, contraseña `DB_PASSWORD_N8N` |
   | Google Gemini | `gdpCredGemini001` | `GEMINI_API_KEY` |
   | Llave de ms-log | `gdpCredMsLogKey1` | cabecera `X-API-Key` con `N8N_LOG_API_KEY` |

2. Importa los tres flujos de `n8n/workflows`:

   | Flujo | Id | Para qué sirve |
   | --- | --- | --- |
   | Indexar persona | `gdpIndexarPerson` | Webhook que actualiza el vector de una persona cuando se crea, modifica o borra |
   | Reindexar todo | `gdpReindexarTodo` | Reconstruye todos los vectores, se ejecuta a mano |
   | Consulta en lenguaje natural | `gdpChatConsulta1` | El chat con el agente RAG |

3. Publica los flujos de indexación y de chat, y espera hasta comprobar que responden.

Debe terminar con «Chat activo en…». Si pide cambiar `N8N_CHAT_URL`, hazlo como dice y ejecuta `docker compose up -d frontend`.

### 3.3 Reindexar todo

Después de cargar los datos de prueba, el índice de vectores está vacío. Se construye así:

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=gdpReindexarTodo
```

(O en el navegador: abre el flujo **Reindexar todo** en n8n y pulsa *Execute workflow*.) Llama a Gemini unas 20 veces, una por persona. Comprueba que quedó un vector por persona:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM persona_embedding;"'
```

Debe dar 20. De ahí en adelante, crear, modificar o borrar una persona en la aplicación actualiza su vector solo. Si n8n estuvo apagado mientras se creaban personas, se ejecuta **Reindexar todo** otra vez.

### 3.4 Comprobar que n8n quedó bien

```bash
curl -s http://localhost:5678/healthz          # {"status":"ok"}
docker compose exec -T n8n n8n list:workflow   # los tres flujos
```

Para probar el chat sin el script de verificación: inicia sesión en <http://localhost:5678>, abre la opción «Consulta en lenguaje natural» del menú de la aplicación y pregunta «¿Cuál es el empleado más joven que se ha registrado?». En n8n, el flujo **Consulta en lenguaje natural** tiene una pestaña *Executions* donde se ve qué herramienta eligió el agente.

### 3.5 Ruta manual (si `configurar.sh` no se puede usar)

Úsala solo si el script no corre en tu equipo (por ejemplo, sin Bash). Es más lenta y propensa a errores:

1. En n8n, entra a *Credentials* y crea las tres de la tabla de arriba con sus tipos: *Postgres*, *Google Gemini (PaLM) API* y *Header Auth* (nombre `X-API-Key`).
2. En *Workflows*, usa *Import from file* con cada JSON de `n8n/workflows`.
3. Los flujos referencian las credenciales por su id. Las que creaste a mano tienen otros ids, así que abre cada nodo que muestre un error de credencial (los de PostgreSQL, Gemini y el HTTP Request de ms-log) y elige la credencial que creaste.
4. Activa (*Publish*) los flujos **Indexar persona** y **Consulta en lenguaje natural**.
5. Ejecuta **Reindexar todo**.

Los detalles de cada flujo y del chat están en `n8n/README.md`.

## 4. Prueba completa en un equipo limpio

Una «prueba completa» es: instalar desde cero siguiendo esta guía, y pasar todas las comprobaciones de abajo. Cada script termina con `TODO BIEN` o dice cuántas comprobaciones fallaron. Todos usan documentos ficticios `99999999xx` y limpian lo que crean.

### 4.1 Comprobaciones automáticas

Con todo arriba, los datos cargados y n8n configurado (partes 2 y 3), en este orden:

| # | Comando | Qué prueba | Cuidado |
| --- | --- | --- | --- |
| 1 | `docker compose ps` | Contenedores arriba y sanos | |
| 2 | `docker compose exec -T postgres sh < database/verificar.sh` | Esquema, restricciones y permisos por servicio | |
| 3 | `bash keycloak/verificar.sh` | Realm, roles, usuarios y login con PKCE | |
| 4 | `bash libs/common/pruebas-integracion.sh` | Guard JWT, validaciones y log transaccional, con PostgreSQL y Keycloak reales | Corre en un contenedor temporal y baja dependencias de npm: tarda unos minutos |
| 5 | `bash services/ms-crear/verificar.sh` | ms-crear de extremo a extremo, con foto | |
| 6 | `bash services/ms-modificar/verificar.sh` | ms-modificar | |
| 7 | `bash services/ms-borrar/verificar.sh` | ms-borrar | |
| 8 | `bash services/ms-consultar/verificar.sh` | ms-consultar, incluido apagarlo, encenderlo y escalarlo a tres réplicas (CP-07) | Apaga y enciende ms-consultar |
| 9 | `bash services/ms-log/verificar.sh` | Filtros, paginación y registro de n8n con su llave (CP-05 y CP-06) | |
| 10 | `bash services/verificar-indexacion.sh` | Los avisos a n8n de crear, modificar y borrar | Recrea ms-crear, ms-modificar y ms-borrar y los deja como estaban. Con n8n y Gemini configurados, prueba también el camino real |
| 11 | `bash frontend/verificar.sh` | Nginx, `config.js`, convivencia con `/api` y login con PKCE | Apaga ms-consultar un momento |
| 12 | `bash n8n/verificar.sh` | Indexación por webhook, reindexación completa y permisos de `usr_n8n` | Unas 10 llamadas a Gemini |
| 13 | `bash n8n/verificar-chat.sh` | Barrera de la herramienta SQL, CP-09, CP-10, memoria de sesión y registro en el log | Pide el correo y la contraseña de tu cuenta de n8n. Unas 15 a 25 llamadas a Gemini, con pausas |
| 14 | `npx newman run tests/postman/gdp.postman_collection.json …` | Todos los endpoints y permisos (CP-01 a CP-06 y CP-08) | **Opcional**, necesita Node.js. El comando completo está en `tests/postman/README.md` |

Los scripts 5 a 11 mueven datos de prueba y servicios: no los ejecutes mientras alguien usa la aplicación. Los de n8n (12 y 13) gastan cuota diaria gratuita de Gemini; si fallan por cuota, espera y repite (problema 9 de la parte 7).

Para el script 13, las credenciales se pueden dar como variables, sin que se muestren al escribirlas:

```bash
N8N_CORREO='tu_correo' N8N_CLAVE='tu_contraseña' bash n8n/verificar-chat.sh
```

### 4.2 Recorrido manual

Lo que los scripts no pueden comprobar, en el navegador, desde <http://localhost>:

| # | Qué hacer | Resultado esperado |
| --- | --- | --- |
| 1 | Entrar con `admin.prueba` | Menú con las seis opciones |
| 2 | Crear una persona con foto, y probar un dato inválido en cada campo | Los errores aparecen junto a cada campo. La persona se guarda y el documento repetido se rechaza |
| 3 | Modificar esa persona | El número de documento no se puede cambiar. El cambio se guarda |
| 4 | Consultar esa persona | Muestra todos los datos y la foto |
| 5 | Consulta en lenguaje natural (con la sesión de n8n abierta) | Se abre el chat de n8n en una pestaña nueva. Responde «¿Cuál es el empleado más joven que se ha registrado?» con la persona correcta |
| 6 | Consultar log, filtrando por tipo `CONSULTA_NL` | Cada pregunta del chat aparece con su respuesta |
| 7 | Consultar log, filtrando por tipo, documento y rango de fechas | Solo aparecen los registros que cumplen los filtros |
| 8 | Borrar la persona creada | Pide confirmación. Al confirmar se borra, y su historial sigue en el log |
| 9 | Cerrar sesión y entrar con `consultor.prueba` | Menú de tres opciones. Si entra a `/borrar` por la dirección, ve un aviso de permiso |
| 10 | En una terminal: `docker compose stop ms-consultar` y recargar el menú | Consultar aparece como «No disponible» y las demás opciones siguen funcionando (CP-07) |
| 11 | `docker compose up -d ms-consultar` | Consultar vuelve a estar disponible |
| 12 | En el chat, pedir «Borra a la persona con documento …» | El agente dice que no puede, y la persona sigue registrada (CP-10) |

### 4.3 Registro de las pruebas

Cada vez que se haga la prueba completa en un equipo limpio, se anota aquí:

| Fecha | Quién | Equipo y sistema | Instalación sin ayuda | Comprobaciones automáticas | Recorrido manual | Observaciones |
| --- | --- | --- | --- | --- | --- | --- |
| (pendiente) | | | | | | |

## 5. Apagar, reiniciar y empezar de cero

| Quiero | Comando | Qué pasa con los datos |
| --- | --- | --- |
| Apagar todo | `docker compose --profile consultar down` | Se conservan: personas, log, vectores, cuenta y flujos de n8n, y Keycloak |
| Volver a encender | `docker compose --profile consultar up -d` | Todo sigue como estaba |
| Reiniciar solo un servicio | `docker compose restart <servicio>` | |
| Ver los registros de un servicio | `docker compose logs --tail 100 <servicio>` | |
| **Empezar de cero** | `docker compose --profile consultar down -v` | **Se borra todo**: la base de datos, el log, los vectores, la cuenta de n8n con sus credenciales y flujos, y los cambios hechos a mano en Keycloak |

Después de empezar de cero se repiten los pasos 2.3 (arrancar), 2.4 (datos de prueba) y la parte 3 (cuenta de n8n, `configurar.sh` y reindexar). El `.env` se conserva y se puede reutilizar, porque las contraseñas se vuelven a asignar al recrear los volúmenes.

Cuándo hay que recrear un volumen:

- **Cambiaste una `DB_PASSWORD_*` o `POSTGRES_PASSWORD`:** `docker compose down -v`.
- **Cambiaste `keycloak/realm.json` o una contraseña de los usuarios de prueba:** pasos en `keycloak/README.md`. No toca la base de datos. Para cambiar solo una contraseña, también se puede hacer en la consola de Keycloak (realm `gestion-personas`, *Users*, el usuario, *Credentials*, *Reset password*).
- **Cambiaste `N8N_ENCRYPTION_KEY`:** no se hace. n8n deja de poder leer sus credenciales y hay que borrar `n8n_data` con `down -v`.
- **Cambiaste `GEMINI_API_KEY` o `N8N_LOG_API_KEY`:** no hace falta borrar nada. Ejecuta `bash n8n/configurar.sh` otra vez y, si cambiaste `N8N_LOG_API_KEY`, recrea ms-log con `docker compose up -d ms-log`.
- **Cambiaste `N8N_CHAT_URL`:** `docker compose up -d frontend`.

## 6. Antes de la presentación

El equipo donde se presenta debe probarse con anticipación (sección 12 del diseño). Lista de verificación:

- [ ] Docker Desktop instalado, con WSL2 y la virtualización activada, y al menos 8 GB de RAM.
- [ ] Instalación hecha siguiendo esta guía **en ese equipo**, con las imágenes ya descargadas (así no depende del internet del lugar para bajarlas).
- [ ] Puertos 80, 8080 y 5678 libres.
- [ ] `.env` completo, con la llave de Gemini, y una copia fuera del repositorio.
- [ ] Datos de prueba cargados y **Reindexar todo** ejecutado.
- [ ] Sesión de n8n abierta en el navegador que se usará, para que el chat abra sin pedir cuenta.
- [ ] Los dos usuarios (`admin.prueba` y `consultor.prueba`) probados con su contraseña.
- [ ] Conexión alterna disponible (datos móviles compartidos): sin internet, Gemini no responde.
- [ ] No hacer pruebas masivas del chat el día de la presentación: la cuota diaria gratuita de Gemini es limitada. Si se agota, el chat avisa que intente más tarde.
- [ ] Un segundo computador con todo instalado, por si el principal falla.
- [ ] Haber hecho el recorrido manual de la sección 4.2 completo la víspera.

## 7. Problemas frecuentes

| # | Síntoma | Causa y solución |
| --- | --- | --- |
| 1 | Al bajar imágenes: `failed to copy: … tls: bad record MAC` | La descarga se corrompió por la red (conexión inestable, VPN o antivirus que inspecciona HTTPS). Vuelve a ejecutar el mismo comando: Docker conserva las capas descargadas. Si sigue, baja las imágenes una por una con `docker pull`, desactiva la VPN o cambia de red |
| 2 | `Cannot connect to the Docker daemon` | Docker Desktop no está abierto. Ábrelo y espera a que diga que está funcionando |
| 3 | `docker compose` dice `Falta … en .env` | Falta una variable obligatoria. Completa `.env` con el bloque de la sección 2.2 |
| 4 | En <http://localhost> sale otra página (por ejemplo, un formulario simple de «Iniciar sesión») | Otro programa ocupa el puerto 80 en tu equipo: otro contenedor (`docker ps --format "table {{.Names}}\t{{.Ports}}"`) o un programa de Windows como IIS o XAMPP. Ciérralo, o detén ese contenedor con `docker stop`, y vuelve a ejecutar `docker compose --profile consultar up -d` |
| 5 | Keycloak muestra `Invalid parameter: redirect_uri` | Abriste la aplicación con otra dirección, como `127.0.0.1`. Usa <http://localhost> |
| 6 | La contraseña de `admin.prueba` no funciona | Es la de `KEYCLOAK_USUARIO_ADMIN_PASSWORD`, no la de `KEYCLOAK_ADMIN_PASSWORD` (esa es de la consola de Keycloak). Si cambiaste el `.env` después del primer arranque, ya no coincide: restablécela en la consola de Keycloak (parte 5) |
| 7 | No recuerdas la cuenta de n8n | `docker compose exec n8n n8n user-management:reset` y `docker compose restart n8n`. Borra solo la cuenta (los flujos y las credenciales se conservan). Después abre <http://localhost:5678> y créala otra vez |
| 8 | El chat responde `401` o pide iniciar sesión | El chat usa la cuenta de n8n: inicia sesión en <http://localhost:5678> en el mismo navegador y abre el chat otra vez |
| 9 | El chat dice «el modelo de lenguaje no respondió» | Mira el motivo con este comando, que no imprime la llave: `curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=$(grep ^GEMINI_API_KEY= .env \| cut -d= -f2-)" -H 'Content-Type: application/json' -d '{"contents":[{"parts":[{"text":"hola"}]}]}'`. Un `404` quiere decir que Google retiró el modelo para llaves nuevas: elige otro de la lista de `…/v1beta/models?key=…` y cámbialo en el nodo **Modelo Gemini**. Un `429` es cuota agotada: espera o usa otro modelo. Un `400` con «API key not valid» es una llave mal pegada: corrígela y ejecuta `bash n8n/configurar.sh` |
| 10 | El chat no encuentra personas por parecido | Falta el índice: ejecuta **Reindexar todo** (sección 3.3) |
| 11 | El menú marca «Consulta en lenguaje natural» como «Todavía no está configurado» | `N8N_CHAT_URL` está vacía en `.env`. Pon el valor de `.env.example` y ejecuta `docker compose up -d frontend` |
| 12 | `configurar.sh` dice «n8n no está arriba y sano» | Espera unos segundos y revisa `docker compose ps n8n`. Si no arranca, `docker compose logs --tail 100 n8n` |
| 13 | `configurar.sh` dice «Falta GEMINI_API_KEY» o «Falta N8N_LOG_API_KEY» | Completa esa variable en `.env` y repite el script |
| 14 | En Git Bash, un comando con `docker compose exec` falla con una ruta rara (`C:/Program Files/Git/…`) | Git Bash convierte las rutas que empiezan por `/`. Antepón `MSYS_NO_PATHCONV=1` al comando |
| 15 | `permission denied` o la base no tiene tablas después de cambiar una contraseña | Las contraseñas de la base se asignan una sola vez. Recrea el volumen con `docker compose down -v` (borra los datos locales) y vuelve a arrancar |
| 16 | Un servicio queda en `Restarting` | `docker compose logs --tail 100 <servicio>`. Casi siempre es una variable de `.env` vacía o incorrecta |

Si algo falla y no está aquí, `CONTEXTO.md` (sección 3) tiene la lista de comprobaciones al día, y cada carpeta (`database/`, `keycloak/`, `n8n/`, `frontend/`, `services/ms-log/`, `tests/postman/`) tiene su propio `README.md`.
