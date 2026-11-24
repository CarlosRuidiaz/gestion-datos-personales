# Preparación de la sustentación

Guía para ensayar y presentar la demostración. El estado de las tareas está en [`CONTEXTO.md`](../CONTEXTO.md). Este documento solo dice cómo es la sustentación, qué debe estar listo y quién prepara qué.

## 1. Cómo es la sustentación

Lo que sigue lo contó un compañero de otro grupo que ya presentó (2026-11-23):

- El profesor pide la **demostración** casi desde el principio. Le importa que todo funcione en vivo, más que las diapositivas.
- Antes de empezar hay que tener **precargados los datos que mandó por correo** (unas 15 personas). En algún momento pide **borrar todo y dejar solo esas 15**, y sobre ellas hace las preguntas al chat. Él ya conoce las respuestas y las va comparando.
- Él dicta el recorrido y pregunta mientras avanza:
  1. **Iniciar sesión.** Pregunta cómo se hizo el SSO.
  2. **Crear** una persona con los datos que él dicta.
  3. **Modificar**, **consultar** y **borrar**.
  4. **Ver el log después de cada cambio.** Lo pide siempre, así que hay que tenerlo a mano.
  5. **Chat en lenguaje natural** sobre las 15 personas. Pregunta cómo funciona.
- Trae **datos inválidos a propósito**. Por ejemplo, un segundo nombre de más de 30 caracteres. La aplicación debe rechazarlo con un mensaje claro.
- Quiere un **botón en la aplicación para deshabilitar Consultar**, con el resto del sistema funcionando. A ese grupo le pidió un interruptor en la interfaz: no le bastó que lo apagaran desde el backend. Quiere que todo sea muy fácil de usar.
- Si la aplicación responde sola a todo, hace pocas preguntas. Si algo falla o falta, pregunta por todo.

## 2. Qué falta para estar listos

| Pendiente | Tarea | Estado |
| --- | --- | --- |
| Interruptor de Consultar en la aplicación | T24 | Hecho |
| Script para dejar la base solo con los datos del profesor | T25, T28 y T29 | Hecho y probado con el formato que recibió otro grupo (Excel y zip de fotos). Falta nuestro correo |
| Mensaje de error visible para nombres de más de 30 caracteres | T26 | Hecho |
| Rediseño visual | T23 | Hecho |

### 2.1 T24: interruptor de Consultar

En el menú principal, solo para el administrador, hay un interruptor «Servicio Consultar».
- Al apagarlo, `ms-control` detiene de verdad el contenedor de ms-consultar: en Docker Desktop se ve detenido.
- La opción Consultar pasa a «No disponible en este momento» en unos segundos, sin recargar la página.
- Al encenderlo, muestra «Encendiendo…» hasta que Consultar vuelve a responder.

Cómo está hecho, en `services/ms-control/README.md`. En resumen, para explicarlo si pregunta:
- Un microservicio más, `ms-control`, solo para el administrador.
- `ms-control` no toca Docker directamente. Le pide a `docker-proxy`, que solo deja listar, detener y arrancar contenedores.
- Traefik quita la ruta de Consultar en cuanto el contenedor se detiene, y la vuelve a poner cuando arranca.
- El comando `docker compose stop ms-consultar` sigue funcionando igual.

Para ensayarlo: `bash services/ms-control/verificar.sh`.

### 2.2 T25, T28 y T29: datos del profesor

Por lo que recibió otro grupo, el profesor manda un Excel (`grupo_N.xlsx`) con una fila por persona y las mismas columnas del formulario, más una columna «Foto», y un zip con las fotos (`archivos_jpg.zip`). El script ya está probado con ese formato: reconoce las 10 columnas y las fotos, y carga cada persona con la suya.

Cuando llegue el correo:

1. Crea `database/datos-profesor/` y pon ahí el Excel y el zip **tal como llegaron**. No se suben al repositorio.
2. Ese mismo día, corre `bash database/cargar-datos-profesor.sh --revisar`. Muestra qué columnas y fotos reconoció y qué filas quedan fuera y por qué, sin tocar la base.
3. La persona inválida a propósito (por ejemplo, el segundo nombre de más de 30 caracteres) queda fuera sola. Se prueba en el formulario para mostrar el mensaje de error.
4. Carga con `bash database/cargar-datos-profesor.sh`. Borra personas, log e índice, carga los datos con sus fotos y reindexa el chat.
5. Ensaya con las preguntas que se crea que hará el profesor y anota aquí las respuestas esperadas.

Detalles en `database/README.md`. Si en la sustentación pide «borrar todo y dejar solo mis datos», se corre `bash database/cargar-datos-profesor.sh --si`.

