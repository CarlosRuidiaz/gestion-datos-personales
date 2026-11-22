import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useSesion } from '../auth/ContextoSesion';
import { rolesDeLaRuta } from '../menu/opciones';

/**
 * Muestra la página solo si el rol del usuario puede usarla. Es una ayuda para el usuario:
 * la regla de verdad la aplica cada microservicio con el token (sección 9 del diseño).
 */
export function RutaConRol({ ruta, children }: { ruta: string; children: ReactNode }) {
  const { usuario } = useSesion();
  const permitida = rolesDeLaRuta(ruta).some((r) => usuario.roles.includes(r));
  if (!permitida) {
    return (
      <section className="aviso">
        <h1>No tienes permiso para esta opción</h1>
        <p>Tu rol no puede usarla. Vuelve al menú para ver las opciones disponibles.</p>
        <Link to="/" className="boton">
          Volver al menú
        </Link>
      </section>
    );
  }
  return <>{children}</>;
}
