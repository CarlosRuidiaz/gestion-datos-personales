import { describe, expect, it } from 'vitest';
import { Rol, rolesDeLaAplicacion } from '../auth/roles';
import { opcionesDelMenu, rolesDeLaRuta } from './opciones';

const TODO_ARRIBA = { consultarDisponible: true, chatUrl: 'http://localhost:5678/webhook/chat' };
const claves = (roles: Rol[], servicios = TODO_ARRIBA) => opcionesDelMenu(roles, servicios).map((o) => o.clave);

describe('menú por rol', () => {
  it('el administrador ve las seis opciones, en el orden del diseño', () => {
    expect(claves([Rol.ADMINISTRADOR])).toEqual(['crear', 'modificar', 'consultar', 'consulta-nl', 'borrar', 'log']);
  });

  it('el consultor solo ve consultar, la consulta en lenguaje natural y el log', () => {
    expect(claves([Rol.CONSULTOR])).toEqual(['consultar', 'consulta-nl', 'log']);
  });

  it('un usuario sin rol de la aplicación no ve ninguna opción', () => {
    expect(claves([])).toEqual([]);
    expect(rolesDeLaAplicacion(['offline_access', 'uma_authorization'])).toEqual([]);
  });

  it('con los dos roles ve todo, sin repetir', () => {
    expect(claves([Rol.CONSULTOR, Rol.ADMINISTRADOR])).toHaveLength(6);
  });
});

describe('estado de las opciones', () => {
  it('consultar aparece como no disponible si su servicio está apagado', () => {
    const opciones = opcionesDelMenu([Rol.CONSULTOR], { ...TODO_ARRIBA, consultarDisponible: false });
    expect(opciones.find((o) => o.clave === 'consultar')?.estado).toBe('no-disponible');
    expect(opciones.find((o) => o.clave === 'log')?.estado).toBe('disponible');
  });

  it('el chat abre la URL de n8n, o queda sin configurar si no la hay', () => {
    const conChat = opcionesDelMenu([Rol.CONSULTOR], TODO_ARRIBA).find((o) => o.clave === 'consulta-nl');
    expect(conChat).toMatchObject({ estado: 'disponible', externa: true, destino: TODO_ARRIBA.chatUrl });
    const sinChat = opcionesDelMenu([Rol.CONSULTOR], { ...TODO_ARRIBA, chatUrl: '' }).find(
      (o) => o.clave === 'consulta-nl',
    );
    expect(sinChat?.estado).toBe('sin-configurar');
  });
});

describe('roles de cada ruta', () => {
  it('crear, modificar y borrar son solo del administrador', () => {
    for (const ruta of ['/crear', '/modificar', '/borrar']) expect(rolesDeLaRuta(ruta)).toEqual([Rol.ADMINISTRADOR]);
  });

  it('consultar y log son de los dos roles', () => {
    for (const ruta of ['/consultar', '/log']) {
      expect(rolesDeLaRuta(ruta)).toEqual([Rol.ADMINISTRADOR, Rol.CONSULTOR]);
    }
  });

  it('una ruta desconocida no admite a nadie', () => {
    expect(rolesDeLaRuta('/otra')).toEqual([]);
  });
});