### 2.3 T26: nombres demasiado largos

Antes, los campos tenían `maxLength` y el navegador cortaba lo escrito en el carácter 30 sin avisar; un celular de 11 dígitos se cortaba a 10 y quedaba válido. Ya no se corta nada: al salir del campo, o al pulsar Guardar, aparece el mensaje, por ejemplo «El segundo nombre no puede tener más de 30 caracteres». Si alguien se salta el formulario, el backend también lo rechaza.

## 3. Antes de presentar

El día anterior:

- [ ] `git pull` en el equipo con el que se va a presentar.
- [ ] `docker compose --profile consultar up -d --build`, con todos los contenedores `healthy`.
- [ ] Cargar los datos del profesor con `bash database/cargar-datos-profesor.sh` (T25). Debe terminar en «Listo».
- [ ] Probar el interruptor de Consultar: apagar y encender una vez.
- [ ] Revisar que `GEMINI_API_KEY` esté en `.env` y que el chat responda. Llevar datos móviles por si falla el internet (riesgo de la sección 12 del diseño).
- [ ] Tener abiertas las pestañas:
  - la aplicación en <http://localhost>, con sesión de `admin.prueba`;
  - una ventana privada con `consultor.prueba`;
  - el chat de n8n;
  - Docker Desktop, para mostrar el contenedor de Consultar detenido.
- [ ] Preparar en un archivo aparte los datos para crear una persona válida y los casos inválidos:
  - segundo nombre de 31 caracteres;
  - nombre con números;
  - celular de 9 dígitos;
  - correo sin `@`;
  - fecha futura;
  - foto de más de 2 MB.
- [ ] Ensayar el recorrido completo una vez, cronometrado.

## 4. Guion de la demostración

Cada paso termina en el log cuando hay un cambio.

| Paso | Qué se muestra | Qué explicar si pregunta |
| --- | --- | --- |
| 1 | Iniciar sesión con el administrador | SSO con Keycloak: la aplicación redirige al login, Keycloak devuelve un token (OIDC con PKCE) y cada microservicio valida el token y el rol. El consultor ve menos opciones |
| 2 | Crear una persona con los datos que dicte | Validaciones en el formulario y de nuevo en el servicio. La foto es JPG o PNG de hasta 2 MB. La operación y su log van en la misma transacción |
| 3 | Log filtrado por documento | Filtros por tipo, documento y fechas. El log guarda quién, cuándo y qué |
| 4 | Intentar crear con datos inválidos | El mensaje dice qué campo falla. El backend también lo rechaza |
| 5 | Modificar la persona y ver el log | El log guarda el valor anterior y el nuevo de cada campo cambiado |
| 6 | Consultar la ficha | ms-consultar es un contenedor independiente |
| 7 | Apagar Consultar con el interruptor del menú (T24) | La opción queda como no disponible y Crear, Modificar, Borrar y Log siguen funcionando. Mostrar en Docker el contenedor detenido y volver a encenderlo |
| 8 | Borrar con confirmación y ver el log | El detalle del log conserva los datos que tenía la persona |
| 9 | Dejar la base solo con sus datos (T25) | `bash database/cargar-datos-profesor.sh --si`: vacía, carga y reindexa el chat |
| 10 | Chat en lenguaje natural | Agente de n8n con dos herramientas: SQL de solo lectura sobre `vista_personas` y búsqueda vectorial con pgvector (RAG). Gemini como modelo. Cada consulta queda en el log |
| 11 | Entrar como consultor | Solo ve Consultar, Consultar en lenguaje natural y Log (sección 2.2 del diseño) |

## 5. Preguntas probables

- **¿Cómo funciona el SSO?** Keycloak como proveedor de identidad (OIDC). Flujo de código con PKCE desde el navegador, token JWT con los roles, validado por cada microservicio con la llave pública del realm.
- **¿Por qué microservicios?** Uno por opción del menú, como pide el enunciado. Cada uno tiene su usuario de base de datos con permisos mínimos.
- **¿Cómo se apaga Consultar sin afectar lo demás?** Contenedor propio en su perfil de Compose. Traefik detecta en tiempo real si está o no. Las búsquedas previas de Modificar y Borrar no dependen de él.
- **¿Qué es el RAG aquí?** n8n indexa cada persona como texto con embeddings en `persona_embedding` (pgvector), cada vez que se crea, modifica o borra. El agente combina esa búsqueda con SQL para preguntas exactas (conteos, edades).
- **¿Cómo se garantiza que todo queda en el log?** La operación y el registro van en la misma transacción: si uno falla, no queda ninguno.
- **¿Dónde están las contraseñas?** Solo en `.env`, que no está en el repositorio. `.env.example` lista las variables sin valores.
