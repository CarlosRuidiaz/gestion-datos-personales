# Propuesta de rediseño visual del frontend (T22)

Esta es la guía para hacer la **T23**: cambiar la apariencia del frontend para que deje de verse como una plantilla genérica, sin perder simpleza. Está escrita para que la pueda hacer cualquier integrante, con la IA que prefiera.

- **Boceto visual:** abre [`boceto.html`](boceto.html) en el navegador (doble clic). Muestra la paleta, la tipografía y cuatro pantallas con datos ficticios. Es solo una referencia: no forma parte de la aplicación.
- **Estado y responsable de la T23:** en el tablero de [`CONTEXTO.md`](../../CONTEXTO.md).

## 1. Qué cambia y qué no

Cambia solo la presentación:

- `frontend/src/estilos.css`
- el marcado de `Marco.tsx` y `Menu.tsx`
- algunos contenedores de `FichaPersona.tsx`, `TablaLog.tsx`, `FormularioPersona.tsx` y `ConsultarLog.tsx`

No cambia:

- la lógica de las pantallas, las rutas ni las llamadas a la API
- los permisos por rol
- los textos de los mensajes

Restricciones que vienen del enunciado y del diseño (sección 8.2 de `docs/diseno/documento_diseno.md`), y que el rediseño debe respetar:

- **Menú principal.** Sigue existiendo, con las seis opciones del enunciado y solo las del rol. Consultar se marca como no disponible cuando su servicio está apagado, y el chat se abre en una pestaña nueva.
- **Formulario y ficha.** Se mantiene la distribución del prototipo del enunciado: los datos de identificación arriba con la foto a la derecha, una línea y debajo el contacto.
- **Confirmación del borrado.** Se mantiene, con el foco inicial en «Cancelar».

Para que las pruebas sigan pasando (`npm test` en `frontend/`, 82 pruebas), no cambies:

- los atributos `data-*`;
- los `id` de los campos;
- los `href`;
- los `role`;
- las clases `resultado exito` y `resultado error` de la tabla del log.

Todo lo demás se puede reorganizar.

## 2. Qué hace que hoy se vea genérico

| Hoy | Por qué se ve genérico | Propuesta |
| --- | --- | --- |
| Fuente del sistema (`system-ui`) | Es la que sale por defecto en cualquier plantilla | Una sola familia elegida a propósito: Public Sans |
| Azul corporativo `#1f5fa8` sobre gris neutro | Es el primer color que elige cualquier generador | Verde petróleo con grises verdosos |
| Menú hecho de tarjetas iguales con borde y esquinas redondeadas | Es el «kit de tarjetas SaaS», el rasgo más común de las páginas hechas por IA | Índice en filas con línea divisoria y una barra lateral de navegación fija |
| Mismo radio y mismo borde en todo | No hay jerarquía: todo pesa igual | Radios y bordes según la función (sección 4.4) |
| Ficha como una lista de campos más | No se distingue el dato principal | Ficha con forma de documento: nombre y número de documento destacados |

## 3. Idea de diseño

El tema del producto es un **registro de datos personales**, un expediente de identidad. Sus referencias visuales son los documentos de identidad y los formularios oficiales: papel claro, tinta, campos bien alineados, el número de documento como dato principal y la foto en formato carné.

Principios:

1. **Un solo elemento con carácter: la barra lateral en verde petróleo oscuro.** Todo lo demás es tranquilo: fondo claro, líneas finas y nada de sombras ni degradados.
2. **El número de documento es el dato principal.** En la ficha, en la búsqueda y en el log va con cifras tabulares (todas del mismo ancho), para que se lea y se compare fácil.
3. **La estructura informa.** Las líneas separan grupos reales: identificación y contacto, o las filas de la tabla. No se ponen etiquetas ni numeraciones que no digan nada.
4. **Densidad de herramienta de trabajo.** Es una aplicación que se usa para registrar y consultar, no una página de presentación. No lleva animaciones de entrada ni efectos al pasar el ratón por todo; solo cambios de estado que respondan a lo que hace el usuario.

## 4. Sistema visual

Todos los valores van como variables en `:root`, al principio de `estilos.css`. Ya existe ese bloque: se reemplaza.

### 4.1 Colores

