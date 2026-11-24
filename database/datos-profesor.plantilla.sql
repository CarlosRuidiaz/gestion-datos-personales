-- Plantilla de los datos del profesor (tarea T25).
--
-- 1. Copia este archivo como database/datos-profesor.sql (está en .gitignore: no se sube).
-- 2. Reemplaza la fila de ejemplo por las personas del correo del profesor.
-- 3. Ejecuta: bash database/cargar-datos-profesor.sh
--
-- El script vacía antes las personas, el log y el índice del chat, así que la base queda solo con estas
-- personas. Cada una recibe su registro CREAR en el log, con el usuario `datos-profesor`.

\encoding UTF8

WITH datos (numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
            fecha_nacimiento, genero, correo, celular) AS (
    VALUES
    -- Una fila por persona del correo del profesor. Sin foto. El segundo nombre puede ser NULL.
    -- Los valores deben cumplir las validaciones (sección 3.3 del diseño): si una fila no las cumple,
    -- no se carga NINGUNA. Las personas con datos inválidos a propósito se dejan fuera y se prueban
    -- en el formulario durante la demostración.
    ('1000000001', 'Cédula', 'Nombre', NULL, 'Apellido Apellido', DATE '2000-01-01', 'Femenino', 'nombre@example.com', '3000000000')
),
-- Inserta solo las que no existen y devuelve únicamente esas.
nuevas AS (
    INSERT INTO persona (numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
                         fecha_nacimiento, genero, correo, celular)
    SELECT * FROM datos
    ON CONFLICT (numero_documento) DO NOTHING
    RETURNING numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
              fecha_nacimiento, genero, correo, celular
)
-- Un CREAR por cada persona realmente insertada. El detalle tiene la misma forma
-- que el que escribe ms-crear: { nuevo: { ...datos de la persona sin la foto } }.
INSERT INTO log_transaccion (tipo, numero_documento, usuario, resultado, detalle)
SELECT 'CREAR', numero_documento, 'datos-profesor', 'EXITO',
       jsonb_build_object('nuevo', jsonb_build_object(
           'numeroDocumento', numero_documento,
           'tipoDocumento',   tipo_documento,
           'primerNombre',    primer_nombre,
           'segundoNombre',   segundo_nombre,
           'apellidos',       apellidos,
           'fechaNacimiento', to_char(fecha_nacimiento, 'YYYY-MM-DD'),
           'genero',          genero,
           'correo',          correo,
           'celular',         celular,
           'tieneFoto',       false))
FROM nuevas;

-- Resumen para quien lo ejecuta.
SELECT (SELECT count(*) FROM persona) AS personas_en_total,
       (SELECT count(*) FROM log_transaccion WHERE usuario = 'datos-profesor') AS registros_de_log_de_datos_profesor;
