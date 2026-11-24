import { useCallback, useEffect, useState } from 'react';
import { ErrorApi, pedirApi } from '../api/cliente';
import './interruptor.css';

/** Respuesta de ms-control (GET, POST apagar y POST encender en /api/control/consultar). */
interface EstadoControl {
  encendido: boolean;
  replicas: number;
  enEjecucion: number;
}

type Accion = 'apagar' | 'encender';

const RUTA = '/api/control/consultar';
const ESPERA_MAXIMA_MS = 60_000;
const CADA_MS = 1_500;

interface Props {
  /** Estado de Consultar según su health (null mientras llega la primera respuesta). */
  disponible: boolean | null;
  /** Revisa el health en el momento, para que el menú cambie sin esperar. */
  revisar: () => Promise<void>;
}

/**
 * Interruptor del administrador para apagar y encender Consultar (RF-09). ms-control detiene o
 * arranca de verdad el contenedor de ms-consultar; después se espera a que el health lo confirme,
 * así el menú y el interruptor muestran lo mismo.
 */
export function InterruptorConsultar({ disponible, revisar }: Props) {
  const [encendido, setEncendido] = useState<boolean | null>(null);
  const [pendiente, setPendiente] = useState<Accion | null>(null);
  const [error, setError] = useState('');

  const leerEstado = useCallback(async () => {
    try {
      const estado = await pedirApi<EstadoControl>(RUTA);
      setEncendido(estado.encendido);
      setError('');
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, []);

  useEffect(() => {
    void leerEstado();
  }, [leerEstado]);

  // Mientras se espera la confirmación, se revisa el health seguido. Se termina cuando coincide.
  useEffect(() => {
    if (!pendiente) return;
    if (disponible === (pendiente === 'encender')) {
      setPendiente(null);
      return;
    }
    const intervalo = window.setInterval(() => void revisar(), CADA_MS);
    const limite = window.setTimeout(() => {
      setPendiente(null);
      setError('Consultar tarda en responder. Revisa el estado en unos segundos.');
    }, ESPERA_MAXIMA_MS);
    return () => {
      window.clearInterval(intervalo);
      window.clearTimeout(limite);
    };
  }, [pendiente, disponible, revisar]);

  const cambiar = async () => {
    const accion: Accion = encendido ? 'apagar' : 'encender';
    setError('');
    setPendiente(accion);
    try {
      const estado = await pedirApi<EstadoControl>(`${RUTA}/${accion}`, { method: 'POST' });
      setEncendido(estado.encendido);
      await revisar();
    } catch (e) {
      setPendiente(null);
      setError(mensajeDeError(e));
      void leerEstado();
    }
  };

  const texto = pendiente === 'apagar' ? 'Apagando…' : pendiente === 'encender' ? 'Encendiendo…' : encendido ? 'Encendido' : 'Apagado';

  return (
    <div className="interruptor-consultar" data-interruptor="consultar">
      <div className="interruptor-texto">
        <span className="interruptor-titulo" id="interruptor-consultar-titulo">
          Servicio Consultar
        </span>
        <span className="interruptor-ayuda">
          Apagarlo detiene su contenedor. Las demás opciones siguen funcionando.
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={encendido === true}
        aria-labelledby="interruptor-consultar-titulo"
        className={`interruptor ${encendido ? 'encendido' : 'apagado'}`}
        disabled={encendido === null || pendiente !== null}
        onClick={() => void cambiar()}
      >
        <span className="interruptor-pista" aria-hidden="true">
          <span className="interruptor-perilla" />
        </span>
        <span className="interruptor-estado" aria-live="polite">
          {encendido === null && !error ? 'Revisando…' : texto}
        </span>
      </button>
      {error && (
        <p className="interruptor-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi) {
    // Sin cuerpo JSON, el 503 viene de Traefik: ms-control está apagado. Con cuerpo, trae su propio mensaje.
    return e.message === 'El servicio no está disponible en este momento'
      ? 'El servicio de control (ms-control) no está disponible'
      : e.message;
  }
  return 'No se pudo cambiar el estado de Consultar';
}
