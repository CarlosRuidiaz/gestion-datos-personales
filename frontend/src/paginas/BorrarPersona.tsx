import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ErrorApi, pedirApi } from '../api/cliente';
import { Alerta } from '../componentes/Alerta';
import { BorrarTodas } from '../componentes/BorrarTodas';
import { BusquedaPorDocumento } from '../componentes/BusquedaPorDocumento';
import { FichaPersona, nombreCompleto } from '../persona/FichaPersona';
import type { PersonaApi } from '../persona/tipos';

const RUTA = '/api/borrar/personas';

/**
 * Borrar personas (CU-06), solo para el administrador: busca por documento en ms-borrar (búsqueda
 * previa propia, que queda en el log), muestra los datos para revisarlos y pide confirmación.
 * Solo al confirmar se llama a DELETE; si el usuario cancela, no se borra nada.
 */
export function BorrarPersona() {
  const [persona, setPersona] = useState<PersonaApi | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrada, setBorrada] = useState<{ nombre: string; documento: string } | null>(null);

  function empezarDeNuevo() {
    setPersona(null);
    setConfirmando(false);
    setError(null);
    setBorrada(null);
  }

  async function borrar() {
    if (!persona) return;
    setBorrando(true);
    setError(null);
    try {
      await pedirApi(`${RUTA}/${persona.numeroDocumento}`, { method: 'DELETE' });
      setBorrada({ nombre: nombreCompleto(persona), documento: persona.numeroDocumento });
      setPersona(null);
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 404) {
        setError('La persona ya no estaba registrada: es posible que alguien la haya borrado antes.');
      } else {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar con el servidor. Intenta de nuevo.');
      }
    } finally {
      setBorrando(false);
      setConfirmando(false);
    }
  }

  if (borrada) {
    return (
      <section className="pantalla">
        <h1>Borrar personas</h1>
        <Alerta tipo="exito">
          <strong>Persona borrada.</strong> Se borraron los datos de {borrada.nombre} ({borrada.documento}). Su
          historial sigue disponible en Consultar log.
        </Alerta>
        <div className="acciones">
          <button type="button" className="boton" onClick={empezarDeNuevo}>
            Borrar otra persona
          </button>
          <Link to="/log" className="boton secundario">
            Ver el log
          </Link>
          <Link to="/" className="boton secundario">
            Volver al menú
          </Link>
        </div>
      </section>
    );
  }

  if (!persona) {
    return (
      <section className="pantalla">
        <h1>Borrar personas</h1>
        <p className="nota">Busca a la persona por su documento. Antes de borrar podrás revisar sus datos.</p>
        <BusquedaPorDocumento ruta={RUTA} alEncontrar={setPersona} />
        <BorrarTodas />
      </section>
    );
  }

  return (
    <section className="pantalla">
      <h1>Borrar personas</h1>
      <p className="nota">Revisa los datos antes de borrar.</p>
      {error && <Alerta tipo="error">{error}</Alerta>}
      <FichaPersona persona={persona} />
      {confirmando ? (
        <ConfirmacionBorrado persona={persona} borrando={borrando} alConfirmar={borrar} alCancelar={() => setConfirmando(false)} />
      ) : (
        <div className="acciones">
          <button type="button" className="boton peligro" onClick={() => setConfirmando(true)}>
            Borrar esta persona
          </button>
          <button type="button" className="boton secundario" onClick={empezarDeNuevo}>
            Buscar otra persona
          </button>
          <Link to="/" className="boton secundario">
            Volver al menú
          </Link>
        </div>
      )}
    </section>
  );
}

/** Pregunta de confirmación. El foco empieza en «Cancelar», la opción que no borra nada. */
export function ConfirmacionBorrado({
  persona,
  borrando,
  alConfirmar,
  alCancelar,
}: {
  persona: PersonaApi;
  borrando: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
}) {
  const cancelar = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelar.current?.focus(), []);

  return (
    <div className="confirmacion" role="alertdialog" aria-labelledby="confirmar-titulo" aria-describedby="confirmar-texto">
      <h2 id="confirmar-titulo">¿Borrar a {nombreCompleto(persona)}?</h2>
      <p id="confirmar-texto">
        Se borrarán los datos{persona.tieneFoto ? ' y la foto' : ''} de la persona con {persona.tipoDocumento.toLowerCase()} número{' '}
        {persona.numeroDocumento}. Esta acción no se puede deshacer. El historial de sus transacciones se conserva en el
        log.
      </p>
      <div className="acciones">
        <button type="button" className="boton secundario" onClick={alCancelar} disabled={borrando} ref={cancelar}>
          Cancelar
        </button>
        <button type="button" className="boton peligro" onClick={alConfirmar} disabled={borrando}>
          {borrando ? 'Borrando…' : 'Sí, borrar'}
        </button>
      </div>
    </div>
  );
}
