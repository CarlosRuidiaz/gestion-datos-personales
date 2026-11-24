# n8n/workflows

Flujos de n8n exportados en JSON. `bash n8n/configurar.sh` los importa todos (ver `n8n/README.md`).

| Archivo | Flujo | Id | Tarea |
| --- | --- | --- | --- |
| `indexar-persona.json` | Indexar persona (webhook `POST /webhook/indexar-persona`, publicado) | `gdpIndexarPerson` | T14 |
| `reindexar-todo.json` | Reindexar todo (ejecución manual) | `gdpReindexarTodo` | T14 |
| `chat-consulta.json` | Consulta en lenguaje natural (chat de n8n, publicado) | `gdpChatConsulta1` | T15 |

La guía de configuración inicial de n8n es la tarea **T20**. Ver `CONTEXTO.md`.

El flujo del chat registra cada consulta en ms-log con `POST http://ms-log:3000/api/log/consulta-nl` (contrato en `services/ms-log/README.md`). La llave va en la credencial `gdpCredMsLogKey1`, que crea `configurar.sh`.

No exportes credenciales dentro de los flujos: solo su id y su nombre, que es lo que n8n pone al exportar.
