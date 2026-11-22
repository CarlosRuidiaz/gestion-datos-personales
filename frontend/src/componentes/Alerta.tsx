import type { ReactNode } from 'react';

/** Mensaje de resultado de una operación. El de error lo anuncian los lectores de pantalla de inmediato. */
export function Alerta({ tipo, children }: { tipo: 'exito' | 'error'; children: ReactNode }) {
  return (
    <div className={`alerta ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'} data-alerta={tipo}>
      {children}
    </div>
  );
}
