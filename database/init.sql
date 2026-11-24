-- Inicialización de la base de datos de Gestión de Datos Personales.
-- PostgreSQL ejecuta este archivo una sola vez, cuando el volumen pgdata está vacío.
-- Si lo cambias, recrea el volumen: docker compose down -v && docker compose up -d
--
-- Referencia: secciones 6.1, 6.2 y 6.3 de docs/diseno/documento_diseno.md.
-- Las contraseñas de los usuarios NO van aquí: las pone database/init-usuarios.sh
-- a partir de las variables DB_PASSWORD_* del archivo .env.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Tabla persona: datos del formulario. La llave es el número de documento.
-- Los CHECK repiten las validaciones de la sección 3.3 como última barrera;
-- los mensajes para el usuario los dan el frontend y los DTO de cada servicio.
-- ---------------------------------------------------------------------------
CREATE TABLE persona (
    numero_documento    VARCHAR(10)  PRIMARY KEY,
    tipo_documento      VARCHAR(20)  NOT NULL,
    primer_nombre       VARCHAR(30)  NOT NULL,
    segundo_nombre      VARCHAR(30),
    apellidos           VARCHAR(60)  NOT NULL,
    fecha_nacimiento    DATE         NOT NULL,
    genero              VARCHAR(25)  NOT NULL,
    correo              VARCHAR(100) NOT NULL,
    celular             CHAR(10)     NOT NULL,
    foto                BYTEA,
    foto_tipo           VARCHAR(20),
    fecha_creacion      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT persona_documento_chk  CHECK (numero_documento ~ '^[0-9]{1,10}$'),
    CONSTRAINT persona_tipo_doc_chk   CHECK (tipo_documento IN ('Tarjeta de identidad', 'Cédula')),
    CONSTRAINT persona_nombre1_chk    CHECK (btrim(primer_nombre) <> '' AND primer_nombre !~ '[0-9]'),
    CONSTRAINT persona_nombre2_chk    CHECK (segundo_nombre IS NULL OR (btrim(segundo_nombre) <> '' AND segundo_nombre !~ '[0-9]')),
    CONSTRAINT persona_apellidos_chk  CHECK (btrim(apellidos) <> '' AND apellidos !~ '[0-9]'),
    CONSTRAINT persona_nacimiento_chk CHECK (fecha_nacimiento <= CURRENT_DATE),
    CONSTRAINT persona_genero_chk     CHECK (genero IN ('Masculino', 'Femenino', 'No binario', 'Prefiero no reportar')),
    CONSTRAINT persona_correo_chk     CHECK (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    CONSTRAINT persona_celular_chk    CHECK (celular ~ '^[0-9]{10}$'),
    -- Foto opcional: JPG o PNG de hasta 2 MB. La imagen y su tipo van juntos o no van.
    CONSTRAINT persona_foto_chk       CHECK (
        (foto IS NULL AND foto_tipo IS NULL)
        OR (foto IS NOT NULL AND foto_tipo IN ('image/jpeg', 'image/png') AND octet_length(foto) <= 2097152)
    )
);

-- ---------------------------------------------------------------------------
-- Tabla log_transaccion: auditoría. Solo admite INSERT y SELECT (ver permisos).
-- numero_documento NO es llave foránea: el historial se conserva al borrar la persona.
-- ---------------------------------------------------------------------------
CREATE TABLE log_transaccion (
    id               BIGSERIAL    PRIMARY KEY,
    fecha_hora       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    tipo             VARCHAR(20)  NOT NULL,
    numero_documento VARCHAR(10),
    usuario          VARCHAR(100) NOT NULL,
    resultado        VARCHAR(10)  NOT NULL,
    detalle          JSONB,
    pregunta         TEXT,
    respuesta        TEXT,

    CONSTRAINT log_tipo_chk      CHECK (tipo IN ('CREAR', 'MODIFICAR', 'CONSULTAR', 'BORRAR', 'CONSULTA_NL')),
    CONSTRAINT log_resultado_chk CHECK (resultado IN ('EXITO', 'ERROR'))
);

-- Los tres filtros de la consulta del log (RF-07).
CREATE INDEX idx_log_tipo             ON log_transaccion (tipo);
CREATE INDEX idx_log_numero_documento ON log_transaccion (numero_documento);
CREATE INDEX idx_log_fecha_hora       ON log_transaccion (fecha_hora);

-- ---------------------------------------------------------------------------
-- Tabla persona_embedding: vectores del RAG. La administra n8n.
-- Tiene la forma que espera el nodo Postgres PGVector Store de n8n
-- (id, text, metadata, embedding). El documento va en metadata->>'numero_documento'.
-- La columna embedding no fija la dimensión: depende del modelo de embeddings
-- de Gemini que se use (gemini-embedding-001, 3072 dimensiones).
-- ---------------------------------------------------------------------------
CREATE TABLE persona_embedding (
    id        UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    text      TEXT  NOT NULL,
    metadata  JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding VECTOR
);

-- Para borrar o reemplazar el vector de una persona por su documento.
CREATE INDEX idx_persona_embedding_documento ON persona_embedding ((metadata ->> 'numero_documento'));

-- ---------------------------------------------------------------------------
-- Vista vista_personas: persona sin la foto y con la edad calculada.
-- Es la única fuente que puede leer la herramienta SQL del agente de n8n.
-- ---------------------------------------------------------------------------
CREATE VIEW vista_personas AS
SELECT
    numero_documento,
    tipo_documento,
    primer_nombre,
    segundo_nombre,
    apellidos,
    fecha_nacimiento,
    date_part('year', age(CURRENT_DATE, fecha_nacimiento))::int AS edad,
    genero,
    correo,
    celular,
    fecha_creacion
FROM persona;

-- ---------------------------------------------------------------------------
-- Usuarios de base de datos: uno por servicio, con permisos mínimos (sección 6.3).
-- Se crean sin contraseña (no pueden iniciar sesión por red hasta que
-- init-usuarios.sh se la asigna).
-- ---------------------------------------------------------------------------
CREATE ROLE usr_crear     LOGIN;
CREATE ROLE usr_modificar LOGIN;
CREATE ROLE usr_consultar LOGIN;
CREATE ROLE usr_borrar    LOGIN;
CREATE ROLE usr_log       LOGIN;
CREATE ROLE usr_n8n       LOGIN;

-- Nadie recibe permisos por defecto.
REVOKE ALL ON persona, log_transaccion, persona_embedding, vista_personas FROM PUBLIC;

-- ms-crear
GRANT SELECT, INSERT ON persona         TO usr_crear;
GRANT INSERT         ON log_transaccion TO usr_crear;

-- ms-modificar
GRANT SELECT, UPDATE ON persona         TO usr_modificar;
GRANT INSERT         ON log_transaccion TO usr_modificar;

-- ms-consultar
GRANT SELECT         ON persona         TO usr_consultar;
GRANT INSERT         ON log_transaccion TO usr_consultar;

-- ms-borrar
GRANT SELECT, DELETE ON persona         TO usr_borrar;
GRANT INSERT         ON log_transaccion TO usr_borrar;

-- ms-log
GRANT SELECT, INSERT ON log_transaccion TO usr_log;

-- El id del log es BIGSERIAL: para insertar hace falta usar su secuencia.
GRANT USAGE ON SEQUENCE log_transaccion_id_seq
    TO usr_crear, usr_modificar, usr_consultar, usr_borrar, usr_log;

-- n8n: solo lee la vista y administra la tabla de vectores.
GRANT SELECT ON vista_personas TO usr_n8n;
ALTER TABLE persona_embedding OWNER TO usr_n8n;

-- Ningún usuario tiene UPDATE, DELETE ni TRUNCATE sobre log_transaccion:
-- la auditoría no se puede alterar desde la aplicación.
