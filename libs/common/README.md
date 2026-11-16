# libs/common

Librería compartida por los cinco microservicios. Cada servicio la compila dentro de su propio contenedor.

Aquí irá: la entidad `Persona`, los DTO con las validaciones de la sección 3.3 del diseño, el guard JWT con roles (valida los tokens de Keycloak) y el módulo de auditoría que escribe el log en la misma transacción que la operación.

Tarea del tablero que llena esta carpeta: **T05**. Cambiar algo aquí afecta a todos los servicios: regístralo en la sección 7 de `CONTEXTO.md` y avisa al grupo.
