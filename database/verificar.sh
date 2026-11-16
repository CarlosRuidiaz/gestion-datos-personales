#!/bin/sh
# Verifica el esquema, las restricciones y los permisos por servicio (secciones 6.2 y 6.3 del diseño).
# Uso, desde la raíz del repositorio y con el contenedor postgres arriba:
#
#   docker compose exec -T postgres sh < database/verificar.sh
#
# Cada usuario se conecta por red con su contraseña de .env, igual que lo hará su servicio.
# Usa el documento ficticio 9999999999 y al final lo limpia con el superusuario
# (la aplicación no puede borrar el log; el superusuario solo se usa aquí para dejar la base como estaba).

DOC=9999999999
fallos=0

# sql USUARIO CLAVE SENTENCIA
sql() {
    PGPASSWORD="$2" psql -h "$(hostname)" -U "$1" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qAt -c "$3" >/dev/null 2>&1
}
# espera RESULTADO(ok|no) DESCRIPCION USUARIO CLAVE SENTENCIA
espera() {
    if sql "$3" "$4" "$5"; then real=ok; else real=no; fi
    if [ "$real" = "$1" ]; then
        echo "  bien   $2"
    else
        echo "  FALLO  $2 (se esperaba $1, resultó $real)"
        fallos=$((fallos + 1))
    fi
}
admin() { psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

PERSONA="INSERT INTO persona (numero_documento, tipo_documento, primer_nombre, apellidos, fecha_nacimiento, genero, correo, celular)
         VALUES ('$DOC', 'Cédula', 'Prueba', 'Verificación', '2000-01-31', 'No binario', 'prueba@example.com', '3000000000')"
LOG="INSERT INTO log_transaccion (tipo, numero_documento, usuario, resultado) VALUES ('CONSULTAR', '$DOC', 'verificar.sh', 'EXITO')"

admin "DELETE FROM persona WHERE numero_documento = '$DOC'" >/dev/null

echo "Objetos:"
for objeto in persona log_transaccion persona_embedding vista_personas idx_log_tipo idx_log_numero_documento idx_log_fecha_hora; do
    if [ "$(admin "SELECT to_regclass('public.$objeto') IS NOT NULL")" = t ]; then
        echo "  bien   existe $objeto"
    else
        echo "  FALLO  no existe $objeto"; fallos=$((fallos + 1))
    fi
done

echo "Contraseñas:"
espera no "usr_crear no entra con una contraseña equivocada" usr_crear "clave-equivocada" "SELECT 1"

echo "usr_crear:"
espera ok "inserta en persona"            usr_crear "$DB_PASSWORD_CREAR" "$PERSONA"
espera no "no repite el documento"        usr_crear "$DB_PASSWORD_CREAR" "$PERSONA"
espera ok "lee persona"                   usr_crear "$DB_PASSWORD_CREAR" "SELECT 1 FROM persona"
espera no "no actualiza persona"          usr_crear "$DB_PASSWORD_CREAR" "UPDATE persona SET correo = 'x@example.com'"
espera no "no borra persona"              usr_crear "$DB_PASSWORD_CREAR" "DELETE FROM persona"
espera ok "inserta en el log"             usr_crear "$DB_PASSWORD_CREAR" "$LOG"
espera no "no lee el log"                 usr_crear "$DB_PASSWORD_CREAR" "SELECT 1 FROM log_transaccion"

echo "usr_modificar:"
espera ok "lee persona"                   usr_modificar "$DB_PASSWORD_MODIFICAR" "SELECT 1 FROM persona"
espera ok "actualiza persona"             usr_modificar "$DB_PASSWORD_MODIFICAR" "UPDATE persona SET correo = 'nuevo@example.com', fecha_actualizacion = now() WHERE numero_documento = '$DOC'"
espera no "no inserta en persona"         usr_modificar "$DB_PASSWORD_MODIFICAR" "INSERT INTO persona (numero_documento, tipo_documento, primer_nombre, apellidos, fecha_nacimiento, genero, correo, celular) VALUES ('9999999998', 'Cédula', 'Otra', 'Prueba', '2000-01-01', 'Femenino', 'otra@example.com', '3000000001')"
espera no "no borra persona"              usr_modificar "$DB_PASSWORD_MODIFICAR" "DELETE FROM persona"
espera ok "inserta en el log"             usr_modificar "$DB_PASSWORD_MODIFICAR" "$LOG"

echo "usr_consultar:"
espera ok "lee persona"                   usr_consultar "$DB_PASSWORD_CONSULTAR" "SELECT 1 FROM persona"
espera no "no actualiza persona"          usr_consultar "$DB_PASSWORD_CONSULTAR" "UPDATE persona SET correo = 'x@example.com'"
espera no "no borra persona"              usr_consultar "$DB_PASSWORD_CONSULTAR" "DELETE FROM persona"
espera ok "inserta en el log"             usr_consultar "$DB_PASSWORD_CONSULTAR" "$LOG"

echo "usr_log:"
espera ok "lee el log"                    usr_log "$DB_PASSWORD_LOG" "SELECT 1 FROM log_transaccion"
espera ok "inserta una consulta NL"       usr_log "$DB_PASSWORD_LOG" "INSERT INTO log_transaccion (tipo, usuario, resultado, pregunta, respuesta) VALUES ('CONSULTA_NL', 'verificar.sh', 'EXITO', '¿prueba?', 'prueba')"
espera no "no lee persona"                usr_log "$DB_PASSWORD_LOG" "SELECT 1 FROM persona"

echo "usr_n8n:"
espera ok "lee vista_personas"            usr_n8n "$DB_PASSWORD_N8N" "SELECT edad FROM vista_personas"
espera no "no lee persona (ni la foto)"   usr_n8n "$DB_PASSWORD_N8N" "SELECT 1 FROM persona"
espera no "no modifica por la vista"      usr_n8n "$DB_PASSWORD_N8N" "DELETE FROM vista_personas"
espera no "no lee el log"                 usr_n8n "$DB_PASSWORD_N8N" "SELECT 1 FROM log_transaccion"
espera ok "inserta un vector"             usr_n8n "$DB_PASSWORD_N8N" "INSERT INTO persona_embedding (text, metadata, embedding) VALUES ('Prueba Verificación', '{\"numero_documento\": \"$DOC\"}', '[0.1, 0.2, 0.3]')"
espera ok "busca por similitud"           usr_n8n "$DB_PASSWORD_N8N" "SELECT text FROM persona_embedding ORDER BY embedding <=> '[0.1, 0.2, 0.3]' LIMIT 1"
espera ok "borra el vector"               usr_n8n "$DB_PASSWORD_N8N" "DELETE FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC'"

echo "El log no se puede alterar:"
for par in "usr_crear:$DB_PASSWORD_CREAR" "usr_modificar:$DB_PASSWORD_MODIFICAR" "usr_consultar:$DB_PASSWORD_CONSULTAR" "usr_borrar:$DB_PASSWORD_BORRAR" "usr_log:$DB_PASSWORD_LOG" "usr_n8n:$DB_PASSWORD_N8N"; do
    u=${par%%:*}; c=${par#*:}
    espera no "$u no actualiza el log" "$u" "$c" "UPDATE log_transaccion SET resultado = 'ERROR'"
    espera no "$u no borra el log"     "$u" "$c" "DELETE FROM log_transaccion"
    espera no "$u no vacía el log"     "$u" "$c" "TRUNCATE log_transaccion"
done

echo "Restricciones de persona (con usr_modificar):"
cambio() { espera no "$1" usr_modificar "$DB_PASSWORD_MODIFICAR" "UPDATE persona SET $2 WHERE numero_documento = '$DOC'"; }
cambio "rechaza un tipo de documento fuera de la lista" "tipo_documento = 'Pasaporte'"
cambio "rechaza números en el primer nombre"            "primer_nombre = 'Ana3'"
cambio "rechaza números en los apellidos"               "apellidos = 'Pérez 2'"
cambio "rechaza un primer nombre de más de 30"          "primer_nombre = repeat('a', 31)"
cambio "rechaza una fecha de nacimiento futura"         "fecha_nacimiento = CURRENT_DATE + 1"
cambio "rechaza un género fuera de la lista"            "genero = 'Otro'"
cambio "rechaza un correo sin formato"                  "correo = 'sin-arroba'"
cambio "rechaza un celular de 9 dígitos"                "celular = '300000000'"
cambio "rechaza un celular con letras"                  "celular = '30000000ab'"
cambio "rechaza una foto de más de 2 MB"                "foto = decode(repeat('00', 2097153), 'hex'), foto_tipo = 'image/png'"
cambio "rechaza una foto que no es JPG ni PNG"          "foto = '\\x00', foto_tipo = 'image/gif'"
espera ok "acepta una foto PNG de 2 MB exactos" usr_modificar "$DB_PASSWORD_MODIFICAR" "UPDATE persona SET foto = decode(repeat('00', 2097152), 'hex'), foto_tipo = 'image/png' WHERE numero_documento = '$DOC'"
espera no "rechaza letras en el documento"      usr_crear "$DB_PASSWORD_CREAR" "INSERT INTO persona (numero_documento, tipo_documento, primer_nombre, apellidos, fecha_nacimiento, genero, correo, celular) VALUES ('12A', 'Cédula', 'Prueba', 'Prueba', '2000-01-01', 'Masculino', 'p@example.com', '3000000000')"

echo "usr_borrar:"
espera ok "lee persona"                   usr_borrar "$DB_PASSWORD_BORRAR" "SELECT 1 FROM persona"
espera no "no actualiza persona"          usr_borrar "$DB_PASSWORD_BORRAR" "UPDATE persona SET correo = 'x@example.com'"
espera ok "inserta en el log"             usr_borrar "$DB_PASSWORD_BORRAR" "$LOG"
espera ok "borra la persona"              usr_borrar "$DB_PASSWORD_BORRAR" "DELETE FROM persona WHERE numero_documento = '$DOC'"

echo "El historial sobrevive al borrado:"
if [ "$(admin "SELECT count(*) >= 4 FROM log_transaccion WHERE numero_documento = '$DOC'")" = t ]; then
    echo "  bien   el log conserva los registros de la persona borrada"
else
    echo "  FALLO  el log perdió registros"; fallos=$((fallos + 1))
fi

# Limpieza de los datos de esta prueba.
admin "DELETE FROM log_transaccion WHERE usuario = 'verificar.sh'" >/dev/null
admin "DELETE FROM persona WHERE numero_documento IN ('$DOC', '9999999998')" >/dev/null
admin "DELETE FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC'" >/dev/null

echo
if [ "$fallos" -eq 0 ]; then
    echo "TODO BIEN: esquema y permisos coinciden con el diseño."
else
    echo "HAY $fallos FALLO(S)."
    exit 1
fi
