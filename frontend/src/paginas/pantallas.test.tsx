import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Rol } from '../auth/roles';
import { Marco } from '../componentes/Marco';
import { RutaConRol } from '../componentes/RutaConRol';
import { Consultar } from './Consultar';
import { Menu } from './Menu';

// Sesión simulada: estas pruebas dibujan las pantallas sin Keycloak ni navegador.
let sesion = { usuario: { nombre: 'admin.prueba', roles: [Rol.ADMINISTRADOR] as Rol[] }, consultarDisponible: true as boolean | null };
vi.mock('../auth/sesion', () => ({ cerrarSesion: vi.fn() }));
vi.mock('../auth/ContextoSesion', () => ({ useSesion: () => sesion }));

const dibujar = (elemento: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{elemento}</MemoryRouter>);
const opcionesVisibles = (html: string) => [...html.matchAll(/data-opcion="([^"]+)"/g)].map((m) => m[1]);

describe('menú principal', () => {
  it('el administrador ve las seis opciones como enlaces', () => {
    sesion = { usuario: { nombre: 'admin.prueba', roles: [Rol.ADMINISTRADOR] }, consultarDisponible: true };
    const html = dibujar(<Menu />);
    expect(opcionesVisibles(html)).toEqual(['crear', 'modificar', 'consultar', 'consulta-nl', 'borrar', 'log']);
    expect(html).toContain('href="/crear"');
    expect(html).toContain('href="/log"');
  });

  it('el consultor solo ve sus tres opciones', () => {
    sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] }, consultarDisponible: true };
    const html = dibujar(<Menu />);
    expect(opcionesVisibles(html)).toEqual(['consultar', 'consulta-nl', 'log']);
    expect(html).not.toContain('Crear personas');
  });

  it('con ms-consultar apagado, Consultar aparece deshabilitado y sin enlace', () => {
    sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] }, consultarDisponible: false };
    const html = dibujar(<Menu />);
    expect(html).toMatch(/aria-disabled="true" data-opcion="consultar"/);
    expect(html).toContain('No disponible en este momento');
    expect(html).not.toContain('href="/consultar"');
  });

  it('mientras llega la primera respuesta del health, Consultar no se marca como caído', () => {
    sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] }, consultarDisponible: null };
    expect(dibujar(<Menu />)).toContain('href="/consultar"');
  });

  it('sin URL del chat, la consulta en lenguaje natural aparece sin configurar', () => {
    sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] }, consultarDisponible: true };
    expect(dibujar(<Menu />)).toContain('Todavía no está configurado');
  });

  it('el administrador ve el interruptor de Consultar', () => {
    sesion = { usuario: { nombre: 'admin.prueba', roles: [Rol.ADMINISTRADOR] }, consultarDisponible: true };
    const html = dibujar(<Menu />);
    expect(html).toContain('data-interruptor="consultar"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Servicio Consultar');
  });

  it('el consultor no ve el interruptor de Consultar', () => {
    sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] }, consultarDisponible: true };
    expect(dibujar(<Menu />)).not.toContain('data-interruptor');
  });

  it('un usuario sin rol de la aplicación recibe un aviso', () => {
    sesion = { usuario: { nombre: 'otro', roles: [] }, consultarDisponible: true };
    expect(dibujar(<Menu />)).toContain('no tiene un rol de la aplicación');
  });
});

describe('protección de las páginas', () => {
  it('el consultor que entra a /crear ve el aviso de permiso y no la página', () => {
    sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] }, consultarDisponible: true };
    const html = dibujar(<RutaConRol ruta="/crear"><p>formulario</p></RutaConRol>);
    expect(html).toContain('No tienes permiso');
    expect(html).not.toContain('formulario');
  });

  it('el administrador sí entra a /crear', () => {
    sesion = { usuario: { nombre: 'admin.prueba', roles: [Rol.ADMINISTRADOR] }, consultarDisponible: true };
    expect(dibujar(<RutaConRol ruta="/crear"><p>formulario</p></RutaConRol>)).toContain('formulario');
  });

  it('la página de consultar avisa cuando el servicio está apagado (CP-07)', () => {
    sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] }, consultarDisponible: false };
    expect(dibujar(<Consultar />)).toContain('Consultar no está disponible');
  });
});

describe('barra lateral (marco)', () => {
  const dibujarMarco = (ruta: string) =>
    renderToStaticMarkup(
      <MemoryRouter initialEntries={[ruta]}>
        <Marco />
      </MemoryRouter>,
    );
  const enlacesLaterales = (html: string) => [...html.matchAll(/data-navegacion="([^"]+)"/g)].map((m) => m[1]);

  it('el administrador ve Inicio y sus seis opciones, y la pantalla actual queda marcada', () => {
    sesion = { usuario: { nombre: 'admin.prueba', roles: [Rol.ADMINISTRADOR] }, consultarDisponible: true };
    const html = dibujarMarco('/borrar');
    expect(enlacesLaterales(html)).toEqual(['inicio', 'crear', 'modificar', 'consultar', 'consulta-nl', 'borrar', 'log']);
    expect(html).toMatch(/href="\/borrar"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/borrar"/);
    expect(html).toContain('admin.prueba');
    expect(html).toContain('Administrador');
    expect(html).toContain('Cerrar sesión');
  });

  it('el consultor solo ve Inicio y sus tres opciones', () => {
    sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] }, consultarDisponible: true };
    const html = dibujarMarco('/');
    expect(enlacesLaterales(html)).toEqual(['inicio', 'consultar', 'consulta-nl', 'log']);
    expect(html).not.toContain('Borrar personas');
  });

  it('con ms-consultar apagado, Consultar aparece como no disponible y sin enlace', () => {
    sesion = { usuario: { nombre: 'consultor.prueba', roles: [Rol.CONSULTOR] }, consultarDisponible: false };
    const html = dibujarMarco('/');
    expect(html).toMatch(/aria-disabled="true" data-navegacion="consultar"/);
    expect(html).not.toContain('href="/consultar"');
  });
});
