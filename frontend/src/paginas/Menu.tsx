import { Link } from 'react-router';
import { useSesion } from '../auth/ContextoSesion';
import { Rol } from '../auth/roles';
import { InterruptorConsultar } from '../componentes/InterruptorConsultar';
import { configuracion } from '../config';
import { opcionesDelMenu, type OpcionDelMenu } from '../menu/opciones';

const NOTA: Record<OpcionDelMenu['estado'], string> = {
  disponible: '',
  'no-disponible': 'No disponible en este momento',
  'sin-configurar': 'Todavía no está configurado',
};

/** Menú principal: solo las opciones del rol (sección 8.2 del diseño). */
export function Menu() {
  const { usuario, consultarDisponible, revisarConsultar } = useSesion();
  const opciones = opcionesDelMenu(usuario.roles, {
    // Mientras llega la primera respuesta del health no se marca como caído.
    consultarDisponible: consultarDisponible !== false,
    chatUrl: configuracion.chatUrl,
  });

  if (opciones.length === 0) {
    return (
      <section className="aviso">
        <h1>Tu usuario no tiene un rol de la aplicación</h1>
        <p>Pide a un administrador de Keycloak que te asigne el rol administrador o consultor.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Menú principal</h1>
      <ul className="menu">
        {opciones.map((opcion) => (
          <li key={opcion.clave}>
            <Tarjeta opcion={opcion} />
          </li>
        ))}
      </ul>
      {usuario.roles.includes(Rol.ADMINISTRADOR) && (
        <InterruptorConsultar disponible={consultarDisponible} revisar={revisarConsultar} />
      )}
    </section>
  );
}

function Tarjeta({ opcion }: { opcion: OpcionDelMenu }) {
  const contenido = (
    <>
      <span className="titulo">{opcion.titulo}</span>
      <span className="descripcion">{opcion.descripcion}</span>
      {opcion.estado !== 'disponible' && <span className="estado">{NOTA[opcion.estado]}</span>}
      {opcion.externa && opcion.estado === 'disponible' && <span className="estado">Se abre en una pestaña nueva</span>}
    </>
  );

  if (opcion.estado !== 'disponible') {
    return (
      <div className="tarjeta deshabilitada" aria-disabled="true" data-opcion={opcion.clave}>
        {contenido}
      </div>
    );
  }
  if (opcion.externa) {
    return (
      <a className="tarjeta" href={opcion.destino} target="_blank" rel="noopener noreferrer" data-opcion={opcion.clave}>
        {contenido}
      </a>
    );
  }
  return (
    <Link className="tarjeta" to={opcion.destino} data-opcion={opcion.clave}>
      {contenido}
    </Link>
  );
}
