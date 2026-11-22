import { createContext, useContext, type ReactNode } from 'react';
import { useConsultarDisponible } from '../menu/useConsultarDisponible';
import type { Usuario } from './sesion';

interface DatosDeSesion {
  usuario: Usuario;
  /** null mientras se hace la primera revisión de /api/consultar/health. */
  consultarDisponible: boolean | null;
}

const Contexto = createContext<DatosDeSesion | null>(null);

export function ProveedorDeSesion({ usuario, children }: { usuario: Usuario; children: ReactNode }) {
  const consultarDisponible = useConsultarDisponible();
  return <Contexto.Provider value={{ usuario, consultarDisponible }}>{children}</Contexto.Provider>;
}

/** Usuario autenticado y estado de Consultar, para cualquier página. */
export function useSesion(): DatosDeSesion {
  const datos = useContext(Contexto);
  if (!datos) throw new Error('useSesion debe usarse dentro de ProveedorDeSesion');
  return datos;
}
