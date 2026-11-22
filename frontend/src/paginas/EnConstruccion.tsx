import { Link } from 'react-router';

/** Lugar de las pantallas que llenan T12 (crear y modificar) y T13 (consultar, borrar y log). */
export function EnConstruccion({ titulo, tarea }: { titulo: string; tarea: string }) {
  return (
    <section className="aviso">
      <h1>{titulo}</h1>
      <p>Esta pantalla se construye en la tarea {tarea}.</p>
      <Link to="/" className="boton">
        Volver al menú
      </Link>
    </section>
  );
}
