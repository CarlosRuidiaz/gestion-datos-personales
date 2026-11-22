import { Link, Outlet } from 'react-router';
import { nombreDelRol } from '../auth/roles';
import { useSesion } from '../auth/ContextoSesion';
import { cerrarSesion } from '../auth/sesion';

/** Encabezado común: nombre de la aplicación, usuario, rol y botón para cerrar sesión. */
export function Marco() {
  const { usuario } = useSesion();
  return (
    <div className="marco">
      <header className="encabezado">
        <Link to="/" className="marca">
          Gestión de Datos Personales
        </Link>
        <div className="usuario">
          <span>
            {usuario.nombre} · <strong>{nombreDelRol(usuario.roles)}</strong>
          </span>
          <button type="button" className="boton secundario" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
