-- Inicialización de la base de datos de Gestión de Datos Personales.
-- PostgreSQL ejecuta este archivo una sola vez, cuando el volumen pgdata está vacío.
--
-- Estado: base mínima (tarea T02). La tarea T03 agrega aquí las tablas, la vista
-- vista_personas, los índices, los usuarios de base de datos y sus permisos,
-- según las secciones 6.2 y 6.3 de docs/diseno/documento_diseno.md.

CREATE EXTENSION IF NOT EXISTS vector;
