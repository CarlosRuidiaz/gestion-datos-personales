import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, pedirApi } from '../api/cliente';
import { Rol } from '../auth/roles';
import { celularLegible, FichaPersona, nombreCompleto } from '../persona/FichaPersona';
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
  it('muestra primero el documento y el nombre, después los demás datos, la fecha como dd-mmm-yyyy y la foto', () => {
    const html = dibujar(<FichaPersona persona={marta} />);
    expect(html).toContain('<p class="tipo-documento">Cédula</p>');
    expect(html).toMatch(/class="numero-documento"[^>]*>9999999981</);
    expect(html).toContain('<h2 class="nombre-persona">Marta Rojas Vega</h2>');
    for (const texto of ['12-ago-1995', 'Femenino', 'marta.prueba@ejemplo.com', '301 111 2233']) {
      expect(html).toContain(`<dd>${texto}</dd>`);
    }
    expect(html.indexOf('9999999981')).toBeLessThan(html.indexOf('Fecha de nacimiento'));
    expect(html.indexOf('Género')).toBeLessThan(html.indexOf('<hr/>'));
    expect(html.indexOf('<hr/>')).toBeLessThan(html.indexOf('Correo electrónico'));
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it('agrupa el celular de a 3, 3 y 4 cifras solo si tiene 10', () => {
    expect(celularLegible('3011112233')).toBe('301 111 2233');
    expect(celularLegible('12345')).toBe('12345');
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
