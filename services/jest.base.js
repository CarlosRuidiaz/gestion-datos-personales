/**
 * Configuración de Jest que comparten los cinco microservicios (cada uno la usa desde su jest.config.js).
 * Pruebas unitarias: no necesitan contenedores, base de datos ni Keycloak. `@gdp/common` se carga desde
 * su código fuente, así que no hace falta compilar la librería antes de probar.
 */
const path = require('node:path');

module.exports = (rootDir) => ({
  testEnvironment: 'node',
  rootDir,
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@gdp/common$': path.join(__dirname, '..', 'libs', 'common', 'src', 'index.ts'),
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: path.join(__dirname, 'tsconfig.test.json') }],
  },
});
