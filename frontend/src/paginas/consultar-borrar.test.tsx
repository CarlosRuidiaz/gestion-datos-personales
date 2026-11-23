import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, pedirApi } from '../api/cliente';
import { Rol } from '../auth/roles';
import { FichaPersona, nombreCompleto } from '../persona/FichaPersona';
import type { PersonaApi } from '../persona/tipos';
import { ConfirmacionBorrado } from './BorrarPersona';
import { Consultar } from './Consultar';

vi.mock('../auth/sesion', () => ({ keycloak: { login: vi.fn() }, tokenVigente: async () => 'token' }));
let sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] as Rol[] }, consultarDisponible: true as boolean | null };
vi.mock('../auth/ContextoSesion', () => ({ useSesion: () => sesion }));

const dibujar = (elemento: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{elemento}</MemoryRouter>);

const marta: PersonaApi = {
  numeroDocumento: '9999999981',
  tipoDocumento: 'Cédula',
  primerNombre: 'Marta',
  segundoNombre: null,
  apellidos: 'Rojas Vega',
  fechaNacimiento: '1995-08-12',
  genero: 'Femenino',
  correo: 'marta.prueba@ejemplo.com',
  celular: '3011112233',
  tieneFoto: true,
  foto: 'data:image/png;base64,AAAA',
};

describe('ficha de persona (CU-04)', () => {
  it('muestra todos los datos, la fecha como dd-mmm-yyyy y la foto', () => {
    const html = dibujar(<FichaPersona persona={marta} />);
    for (const texto of ['Cédula', '9999999981', 'Marta', 'Rojas Vega', '12-ago-1995', 'Femenino', 'marta.prueba@ejemplo.com', '3011112233']) {
      expect(html).toContain(`<dd>${texto}</dd>`);
    }
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('No registrado'); // el segundo nombre vacío
  });

  it('sin foto lo dice', () => {
    expect(dibujar(<FichaPersona persona={{ ...marta, foto: null, tieneFoto: false }} />)).toContain('Sin foto');
  });

  it('arma el nombre completo con y sin segundo nombre', () => {
    expect(nombreCompleto(marta)).toBe('Marta Rojas Vega');
    expect(nombreCompleto({ ...marta, segundoNombre: 'Lucía' })).toBe('Marta Lucía Rojas Vega');
  });
});

describe('pantalla de consultar', () => {
  it('con el servicio disponible empieza con la búsqueda por documento', () => {
    sesion = { ...sesion, consultarDisponible: true };
    const html = dibujar(<Consultar />);
    expect(html).toContain('Consultar datos personales');
    expect(html).toContain('id="busqueda-documento"');
  });
});

describe('confirmación del borrado (CU-06)', () => {
  it('nombra a la persona, avisa que no se puede deshacer y ofrece cancelar', () => {
    const html = dibujar(<ConfirmacionBorrado persona={marta} borrando={false} alConfirmar={vi.fn()} alCancelar={vi.fn()} />);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('¿Borrar a Marta Rojas Vega?');
    expect(html).toContain('Se borrarán los datos y la foto de la persona con cédula número 9999999981');
    expect(html).toContain('no se puede deshacer');
    expect(html).toContain('Sí, borrar');
    expect(html).toContain('Cancelar');
  });

  it('sin foto no menciona la foto', () => {
    const sinFoto = { ...marta, tieneFoto: false, foto: null };
    const html = dibujar(<ConfirmacionBorrado persona={sinFoto} borrando={false} alConfirmar={vi.fn()} alCancelar={vi.fn()} />);
    expect(html).toContain('Se borrarán los datos de la persona');
  });

  it('mientras borra, desactiva los dos botones', () => {
    const html = dibujar(<ConfirmacionBorrado persona={marta} borrando alConfirmar={vi.fn()} alCancelar={vi.fn()} />);
    expect(html).toContain('Borrando…');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('servicio apagado', () => {
  afterEach(() => vi.unstubAllGlobals());

  const responder = (estado: number, cuerpo: string) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(cuerpo, { status: estado })));

  it('un 404 de Traefik (sin JSON) se informa como servicio no disponible, no como persona inexistente', async () => {
    responder(404, '404 page not found');
    await expect(pedirApi('/api/consultar/personas/1')).rejects.toMatchObject({
      estado: 503,
      message: 'El servicio no está disponible en este momento',
    });
  });

  it('un 404 del microservicio sigue siendo 404 con su mensaje', async () => {
    responder(404, JSON.stringify({ message: 'No hay una persona registrada con ese número de documento' }));
    const error = await pedirApi('/api/consultar/personas/1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({ estado: 404, message: 'No hay una persona registrada con ese número de documento' });
  });
});