| Variable | Valor | Uso |
| --- | --- | --- |
| `--papel` | `#F2F4F3` | Fondo de la página |
| `--superficie` | `#FFFFFF` | Fichas, formularios y tabla |
| `--tinta` | `#1B2B2A` | Texto principal |
| `--tinta-suave` | `#4D605D` | Etiquetas, ayudas y texto secundario |
| `--linea` | `#CFD8D5` | Líneas divisorias y bordes de contenedores |
| `--borde-campo` | `#768884` | Borde de los campos de formulario |
| `--petroleo` | `#1E5A55` | Botón principal, enlaces y foco |
| `--petroleo-oscuro` | `#15433F` | Barra lateral y botón principal al pasar el ratón |
| `--petroleo-claro` | `#E3EEEC` | Opción activa del menú y fila seleccionada |
| `--carmin` | `#9E1C2C` | Errores y botón de borrar |
| `--carmin-claro` | `#F8E8EA` | Fondo de la alerta de error |
| `--exito` | `#2B6A3D` | Texto de éxito |
| `--exito-claro` | `#E7F2EA` | Fondo de la alerta de éxito |
| `--aviso` | `#835400` | Texto de aviso (servicio no disponible) |
| `--aviso-claro` | `#FBF1DE` | Fondo del aviso |

Contraste medido con la fórmula WCAG 2.1. Todos los textos cumplen AA (4,5:1) y los bordes de los campos cumplen 3:1:

- `--tinta` sobre `--papel`: 13,3
- `--tinta-suave` sobre blanco: 6,7
- `--petroleo` sobre blanco: 7,9
- blanco sobre `--petroleo-oscuro`: 11,0
- `--carmin` sobre blanco: 7,9
- `--exito` sobre su fondo: 5,7
- `--aviso` sobre su fondo: 5,8
- `--borde-campo` sobre blanco: 3,7

Evita grises puros y negro puro: todos los neutros llevan un poco de verde, para que combinen con el petróleo.

### 4.2 Tipografía

