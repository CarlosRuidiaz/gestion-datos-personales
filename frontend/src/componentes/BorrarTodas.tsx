import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ErrorApi, pedirApi } from '../api/cliente';
import { Alerta } from './Alerta';

/** Lo que hay que escribir para confirmar. Debe coincidir con CONFIRMACION_BORRAR_TODAS de ms-borrar. */
export const CONFIRMACION = 'BORRAR TODAS';

/**
 * Borrar todas las personas, dentro de la opción Borrar. Pide escribir BORRAR TODAS antes de
 * llamar a ms-borrar, que las borra una por una, cada una con su registro en el log.
 */
export function BorrarTodas() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borradas, setBorradas] = useState<number | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setTexto('');
    setError(null);
  }

  async function borrar() {
    setBorrando(true);
    setError(null);
    try {
      const r = await pedirApi<{ borradas: number }>(
        `/api/borrar/personas?confirmacion=${encodeURIComponent(CONFIRMACION)}`,
        { method: 'DELETE' },
      );
      setBorradas(r.borradas);
      cerrar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="borrar-todas" data-borrar-todas>
      <h2>Borrar todas las personas</h2>
      {borradas !== null && (
        <Alerta tipo="exito">
          <strong>{borradas === 1 ? 'Se borró 1 persona.' : `Se borraron ${borradas} personas.`}</strong> Cada borrado
          quedó en el log con los datos que tenía la persona. <Link to="/log">Ver el log</Link>
        </Alerta>
      )}
      {!abierto ? (
        <>
          <p className="nota">
            Deja la base de datos sin personas, por ejemplo antes de importar otro archivo. El log se conserva completo.
          </p>
          <button type="button" className="boton peligro" onClick={() => { setBorradas(null); setAbierto(true); }}>
            Borrar todas las personas…
          </button>
        </>
      ) : (
        <div className="confirmacion" role="alertdialog" aria-labelledby="borrar-todas-titulo" aria-describedby="borrar-todas-texto">
          <h2 id="borrar-todas-titulo">¿Borrar todas las personas?</h2>
          <p id="borrar-todas-texto">
            Se borrarán los datos y las fotos de todas las personas registradas. Esta acción no se puede deshacer. Cada
            borrado queda en el log. Para confirmar, escribe <strong>{CONFIRMACION}</strong>.
          </p>
          {error && <Alerta tipo="error">{error}</Alerta>}
          <div className="campo">
            <label htmlFor="borrar-todas-confirmacion">Confirmación</label>
            <input
              id="borrar-todas-confirmacion"
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="acciones">
            <button type="button" className="boton secundario" onClick={cerrar} disabled={borrando}>
              Cancelar
            </button>
            <button
              type="button"
              className="boton peligro"
              onClick={() => void borrar()}
              disabled={borrando || texto.trim() !== CONFIRMACION}
            >
              {borrando ? 'Borrando…' : 'Sí, borrar todas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
