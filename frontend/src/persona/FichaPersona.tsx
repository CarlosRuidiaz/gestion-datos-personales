import { formatearFecha } from './fecha';
import type { PersonaApi } from './tipos';

/** Nombre completo, sin el segundo nombre cuando no lo tiene. */
export function nombreCompleto(persona: Pick<PersonaApi, 'primerNombre' | 'segundoNombre' | 'apellidos'>): string {
  return [persona.primerNombre, persona.segundoNombre, persona.apellidos].filter(Boolean).join(' ');
}

/** Celular agrupado de a 3, 3 y 4 cifras para leerlo mejor. Lo guardado no cambia. */
export function celularLegible(celular: string): string {
  return /^[0-9]{10}$/.test(celular) ? `${celular.slice(0, 3)} ${celular.slice(3, 6)} ${celular.slice(6)}` : celular;
}

/**
 * Ficha de solo lectura de una persona, con forma de documento y la distribución del prototipo del
 * enunciado: arriba lo que la identifica (tipo y número de documento, nombre completo, fecha de
 * nacimiento y género) con la foto a la derecha y, debajo de una línea, el contacto.
 * La usan Consultar (CU-04) y Borrar, para revisar los datos antes de confirmar (CU-06).
 */
export function FichaPersona({ persona }: { persona: PersonaApi }) {
  const nombre = nombreCompleto(persona);
  return (
    <article className="ficha-persona" aria-label={`Datos de ${nombre}`}>
      <div className="identificacion">
        <div>
          <p className="tipo-documento">{persona.tipoDocumento}</p>
          <p className="numero-documento" data-documento>
            {persona.numeroDocumento}
          </p>
          <h2 className="nombre-persona">{nombre}</h2>
          <dl className="datos">
            <Dato etiqueta="Fecha de nacimiento" valor={formatearFecha(persona.fechaNacimiento)} />
            <Dato etiqueta="Género" valor={persona.genero} />
          </dl>
        </div>
        <div className="foto">
          <div className="marco-foto">
            {persona.foto ? <img src={persona.foto} alt={`Foto de ${nombre}`} /> : <span className="sin-foto">Sin foto</span>}
          </div>
        </div>
      </div>
      <hr />
      <dl className="datos">
        <Dato etiqueta="Correo electrónico" valor={persona.correo} />
        <Dato etiqueta="Celular" valor={persona.celular ? celularLegible(persona.celular) : null} />
      </dl>
    </article>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="dato">
      <dt>{etiqueta}</dt>
      <dd>{valor || <span className="vacio">No registrado</span>}</dd>
    </div>
  );
}
