import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PersonaCreada } from '../paginas/CrearPersona';
import { erroresDeGuardado, REVISA_LOS_CAMPOS } from './guardar';
import { FormularioPersona } from './FormularioPersona';
import type { DatosPersona } from './tipos';
import { ErrorApi } from '../api/cliente';

// El cliente de la API usa keycloak-js; aquí solo hace falta su clase de error.
vi.mock('../auth/sesion', () => ({ keycloak: {}, tokenVigente: async () => 'token' }));

const dibujar = (elemento: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{elemento}</MemoryRouter>);
const sinAccion = () => undefined;

const marta: DatosPersona = {
  tipoDocumento: 'Cédula',
  numeroDocumento: '9999999981',
  primerNombre: 'Marta',
  segundoNombre: '',
  apellidos: 'Rojas Vega',
  fechaNacimiento: '12-ago-1995',
  genero: 'Femenino',
  correo: 'marta.prueba@ejemplo.com',
  celular: '3011112233',
};

describe('formulario de persona', () => {
  it('al crear tiene los diez campos del enunciado, con las listas de la sección 3.3', () => {
    const html = dibujar(<FormularioPersona modo="crear" textoBoton="Guardar" alEnviar={sinAccion} />);
    for (const nombre of ['tipoDocumento', 'numeroDocumento', 'primerNombre', 'segundoNombre', 'apellidos', 'fechaNacimiento', 'genero', 'foto', 'correo', 'celular']) {
      expect(html).toContain(`name="${nombre}"`);
    }
    expect(html).toContain('<option>Tarjeta de identidad</option><option>Cédula</option>');
    expect(html).toContain('<option>No binario</option><option>Prefiero no reportar</option>');
    expect(html).toContain('type="date"');
    expect(html).toContain('accept="image/jpeg,image/png"');
    expect(html).not.toContain('readOnly');
  });

  it('sigue el prototipo: identificación y foto arriba, contacto debajo de una línea', () => {
    const html = dibujar(<FormularioPersona modo="crear" textoBoton="Guardar" alEnviar={sinAccion} />);
    const linea = html.indexOf('<hr/>');
    expect(html.indexOf('name="foto"')).toBeLessThan(linea);
    expect(html.indexOf('name="genero"')).toBeLessThan(linea);
    expect(html.indexOf('name="correo"')).toBeGreaterThan(linea);
    expect(html.indexOf('name="celular"')).toBeGreaterThan(linea);
  });

  it('al modificar llega lleno, con el documento de solo lectura y la opción de quitar la foto', () => {
    const html = dibujar(
      <FormularioPersona modo="modificar" inicial={marta} fotoActual="data:image/png;base64,AAAA" textoBoton="Guardar cambios" alEnviar={sinAccion} />,
    );
    expect(html).toMatch(/readOnly=""[^>]*name="numeroDocumento" value="9999999981"/);
    expect(html).toContain('value="Rojas Vega"');
    expect(html).toContain('value="12-ago-1995"');
    expect(html).toContain('value="1995-08-12"'); // el calendario muestra la misma fecha
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('Quitar la foto actual');
  });

  it('muestra los errores de la API junto a su campo', () => {
    const html = dibujar(
      <FormularioPersona
        modo="crear"
        textoBoton="Guardar"
        alEnviar={sinAccion}
        erroresServidor={{ numeroDocumento: 'Ya hay una persona registrada con ese número de documento' }}
      />,
    );
    expect(html).toMatch(/aria-invalid="true" aria-describedby="[^"]*-numeroDocumento-error"/);
    expect(html).toContain('data-error="numeroDocumento">Ya hay una persona registrada');
  });
});

describe('errores al guardar', () => {
  it('un 409 marca el número de documento (CU-02)', () => {
    const errores = erroresDeGuardado(new ErrorApi(409, 'Ya hay una persona registrada con ese número de documento'));
    expect(errores.porCampo).toEqual({ numeroDocumento: 'Ya hay una persona registrada con ese número de documento' });
    expect(errores.general).toBe(REVISA_LOS_CAMPOS);
  });

  it('un 400 pone cada mensaje en su campo (CP-03)', () => {
    const errores = erroresDeGuardado(
      new ErrorApi(400, 'Datos inválidos', [
        { campo: 'celular', mensaje: 'El celular debe tener exactamente 10 dígitos' },
        { campo: 'foto', mensaje: 'La foto debe ser una imagen JPG o PNG' },
      ]),
    );
    expect(errores.porCampo).toEqual({
      celular: 'El celular debe tener exactamente 10 dígitos',
      foto: 'La foto debe ser una imagen JPG o PNG',
    });
  });

  it('un 403 o un fallo de red dan un mensaje general', () => {
    expect(erroresDeGuardado(new ErrorApi(403, 'Tu rol no tiene permiso para esta operación')).general).toBe(
      'Tu rol no tiene permiso para esta operación',
    );
    expect(erroresDeGuardado(new TypeError('Failed to fetch')).general).toContain('No se pudo conectar');
  });
});

describe('confirmación al crear', () => {
  it('dice a quién se registró y si quedó con foto', () => {
    const html = dibujar(
      <PersonaCreada
        persona={{ ...marta, fechaNacimiento: '1995-08-12', segundoNombre: null, tieneFoto: true }}
        alCrearOtra={sinAccion}
      />,
    );
    expect(html).toContain('Persona registrada.');
    expect(html).toContain('Se guardaron los datos de Marta Rojas Vega, cédula número');
    expect(html).toContain('9999999981');
    expect(html).toContain('con foto.');
    expect(html).toContain('Crear otra persona');
  });
});
