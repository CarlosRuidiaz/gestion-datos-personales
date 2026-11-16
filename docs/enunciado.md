# Enunciado del trabajo final: Diseño de Software II (periodo 202630)

Transcripción fiel del archivo `trabajo_final _202630.pptx` entregado por el profesor.

Trabajo final en grupo.

## Aplicación de Gestión de Datos Personales

### Menú principal

- Crear Personas
- Modificar Datos Personales
- Consultar Datos Personales
- Consultar Datos personales – Lenguaje Natural (en la interfaz de n8n)
- Borrar Personas
- Consultar log

### Campos de la pantalla principal

El prototipo del enunciado muestra un formulario con una foto a la derecha de los datos de identificación y, debajo de una línea, los datos de contacto.

- Primer Nombre
- Segundo Nombre
- Apellidos
- Fecha de Nacimiento
- Género
- Correo electrónico
- Celular
- Nro. Documento
- Tipo de documento
- Foto

### Consulta en lenguaje natural: implementación de RAG

Ejemplo del enunciado:

- Pregunta: «¿Cuál es el empleado más joven que se ha registrado?»
- Respuesta: «Pedro Pérez»

Se debe utilizar el patrón RAG para responder a las preguntas que realice el usuario en lenguaje natural.

Esta implementación se debe hacer utilizando n8n, es decir, el chat en donde se hace la pregunta y la respuesta se deben ver en la interfaz de n8n.

### Validaciones requeridas

- Tipo de documento: debe ser una lista con dos valores: Tarjeta de identidad, Cédula.
- Nro. Documento: se debe validar que sea número y no mayor de 10 caracteres.
- Primer Nombre: se debe validar que no sea número y no mayor de 30 caracteres.
- Segundo Nombre: se debe validar que no sea número y no mayor de 30 caracteres.
- Apellidos: se debe validar que no sea número y no mayor de 60 caracteres.
- Fecha de Nacimiento: se debe poder escoger de un calendario o escribir en formato dd-mmm-yyyy.
- Género: debe ser una lista con 4 valores: Masculino, Femenino, No binario, Prefiero no reportar.
- Correo electrónico: se debe validar formato de correo electrónico.
- Celular: se debe validar que sea número y de 10 caracteres.
- Foto: se debe validar que el tamaño del archivo no supere los 2 MB.
- Consulta en lenguaje natural utilizando n8n y aplicando RAG.
- Toda transacción debe registrarse en el log, esto incluye las preguntas y respuestas en lenguaje natural.

### Requerimientos y rúbrica (50 puntos)

| Actividad | Puntos |
| --- | --- |
| Utilizar un sistema de autenticación como Microsoft Entra, el Proyecto Roble o cualquier otro SSO reconocido | 4 |
| La aplicación debe desplegarse en contenedores. La aplicación debe tener la funcionalidad de un CRUD y adicionalmente registrar todas las transacciones en un log. Es decir, se podrán crear, eliminar, actualizar y consultar registros. La llave de búsqueda de los registros es el documento | 15 |
| Consulta en lenguaje natural utilizando n8n y aplicando RAG | 12 |
| Los campos a capturar son los mostrados en la pantalla principal | 2 |
| Realizar las validaciones requeridas | 4 |
| Cada opción del menú se debe desarrollar en un microservicio | 5 |
| La opción de «Consultar» debe estar en un contenedor independiente al del resto de la aplicación y se debe poder habilitar y deshabilitar según demanda | 3 |
| La base de datos debe estar en un contenedor independiente al del resto de la aplicación | 2 |
| La opción de consulta de log debe permitir búsqueda por tipo y documento, y por fecha de transacción | 3 |
