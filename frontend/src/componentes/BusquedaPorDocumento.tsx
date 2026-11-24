import { useState, type FormEvent } from 'react';
import { ErrorApi, pedirApi } from '../api/cliente';
import type { PersonaApi } from '../persona/tipos';

const DOCUMENTO = /^[0-9]{1,10}$/;

/**
 * Búsqueda por número de documento. La usan Modificar, Consultar y Borrar
 * cambiando la ruta. Un 404 se muestra como «no hay una persona registrada».
 */
export function BusquedaPorDocumento({
  ruta,
  alEncontrar,
}: {
  ruta: string;
  alEncontrar: (persona: PersonaApi) => void;
}) {
  const [documento, setDocumento] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar(evento: FormEvent) {
    evento.preventDefault();
    const valor = documento.trim();
    if (!DOCUMENTO.test(valor)) {
      setError(
        valor ? 'El número de documento debe tener solo dígitos y máximo 10 caracteres' : 'Escribe el número de documento',
      );
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      alEncontrar(await pedirApi<PersonaApi>(`${ruta}/${valor}`));
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 404) {
        setError(`No hay una persona registrada con el documento ${valor}.`);
      } else if (e instanceof ErrorApi) {
        setError(e.message);
      } else {
        setError('No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
      }
    } finally {
      setBuscando(false);
    }
  }

  return (
    <form className="busqueda" onSubmit={buscar} noValidate>
      <label htmlFor="busqueda-documento">Número de documento</label>
      <div className="fila">
        <input
          id="busqueda-documento"
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'busqueda-error' : undefined}
        />
        <button type="submit" className="boton" disabled={buscando}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      {error && (
        <span className="error-campo" id="busqueda-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
