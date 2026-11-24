#!/usr/bin/env bash
# Verificación de n8n de extremo a extremo: flujo de indexación por webhook y
# flujo de reindexación completa, con Gemini y PostgreSQL reales.
#
#   docker compose up -d n8n && bash n8n/configurar.sh   # la primera vez
#   bash n8n/verificar.sh
#
# Las personas de prueba (99999999xx) se insertan directamente en PostgreSQL, porque el aviso
# desde ms-crear, ms-modificar y ms-borrar se prueba aparte, con services/verificar-indexacion.sh. Al final se borran, junto con sus vectores.
# Cada ejecución llama a Gemini unas diez veces (embeddings), dentro del nivel gratuito.
source "$(dirname "${BASH_SOURCE[0]}")/../services/verificar-comun.sh"
export MSYS_NO_PATHCONV=1

N8N=http://localhost:5678
WEBHOOK=$N8N/webhook/indexar-persona
DOC_A=9999999971
DOC_B=9999999972
DOC_C=9999999973
DOC_HUERFANO=9999999979

# aviso DOCUMENTO OPERACION -> imprime el código HTTP
aviso() {
    curl -s -o /dev/null -w '%{http_code}' -X POST "$WEBHOOK" -H 'Content-Type: application/json' \
        -d "{\"numeroDocumento\":\"$1\",\"operacion\":\"$2\"}"
}
vectores() { sql "SELECT count(*) FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$1'"; }
# esperar CONSULTA ESPERADO: repite la consulta hasta que dé el resultado, hasta 40 segundos.
esperar() {
    for _ in $(seq 1 20); do
        [ "$(sql "$1")" = "$2" ] && return 0
        sleep 2
    done
    return 1
}
insertar_persona() {  # documento tipo nombre1 nombre2|NULL apellidos nacimiento genero correo
    local segundo="NULL"; [ "$4" != "NULL" ] && segundo="'$4'"
    sql "INSERT INTO persona (numero_documento, tipo_documento, primer_nombre, segundo_nombre, apellidos,
                              fecha_nacimiento, genero, correo, celular)
         VALUES ('$1', '$2', '$3', $segundo, '$5', '$6', '$7', '$8', '3001234567')" >/dev/null
}
limpiar() {
    limpiar_pruebas
    sql "DELETE FROM persona_embedding WHERE metadata ->> 'numero_documento' LIKE '99999999%'" >/dev/null
}
reindexar() {
    # El n8n que corre ya ocupa el puerto del task runner (5679): la ejecución por CLI usa otro.
    docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=gdpReindexarTodo 2>/dev/null |
        grep -c '"status": "success"'
}

echo "Preparación"
case "$(docker compose ps n8n --format '{{.Status}}' 2>/dev/null)" in
    *"(healthy)"*) ;;
    *) echo "n8n no está arriba y sano. Arráncalo con: docker compose up -d n8n"; exit 1 ;;
esac
limpiar

echo "1. Contenedor y flujos"
igual "n8n responde en /healthz" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$N8N/healthz")"
flujos=$(docker compose exec -T n8n n8n list:workflow 2>/dev/null)
comprobar "el flujo «Indexar persona» está importado" contiene "$flujos" "gdpIndexarPerson|Indexar persona"
comprobar "el flujo «Reindexar todo» está importado" contiene "$flujos" "gdpReindexarTodo|Reindexar todo"
if [ "$(aviso '' '')" != "400" ]; then
    echo "  El webhook de indexación no está activo. Ejecuta primero: bash n8n/configurar.sh"
    exit 1
fi
bien "el webhook de indexación está activo"
mismo=$(docker compose exec -T n8n node -e '
    const leer = (f) => require(f).nodes.find((n) => n.name === "Armar descripción").parameters.jsCode;
    console.log(leer("/workflows/indexar-persona.json") === leer("/workflows/reindexar-todo.json"));')
igual "los dos flujos arman la descripción con el mismo código" "true" "$mismo"
sin_secretos=true
for variable in DB_PASSWORD_N8N GEMINI_API_KEY N8N_LOG_API_KEY N8N_ENCRYPTION_KEY; do
    valor=$(env_var "$variable")
    [ -n "$valor" ] && grep -rqF -- "$valor" n8n/workflows && sin_secretos=false
done
igual "los flujos exportados no contienen llaves ni contraseñas de .env" "true" "$sin_secretos"

echo "2. Avisos inválidos"
igual "sin cuerpo responde 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEBHOOK")"
igual "documento con letras responde 400" "400" "$(aviso 12ab CREAR)"
igual "documento de 11 dígitos responde 400" "400" "$(aviso 12345678901 CREAR)"
igual "operación desconocida responde 400" "400" "$(aviso "$DOC_A" CONSULTAR)"

