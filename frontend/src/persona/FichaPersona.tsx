import { formatearFecha } from './fecha';
import type { PersonaApi } from './tipos';

/** Nombre completo, sin el segundo nombre cuando no lo tiene. */
export function nombreCompleto(persona: Pick<PersonaApi, 'primerNombre' | 'segundoNombre' | 'apellidos'>): string {
  return [persona.primerNombre, persona.segundoNombre, persona.apellidos].filter(Boolean).join(' ');
}

/**
 * Ficha de solo lectura de una persona, con la misma distribución del formulario (prototipo del
 * enunciado): identificación con la foto a la derecha y, debajo de una línea, el contacto.
 * La usan Consultar (CU-04) y Borrar, para revisar los datos antes de confirmar (CU-06).
 */
export function FichaPersona({ persona }: { persona: PersonaApi }) {
  return (
    <article className="ficha-persona" aria-label={`Datos de ${nombreCompleto(persona)}`}>
      <div className="identificacion">
        <dl className="campos">
          <Dato etiqueta="Tipo de documento" valor={persona.tipoDocumento} />
          <Dato etiqueta="Nro. Documento" valor={persona.numeroDocumento} />
          <Dato etiqueta="Primer nombre" valor={persona.primerNombre} />
          <Dato etiqueta="Segundo nombre" valor={persona.segundoNombre} />
          <Dato etiqueta="Apellidos" valor={persona.apellidos} ancho />
          <Dato etiqueta="Fecha de nacimiento" valor={formatearFecha(persona.fechaNacimiento)} />
          <Dato etiqueta="Género" valor={persona.genero} />
        </dl>
        <div className="foto">
          <span className="etiqueta">Foto</span>
          <div className="marco-foto">
            {persona.foto ? (
              <img src={persona.foto} alt={`Foto de ${nombreCompleto(persona)}`} />
            ) : (
              <span className="sin-foto">Sin foto</span>
            )}
          </div>
        </div>
      </div>
      <hr />
      <dl className="contacto">
        <Dato etiqueta="Correo electrónico" valor={persona.correo} />
        <Dato etiqueta="Celular" valor={persona.celular} />
      </dl>
    </article>
  );
}

function Dato({ etiqueta, valor, ancho = false }: { etiqueta: string; valor: string | null; ancho?: boolean }) {
  return (
    <div className={ancho ? 'dato ancho' : 'dato'}>
      <dt>{etiqueta}</dt>
      <dd>{valor || <span className="vacio">No registrado</span>}</dd>
    </div>
  );
}
