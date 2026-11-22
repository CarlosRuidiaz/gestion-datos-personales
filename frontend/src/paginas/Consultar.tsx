import { Link } from 'react-router';
import { useSesion } from '../auth/ContextoSesion';
import { EnConstruccion } from './EnConstruccion';

/** Consultar avisa si su servicio está apagado (CU-04, CP-07). La pantalla la completa T13. */
export function Consultar() {
  const { consultarDisponible } = useSesion();
  if (consultarDisponible === false) {
    return (
      <section className="aviso">
        <h1>Consultar no está disponible</h1>
        <p>El servicio de consulta está apagado en este momento. Las demás opciones siguen funcionando.</p>
        <Link to="/" className="boton">
          Volver al menú
        </Link>
      </section>
    );
  }
  return <EnConstruccion titulo="Consultar datos personales" tarea="T13" />;
}