- **Familia:** [Public Sans](https://public-sans.digital.gov/), una sola para todo. Es la tipografía del sistema de diseño del gobierno de Estados Unidos, hecha para formularios y trámites, y libre (licencia OFL). Su tono institucional encaja con un registro de datos personales sin ser la opción de siempre.
- **Instalación:** con el paquete `@fontsource-variable/public-sans` (sección 6). Las fuentes quedan dentro de la imagen de Nginx: no se carga nada desde Google, así la aplicación no depende de internet ni avisa a terceros de quién la usa.
- **Cifras:** `font-variant-numeric: tabular-nums` en el número de documento, las fechas, el celular y toda la tabla del log.

Escala (base de 16 px):

| Uso | Tamaño | Peso | Interlineado |
| --- | --- | --- | --- |
| Título de pantalla (`h1`) | 1,75 rem (28 px) | 650 | 1,2 |
| Nombre en la ficha | 1,5 rem (24 px) | 600 | 1,25 |
| Número de documento en la ficha | 1,25 rem (20 px), cifras tabulares | 600 | 1,3 |
| Título de sección (`h2`) | 1,125 rem (18 px) | 600 | 1,3 |
| Texto y campos | 1 rem (16 px) | 400 | 1,5 |
| Etiquetas de campo | 0,875 rem (14 px) | 500 | 1,4 |
| Ayudas y notas | 0,875 rem (14 px) | 400 | 1,4 |
| Tabla del log | 0,875 rem (14 px), cifras tabulares | 400 | 1,4 |

Reglas:

- Los títulos llevan `letter-spacing: -0.01em`; el texto normal, ninguno.
- Nada en mayúsculas sostenidas: las etiquetas van en mayúscula inicial, como ya están.
- Ancho de lectura de 70 caracteres como máximo en textos largos (`max-width: 70ch`).

### 4.3 Espaciado

Escala de 4 px: `--e1: 0.25rem`, `--e2: 0.5rem`, `--e3: 0.75rem`, `--e4: 1rem`, `--e6: 1.5rem`, `--e8: 2rem`, `--e12: 3rem`.

- Más espacio arriba de un título que abajo: `h1` con 0 arriba y `--e6` abajo; `h2` con `--e8` arriba y `--e3` abajo.
- Entre campos del formulario, `--e4`; entre grupos (identificación y contacto), `--e8` con la línea en medio.
- En el móvil, el relleno de la página baja de `--e8` a `--e4`.

### 4.4 Bordes, radios y sombras

- **Campos y botones:** radio de 4 px y borde de 1 px. Los campos usan `--borde-campo` y los botones secundarios usan `--petroleo`.
- **Contenedores (ficha, formulario, tabla):** radio de 6 px y borde de 1 px `--linea`, sin sombra.
- **Diálogo de confirmación del borrado:** es el único elemento con sombra (`0 8px 24px rgba(21, 67, 63, 0.18)`), porque es el único que flota sobre la página.
- **Foto:** formato carné 3:4, radio de 2 px y borde de 1 px `--linea`.
- **Foco visible en todo lo que se pueda usar con el teclado:** `outline: 2px solid var(--petroleo); outline-offset: 2px`.

### 4.5 Botones

| Clase | Aspecto |
| --- | --- |
| `.boton` | Fondo `--petroleo`, texto blanco y peso 600. Al pasar el ratón, `--petroleo-oscuro`. Alto mínimo de 40 px |
| `.boton.secundario` | Fondo blanco, borde y texto `--petroleo`. Al pasar el ratón, fondo `--petroleo-claro` |
| `.boton.peligro` (nueva, solo en «Sí, borrar») | Fondo `--carmin` y texto blanco |
| `.enlace` | Texto `--petroleo` subrayado, sin fondo |
| `:disabled` | Opacidad de 0,5 y cursor `not-allowed` |

## 5. Pantallas

En `boceto.html` están dibujadas el menú, Consultar con la ficha, el formulario de crear y el log.

### 5.1 Marco (todas las pantallas)

```
┌────────────┬──────────────────────────────────────────────┐
│ Gestión de │                                              │
│ Datos      │  Título de la pantalla                       │
│ Personales │                                              │
│            │  contenido (máx. 64 rem de ancho)            │
│ Inicio     │                                              │
│ Crear      │                                              │
│ Modificar  │                                              │
│ Consultar  │                                              │
│ Chat ↗     │                                              │
│ Borrar     │                                              │
│ Log        │                                              │
│            │                                              │
│ admin.     │                                              │
│ prueba     │                                              │
│ Admin.     │                                              │
│ [Salir]    │                                              │
└────────────┴──────────────────────────────────────────────┘
```

- **Barra lateral fija de 15 rem**, con fondo `--petroleo-oscuro` y texto blanco. Lleva el nombre de la aplicación, las opciones del rol, y abajo el usuario, el rol y «Cerrar sesión».
- **Las opciones salen de `opcionesDelMenu()`,** la misma función del menú principal, así no se duplica la regla de qué ve cada rol.
- **Opción activa:** fondo `--petroleo-claro` y texto `--petroleo-oscuro`. Se hace con `NavLink` de react-router, que ya está instalado.
- **Consultar no disponible:** se muestra atenuada, con «No disponible» debajo y sin enlace.
- **En el móvil (menos de 48 rem):** la barra se vuelve una franja superior con el nombre y un botón «Menú» que despliega las opciones. El contenido ocupa todo el ancho.

### 5.2 Menú principal

Deja de ser una cuadrícula de tarjetas. Pasa a ser un índice: una lista de filas sobre una superficie blanca, separadas por líneas finas.

```
Menú principal
Hola, admin.prueba. Tienes el rol Administrador.

┌───────────────────────────────────────────────────────────┐
│ Crear personas                                            │
│ Registrar una persona nueva                               │
├───────────────────────────────────────────────────────────┤
│ Consultar datos personales                No disponible   │
│ Ver la ficha completa de una persona                      │
├───────────────────────────────────────────────────────────┤
│ Consulta en lenguaje natural          Abre una pestaña ↗  │
│ ...                                                       │
└───────────────────────────────────────────────────────────┘
```

- **Cada fila es un enlace:** el título va en `--tinta` y peso 600, y la descripción en `--tinta-suave`. El estado va alineado a la derecha.
- **Al pasar el ratón,** solo cambia el fondo de la fila a `--papel`. No se mueve ni crece.
- **Se conserva lo que miran las pruebas:** los mismos `data-opcion`, `aria-disabled` y `href`.

### 5.3 Ficha de persona (Consultar y Borrar)

Es el elemento más cuidado, y se parece a un documento:

```
┌───────────────────────────────────────────────────────────┐
│ Cédula                                        ┌────────┐  │
│ 1043123456   (cifras tabulares, 20 px)        │        │  │
│ Pedro Andrés Pérez Gómez  (24 px)             │  foto  │  │
│                                               │  3:4   │  │
│ Fecha de nacimiento   Género                  └────────┘  │
│ 05-mar-2003           Masculino                           │
├───────────────────────────────────────────────────────────┤
│ Correo electrónico              Celular                   │
│ pedro.perez@example.com         300 123 4567              │
└───────────────────────────────────────────────────────────┘
```

- **Arriba va lo que identifica a la persona:** el tipo de documento como etiqueta, el número grande y el nombre completo como título. Debajo, en una cuadrícula de dos columnas, la fecha de nacimiento y el género.
- **Los campos sueltos de nombre desaparecen de la ficha:** primer nombre, segundo nombre y apellidos ya se leen en el nombre completo. En el formulario siguen separados, porque ahí se escriben por separado.
- **El celular** se muestra agrupado de a 3, 3 y 4 cifras para leerlo mejor; lo que se guarda no cambia.
- **«No registrado»** va en `--tinta-suave` y cursiva.
- **La foto va a la derecha y la línea separa el contacto,** como en el prototipo del enunciado.

### 5.4 Formulario (Crear y Modificar)

- **La distribución es la misma de hoy:** identificación con la foto a la derecha, una línea y el contacto.
- **Cada campo tiene un ancho según su contenido**, no todos iguales:
  - documento, celular y fecha: unos 14 rem;
  - nombres: media columna;
  - apellidos y correo: columna completa.
- **Etiqueta arriba del campo,** en 14 px y peso 500. El asterisco de obligatorio va en `--carmin`.
- **Error del campo:** el borde pasa a `--carmin` y el mensaje sale debajo en `--carmin`, con 14 px.
- **Acciones:** «Guardar» (`.boton`) y «Cancelar» (`.boton.secundario`), alineados a la izquierda debajo del formulario, no a la derecha. Así quedan cerca del último campo.

### 5.5 Borrar

- **La ficha es la misma de Consultar.**
- **La confirmación es un panel con borde superior de 4 px en `--carmin`** y la sombra de la sección 4.4. Lleva la pregunta «¿Borrar a ...?» en 18 px, la advertencia de que no se puede deshacer y los botones «Cancelar» (secundario, con el foco) y «Sí, borrar» (`.boton.peligro`).

### 5.6 Consultar log

```
Consultar log
┌────────────────────────────────────────────────────────────┐
│ Tipo [Todos ▾]  Documento [        ]  Desde [  ]  Hasta [  ]│
│ [Buscar] [Limpiar]                                         │
└────────────────────────────────────────────────────────────┘
45 transacciones · página 1 de 3

Fecha y hora           Tipo        Documento   Usuario       Resultado
24-nov-2026 08:15:02   Crear       1043123456  admin.prueba  Éxito
...
```

- **Los filtros van en una sola franja** sobre fondo `--superficie`, con los cuatro campos en línea en el escritorio y apilados en el móvil.
- **La tabla no tiene rayas de cebra** y cada fila lleva una línea inferior `--linea`.
- **La cabecera** va en `--tinta-suave`, 14 px y peso 600. Al desplazarse, queda fija arriba (`position: sticky`).
- **El resultado** es texto con un punto de color delante: `--exito` para Éxito y `--carmin` para Error. No va en una pastilla de fondo.
- **El tipo** es texto normal, sin colores: el color se reserva para el resultado.
- **«Ver detalle completo»** se despliega dentro de la misma celda, con el JSON sobre fondo `--papel`.
- **En el móvil,** la tabla se desplaza horizontalmente dentro de su contenedor (ya pasa hoy con `.tabla-contenedor`).

## 6. Herramientas

No hace falta instalar ninguna biblioteca de componentes, ni Tailwind, ni nada de pago. El frontend ya tiene todo lo necesario y el cambio se hace con CSS normal.

| Herramienta | Para qué | Cómo |
| --- | --- | --- |
| Skill `frontend-design` de Anthropic | Guía de diseño para la IA: evita los rasgos típicos de interfaces generadas y pide revisar el resultado con capturas | Ya está en el repositorio: `.claude/skills/frontend-design/` (licencia Apache 2.0). Claude Code la carga solo. Con Codex, Cursor u otra IA, pídele que lea `.claude/skills/frontend-design/SKILL.md` antes de empezar |
| `@fontsource-variable/public-sans` | La tipografía, servida desde la propia aplicación | `cd frontend && npm install @fontsource-variable/public-sans@5.3.0` y en `src/main.tsx` agrega `import '@fontsource-variable/public-sans';`. En `:root` usa `font-family: 'Public Sans Variable', system-ui, sans-serif;` |
| `npm run dev` en `frontend/` | Ver los cambios al instante mientras se edita | Con el sistema arriba (`docker compose up -d`), Vite sirve en <http://localhost:5173> y manda `/api` al gateway. Inicia sesión con `admin.prueba` o `consultor.prueba` (contraseñas en `.env`) |
| Herramientas de desarrollo del navegador (F12) | Probar en tamaño móvil (375 px) y revisar el contraste | Modo de dispositivo para el móvil. Al inspeccionar un texto, el selector de color muestra su contraste |
| `npm test` en `frontend/` | Confirmar que no se rompió nada | Deben pasar las 82 pruebas |
| `bash frontend/verificar.sh` | Confirmar que la imagen de Docker sigue sirviendo la aplicación | Debe terminar sin fallos |

Sobre otras herramientas que se consideraron:

- **scroll-craft** (nateherkai/scroll-craft) está hecha para páginas de presentación con animaciones al desplazarse, videos y 3D. No encaja en una herramienta de formularios y tablas.
- **Tailwind o una biblioteca de componentes (MUI, shadcn)** obligaría a reescribir el marcado de todas las pantallas para un cambio que es solo de estilo. Además, sus valores por defecto son justamente los que hacen que todo se vea igual.

## 7. Pasos para hacer la T23

1. **Reserva la T23** según el protocolo de `CONTEXTO.md` y crea la rama `feat/T23-rediseno-visual`.
2. **Abre `docs/rediseno/boceto.html`** y deja este documento a mano. Si usas una IA, pídele: «Lee `CONTEXTO.md`, `docs/rediseno/README.md` y `.claude/skills/frontend-design/SKILL.md`, y haz la T23 siguiendo la propuesta».
3. **Instala la tipografía** (sección 6) y reemplaza el bloque `:root` de `estilos.css` con las variables de la sección 4.
4. **Cambia el marco y el menú:** la barra lateral de `Marco.tsx` y el índice de `Menu.tsx`. Verifica con los dos usuarios de prueba que cada rol ve solo sus opciones.
5. **Rehaz la ficha** (`FichaPersona.tsx`) y revisa Consultar y Borrar, incluida la confirmación.
6. **Ajusta el formulario:** anchos de campo, errores y acciones. Prueba crear y modificar con datos inválidos para ver los errores.
7. **Ajusta el log:** filtros, tabla, resultado y detalle. Revisa la paginación.
8. **Revisa cada pantalla** en el escritorio y a 375 px de ancho, y recorre todo con el teclado (Tab) para comprobar que el foco siempre se ve.
9. **Comprueba ms-consultar apagado:** `docker compose stop ms-consultar`. Consultar debe verse no disponible en el menú y en la barra lateral.
10. **Corre las verificaciones:** `npm test` y `bash frontend/verificar.sh`.
11. **Actualiza `CONTEXTO.md`** (tablero, sección 5 y decisiones nuevas en la sección 7) y abre el pull request con capturas de antes y después.

## 8. Cómo saber si quedó bien

- [ ] Ninguna pantalla usa la fuente del sistema ni el azul anterior: en `estilos.css` no queda `#1f5fa8`.
- [ ] El menú principal no es una cuadrícula de tarjetas.
- [ ] La ficha muestra primero el número de documento y el nombre, con la foto a la derecha.
- [ ] La única sombra de la aplicación es la del diálogo de borrado.
- [ ] Ningún texto tiene contraste menor que 4,5:1.
- [ ] En 375 px no hay desplazamiento horizontal fuera de la tabla del log.
- [ ] El foco se ve en todos los botones, enlaces y campos.
- [ ] Pasan `npm test` (82) y `bash frontend/verificar.sh`.
- [ ] Con `consultor.prueba` solo se ven Consultar, Consulta en lenguaje natural y Consultar log.
