-- Datos de prueba: 20 personas ficticias y su registro CREAR en el log (tarea T17).
-- Se ejecuta con el superusuario, a mano, después de que la base ya existe:
--
--   bash database/cargar-datos-prueba.sh
--
-- Se puede repetir sin duplicar nada: una persona que ya existe no se vuelve a insertar
-- y tampoco se le agrega otro registro de log. Todo va en una sola sentencia, así que
-- no queda una persona sin su log. Los registros se distinguen de los de usuarios reales
-- por el usuario `datos-prueba`.
-- Solo datos ficticios: los correos son @example.com y los números de documento no son reales.

\encoding UTF8

WITH datos (numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
            fecha_nacimiento, genero, correo, celular) AS (
    VALUES
    ('1043123456', 'Cédula',               'Pedro',     'Andrés',   'Pérez Gómez',        DATE '2003-03-05', 'Masculino',           'pedro.perez@example.com',        '3001234567'),
    ('1045678901', 'Cédula',               'Andrea',    'Carolina', 'Gómez Peña',         DATE '1995-07-18', 'Femenino',            'andrea.gomez@example.com',       '3012345678'),
    ('1047890123', 'Cédula',               'Luis',      'Fernando', 'Martínez Rojas',     DATE '1988-11-02', 'Masculino',           'luis.martinez@example.com',      '3023456789'),
    ('1002345678', 'Cédula',               'María',     'José',     'Rodríguez Silva',    DATE '1992-01-25', 'Femenino',            'maria.rodriguez@example.com',    '3034567890'),
    ('72345678',   'Cédula',               'Carlos',    'Eduardo',  'Torres Mejía',       DATE '1979-09-14', 'Masculino',           'carlos.torres@example.com',      '3045678901'),
    ('1129876543', 'Cédula',               'Valentina', NULL,       'Herrera Ospino',     DATE '2001-05-30', 'Femenino',            'valentina.herrera@example.com',  '3056789012'),
    ('1048765432', 'Cédula',               'Santiago',  NULL,       'Vargas Cantillo',    DATE '1999-12-09', 'Masculino',           'santiago.vargas@example.com',    '3067890123'),
    ('32987654',   'Cédula',               'Ana',       'Lucía',    'Barrios Pacheco',    DATE '1975-04-21', 'Femenino',            'ana.barrios@example.com',        '3078901234'),
    ('1143210987', 'Cédula',               'Camilo',    'Andrés',   'Zúñiga Marín',       DATE '1990-08-16', 'Masculino',           'camilo.zuniga@example.com',      '3089012345'),
    ('1044321098', 'Cédula',               'Daniela',   'Sofía',    'Mendoza Arrieta',    DATE '2000-02-11', 'Femenino',            'daniela.mendoza@example.com',    '3090123456'),
    ('1050123456', 'Cédula',               'Alex',      'Jordán',   'Ríos Caicedo',       DATE '1997-06-03', 'No binario',          'alex.rios@example.com',          '3101234567'),
    ('1051234567', 'Cédula',               'Sam',       NULL,       'Rivera Navarro',     DATE '1994-10-27', 'Prefiero no reportar','sam.rivera@example.com',         '3112345678'),
    ('8765432',    'Cédula',               'Jorge',     'Iván',     'Castro Lara',        DATE '1968-03-08', 'Masculino',           'jorge.castro@example.com',       '3123456789'),
    ('1046543210', 'Cédula',               'Laura',     'Marcela',  'Ortega Duarte',      DATE '1985-12-19', 'Femenino',            'laura.ortega@example.com',       '3134567890'),
    ('1007654321', 'Cédula',               'Mateo',     'Esteban',  'Cabrera Polo',       DATE '2004-09-23', 'Masculino',           'mateo.cabrera@example.com',      '3145678901'),
    ('1048901234', 'Cédula',               'Isabella',  NULL,       'Charris Visbal',     DATE '1998-04-07', 'Femenino',            'isabella.charris@example.com',   '3156789012'),
    ('22345678',   'Cédula',               'Rosa',      'Elena',    'Fontalvo Támara',    DATE '1962-01-30', 'Femenino',            'rosa.fontalvo@example.com',      '3167890123'),
    ('1201234567', 'Tarjeta de identidad', 'Juliana',   'Paola',    'Mora Escorcia',      DATE '2009-06-14', 'Femenino',            'juliana.mora@example.com',       '3178901234'),
    ('1202345678', 'Tarjeta de identidad', 'Nicolás',   NULL,       'Pardo Acosta',       DATE '2010-02-03', 'Masculino',           'nicolas.pardo@example.com',      '3189012345'),
    ('1203456789', 'Tarjeta de identidad', 'Emilia',    NULL,       'Quintero Beltrán',   DATE '2008-10-12', 'Femenino',            'emilia.quintero@example.com',    '3190123456')
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
SELECT 'CREAR', numero_documento, 'datos-prueba', 'EXITO',
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
       (SELECT count(*) FROM log_transaccion WHERE usuario = 'datos-prueba') AS registros_de_log_de_datos_prueba;
