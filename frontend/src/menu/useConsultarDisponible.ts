import { useEffect, useState } from 'react';

const RUTA_HEALTH = '/api/consultar/health';
const CADA_MS = 10_000;

/**
 * true mientras GET /api/consultar/health responda 200. Con ms-consultar apagado Traefik
 * responde 404, y sin base de datos el servicio responde 503: cualquier respuesta distinta
 * de 200 cuenta como «no disponible» (sección 7 de CONTEXTO.md). Se revisa cada 10 segundos
 * y cada vez que la ventana vuelve a tener el foco.
 */
export function useConsultarDisponible(): boolean | null {
  const [disponible, setDisponible] = useState<boolean | null>(null);

  useEffect(() => {
    let activo = true;
    const revisar = async () => {
      try {
        const respuesta = await fetch(RUTA_HEALTH, { cache: 'no-store' });
        const cuerpo = respuesta.status === 200 ? ((await respuesta.json()) as { estado?: string }) : null;
        if (activo) setDisponible(cuerpo?.estado === 'disponible');
      } catch {
        if (activo) setDisponible(false);
      }
    };
    void revisar();
    const intervalo = window.setInterval(revisar, CADA_MS);
    window.addEventListener('focus', revisar);
    return () => {
      activo = false;
      window.clearInterval(intervalo);
      window.removeEventListener('focus', revisar);
    };
  }, []);

  return disponible;
}
