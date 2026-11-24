import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { nombreDelRol } from '../auth/roles';
import { useSesion } from '../auth/ContextoSesion';
import { cerrarSesion } from '../auth/sesion';
import { configuracion } from '../config';
import { opcionesDelMenu, type OpcionDelMenu } from '../menu/opciones';

/**
 * Marco común: barra lateral con el nombre de la aplicación, las opciones del rol (las mismas del
 * menú principal, de `opcionesDelMenu`), el usuario, su rol y «Cerrar sesión». En pantallas
 * angostas la barra pasa arriba y las opciones se despliegan con el botón «Menú».
 */
export function Marco() {
  const { usuario, consultarDisponible } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const { pathname } = useLocation();

  // Al cambiar de pantalla, el menú del móvil se cierra.
  useEffect(() => setAbierto(false), [pathname]);

  const opciones = opcionesDelMenu(usuario.roles, {
    consultarDisponible: consultarDisponible !== false,
    chatUrl: configuracion.chatUrl,
  });

  return (
    <div className="marco">
      <aside className="lateral">
        <div className="lateral-cabeza">
          <Link to="/" className="marca">
            Gestión de Datos Personales
          </Link>
          <button
            type="button"
            className="boton-menu"
            aria-expanded={abierto}
            aria-controls="navegacion"
            onClick={() => setAbierto((a) => !a)}
          >
            {abierto ? 'Cerrar menú' : 'Menú'}
          </button>
        </div>
        <div id="navegacion" className={abierto ? 'navegacion abierta' : 'navegacion'}>
          <nav aria-label="Opciones">
            <ul>
              <li>
                <NavLink to="/" end data-navegacion="inicio">
                  Inicio
                </NavLink>
              </li>
              {opciones.map((opcion) => (
                <li key={opcion.clave}>
                  <EnlaceLateral opcion={opcion} />
                </li>
              ))}
            </ul>
          </nav>
          <div className="sesion">
            <strong>{usuario.nombre}</strong>
            {nombreDelRol(usuario.roles)}
            <br />
            <button type="button" onClick={cerrarSesion}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}

const NOTA_LATERAL: Record<OpcionDelMenu['estado'], string> = {
  disponible: '',
  'no-disponible': 'No disponible',
  'sin-configurar': 'Sin configurar',
};

function EnlaceLateral({ opcion }: { opcion: OpcionDelMenu }) {
  if (opcion.estado !== 'disponible') {
    return (
      <span className="apagada" aria-disabled="true" data-navegacion={opcion.clave}>
        {opcion.titulo}
        <small>{NOTA_LATERAL[opcion.estado]}</small>
      </span>
    );
  }
  if (opcion.externa) {
    return (
      <a href={opcion.destino} target="_blank" rel="noopener noreferrer" data-navegacion={opcion.clave}>
        {opcion.titulo} <span aria-hidden="true">↗</span>
        <span className="solo-lectores"> (se abre en una pestaña nueva)</span>
      </a>
    );
  }
  return (
    <NavLink to={opcion.destino} data-navegacion={opcion.clave}>
      {opcion.titulo}
    </NavLink>
  );
}
