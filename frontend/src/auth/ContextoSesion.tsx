import { createContext, useContext, type ReactNode } from 'react';
import { useConsultarDisponible } from '../menu/useConsultarDisponible';
import type { Usuario } from './sesion';

interface DatosDeSesion {
  usuario: Usuario;
  /** null mientras se hace la primera revisión de /api/consultar/health. */
  consultarDisponible: boolean | null;
  /** Vuelve a revisar el health de Consultar en el momento. */
  revisarConsultar: () => Promise<void>;
}

const Contexto = createContext<DatosDeSesion | null>(null);

export function ProveedorDeSesion({ usuario, children }: { usuario: Usuario; children: ReactNode }) {
  const { disponible, revisar } = useConsultarDisponible();
  return (
    <Contexto.Provider value={{ usuario, consultarDisponible: disponible, revisarConsultar: revisar }}>
      {children}
    </Contexto.Provider>
  );
}

/** Usuario autenticado y estado de Consultar, para cualquier página. */
export function useSesion(): DatosDeSesion {
  const datos = useContext(Contexto);
  if (!datos) throw new Error('useSesion debe usarse dentro de ProveedorDeSesion');
  return datos;
}
