import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Rol } from '../auth/roles';
import { BorrarTodas, CONFIRMACION } from '../componentes/BorrarTodas';
import { BorrarPersona } from './BorrarPersona';
import { CrearPersona } from './CrearPersona';
import { ImportarPersonas } from './ImportarPersonas';

vi.mock('../auth/sesion', () => ({ keycloak: {}, tokenVigente: async () => 'token' }));
vi.mock('../auth/ContextoSesion', () => ({
  useSesion: () => ({ usuario: { nombre: 'admin.prueba', roles: [Rol.ADMINISTRADOR] }, consultarDisponible: true }),
}));

const dibujar = (elemento: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{elemento}</MemoryRouter>);

describe('importar personas', () => {
  it('Crear personas enlaza a la importación', () => {
    const html = dibujar(<CrearPersona />);
    expect(html).toContain('href="/crear/importar"');
    expect(html).toContain('Importar personas desde un archivo');
  });

  it('pide el archivo de datos y, opcionales, las fotos en zip o sueltas', () => {
    const html = dibujar(<ImportarPersonas />);
    expect(html).toContain('accept=".xlsx,.csv"');
    expect(html).toMatch(/accept="\.zip,\.jpg,\.jpeg,\.png" multiple=""/);
    expect(html).toContain('Revisar archivo');
    expect(html).toContain('no se guarda nada hasta que lo confirmes');
  });
});

describe('borrar todas las personas', () => {
  it('aparece en Borrar personas, debajo de la búsqueda, y empieza cerrado', () => {
    const html = dibujar(<BorrarPersona />);
    expect(html.indexOf('busqueda-documento')).toBeLessThan(html.indexOf('data-borrar-todas'));
    expect(html).toContain('Borrar todas las personas…');
    expect(html).not.toContain('Sí, borrar todas');
    expect(html).toContain('El log se conserva completo');
  });

  it('la confirmación es la misma que exige ms-borrar', () => {
    expect(CONFIRMACION).toBe('BORRAR TODAS');
    expect(dibujar(<BorrarTodas />)).toContain('data-borrar-todas');
  });
});
