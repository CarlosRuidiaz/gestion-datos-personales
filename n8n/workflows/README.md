# n8n/workflows

Flujos de n8n exportados en JSON, para importarlos en la configuración inicial.

Aquí irán: el flujo de indexación por webhook y el de reindexación completa (**T14**), y el flujo de chat con el agente RAG, sus dos herramientas, Gemini, memoria y registro en ms-log (**T15**). La guía de configuración inicial de n8n es la tarea **T20**. Ver `CONTEXTO.md`.

Para el registro en ms-log (T15): el contrato de `POST /api/log/consulta-nl` (cabecera `X-API-Key` con `N8N_LOG_API_KEY`, cuerpo y respuestas) está en `services/ms-log/README.md`. Dentro de la red de Docker la URL es `http://ms-log:3000/api/log/consulta-nl`.

No exportes credenciales dentro de los flujos.