echo "3. Crear: aviso CREAR"
insertar_persona "$DOC_A" "Cédula" "Pedro" "Andrés" "Pérez Gómez" "2003-03-05" "Masculino" "pedro.prueba@ejemplo.com"
inicio=$(date +%s%N)
igual "el aviso responde 202" "202" "$(aviso "$DOC_A" CREAR)"
duracion=$(( ($(date +%s%N) - inicio) / 1000000 ))
comprobar "responde sin esperar la indexación (${duracion} ms)" [ "$duracion" -lt 1500 ]
if esperar "SELECT count(*) FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_A'" 1; then
    bien "queda un vector de la persona"
else
    fallo "queda un vector de la persona (¿GEMINI_API_KEY válida? Revisa las ejecuciones en $N8N)"
fi
texto=$(sql "SELECT text FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_A'")
comprobar "el texto tiene el nombre completo" contiene "$texto" "Pedro Andrés Pérez Gómez."
comprobar "el texto tiene el tipo y número de documento" contiene "$texto" "Cédula número $DOC_A."
comprobar "el texto tiene la fecha como dd-mmm-yyyy y la edad" contiene "$texto" "Fecha de nacimiento: 05-mar-2003, "
comprobar "el texto tiene género, correo y celular" contiene "$texto" "Género: Masculino. Correo: pedro.prueba@ejemplo.com. Celular: 3001234567."
igual "el vector tiene 3072 dimensiones (gemini-embedding-001)" "3072" \
    "$(sql "SELECT vector_dims(embedding) FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_A'")"
igual "la metadata trae los datos de la persona" "Pedro Andrés Pérez Gómez|Cédula|05-mar-2003|Masculino|pedro.prueba@ejemplo.com" \
    "$(sql "SELECT concat_ws('|', metadata->>'nombre_completo', metadata->>'tipo_documento', metadata->>'fecha_nacimiento',
            metadata->>'genero', metadata->>'correo') FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_A'")"
igual "la edad de la metadata coincide con vista_personas" \
    "$(sql "SELECT edad FROM vista_personas WHERE numero_documento = '$DOC_A'")" \
    "$(sql "SELECT metadata->>'edad' FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_A'")"
