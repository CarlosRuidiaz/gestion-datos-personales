import { useState } from 'react';
import { Link } from 'react-router';
import { useSesion } from '../auth/ContextoSesion';
import { BusquedaPorDocumento } from '../componentes/BusquedaPorDocumento';
import { FichaPersona, nombreCompleto } from '../persona/FichaPersona';
import type { PersonaApi } from '../persona/tipos';

/**
 * Consultar datos personales (CU-04), para los dos roles: busca por documento en ms-consultar
 * y muestra la ficha completa con la foto. Si el servicio está apagado avisa que no está
 * disponible (CP-07); las demás opciones siguen funcionando.
 */
export function Consultar() {
  const { consultarDisponible } = useSesion();
  const [persona, setPersona] = useState<PersonaApi | null>(null);

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

  return (
    <section className="pantalla">
      <h1>Consultar datos personales</h1>
      {persona ? (
        <>
          <p className="nota">
            Ficha de <strong>{nombreCompleto(persona)}</strong> ({persona.numeroDocumento}).
          </p>
          <FichaPersona persona={persona} />
          <div className="acciones">
            <button type="button" className="boton" onClick={() => setPersona(null)}>
              Consultar otra persona
            </button>
            <Link to="/" className="boton secundario">
              Volver al menú
            </Link>
          </div>
        </>
      ) : (
        <BusquedaPorDocumento ruta="/api/consultar/personas" alEncontrar={setPersona} />
      )}
    </section>
  );
}
