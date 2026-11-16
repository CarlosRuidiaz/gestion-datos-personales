/** Pruebas de integración: necesitan PostgreSQL y Keycloak reales (ver pruebas-integracion.sh). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
  testTimeout: 30000,
};