comprobar "la metadata marca la versión con indexado_en" [ -n "$(sql "SELECT metadata->>'indexado_en' FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_A'")" ]

echo "4. Modificar: tres avisos MODIFICAR al mismo tiempo"
sql "UPDATE persona SET correo = 'pedro.nuevo@ejemplo.com' WHERE numero_documento = '$DOC_A'" >/dev/null
codigos=$( (aviso "$DOC_A" MODIFICAR & aviso "$DOC_A" MODIFICAR & aviso "$DOC_A" MODIFICAR & wait) )
igual "los tres avisos responden 202" "202202202" "$codigos"
if esperar "SELECT string_agg(metadata->>'correo', ',') FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_A'" "pedro.nuevo@ejemplo.com"; then
    bien "el vector tiene el correo nuevo"
else
    fallo "el vector tiene el correo nuevo"
fi
sleep 6   # deja terminar las ejecuciones que falten
igual "queda un solo vector de la persona" "1" "$(vectores "$DOC_A")"

echo "5. Persona sin segundo nombre"
insertar_persona "$DOC_B" "Tarjeta de identidad" "Ana" "NULL" "Ruiz Díaz" "2012-07-20" "Femenino" "ana.prueba@ejemplo.com"
igual "el aviso responde 202" "202" "$(aviso "$DOC_B" CREAR)"
if esperar "SELECT count(*) FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_B'" 1; then
    texto=$(sql "SELECT text FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_B'")
    comprobar "el nombre va sin espacios de más ni «null»" contiene "$texto" "Ana Ruiz Díaz. Tarjeta de identidad número $DOC_B."
else
    fallo "queda un vector de la persona"
fi

echo "6. Borrar: aviso BORRAR"
sql "DELETE FROM persona WHERE numero_documento = '$DOC_A'" >/dev/null
igual "el aviso responde 202" "202" "$(aviso "$DOC_A" BORRAR)"
if esperar "SELECT count(*) FROM persona_embedding WHERE metadata ->> 'numero_documento' = '$DOC_A'" 0; then
    bien "el vector de la persona borrada desaparece"
else
    fallo "el vector de la persona borrada desaparece"
fi
igual "un aviso de un documento que no existe responde 202" "202" "$(aviso 9999999978 MODIFICAR)"
sleep 4
igual "y no guarda ningún vector" "0" "$(vectores 9999999978)"

echo "7. Reindexación completa"
insertar_persona "$DOC_C" "Cédula" "Luis" "NULL" "Mora" "1980-01-15" "No binario" "luis.prueba@ejemplo.com"
sql "INSERT INTO persona_embedding (text, metadata) VALUES ('vector huérfano de prueba', '{\"numero_documento\": \"$DOC_HUERFANO\"}')" >/dev/null
igual "el flujo termina con éxito" "1" "$(reindexar)"
igual "el vector huérfano desaparece" "0" "$(vectores "$DOC_HUERFANO")"
igual "la persona que no tenía vector queda indexada" "1" "$(vectores "$DOC_C")"
igual "hay exactamente un vector por persona" \
    "$(sql "SELECT count(*) FROM vista_personas")|$(sql "SELECT count(*) FROM vista_personas")" \
    "$(sql "SELECT count(*) || '|' || count(DISTINCT metadata ->> 'numero_documento') FROM persona_embedding")"
igual "todos los vectores son de la misma ejecución" "1" \
    "$(sql "SELECT count(DISTINCT metadata ->> 'indexado_en') FROM persona_embedding")"
igual "repetirla deja el mismo número de vectores" "1|$(sql "SELECT count(*) FROM vista_personas")" \
    "$(reindexar)|$(sql "SELECT count(*) FROM persona_embedding")"

echo "8. Permisos de usr_n8n (la base de datos es la que impide escribir, CP-10)"
como_n8n() { sql "SET ROLE usr_n8n; $1" >/dev/null 2>&1 && echo permitido || echo negado; }
igual "lee vista_personas" "permitido" "$(como_n8n "SELECT count(*) FROM vista_personas")"
igual "no lee la tabla persona (ni la foto)" "negado" "$(como_n8n "SELECT count(*) FROM persona")"
igual "no inserta personas" "negado" "$(como_n8n "INSERT INTO persona (numero_documento, tipo_documento, primer_nombre, apellidos,
    fecha_nacimiento, genero, correo, celular) VALUES ('9999999977', 'Cédula', 'Eva', 'Paz', '2000-01-01', 'Femenino', 'eva@ejemplo.com', '3000000000')")"
igual "no modifica personas" "negado" "$(como_n8n "UPDATE persona SET correo = 'x@y.co' WHERE numero_documento = '$DOC_B'")"
igual "no borra personas" "negado" "$(como_n8n "DELETE FROM persona WHERE numero_documento = '$DOC_B'")"
igual "no escribe en el log" "negado" "$(como_n8n "INSERT INTO log_transaccion (tipo, usuario, resultado) VALUES ('CONSULTA_NL', 'n8n', 'EXITO')")"
igual "administra persona_embedding" "permitido" "$(como_n8n "SELECT count(*) FROM persona_embedding")"

echo "Limpieza"
limpiar
igual "no quedan personas ni vectores de prueba" "0|0" \
    "$(sql "SELECT count(*) FROM persona WHERE numero_documento LIKE '99999999%'")|$(sql "SELECT count(*) FROM persona_embedding WHERE metadata ->> 'numero_documento' LIKE '99999999%'")"

echo
if [ "$fallos" -eq 0 ]; then echo "TODO BIEN"; else echo "$fallos comprobaciones fallaron"; exit 1; fi
