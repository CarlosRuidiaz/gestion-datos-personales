import { useState } from 'react';
import { Link } from 'react-router';
import { pedirApi } from '../api/cliente';
import { Alerta } from '../componentes/Alerta';
import { aFormData } from '../persona/envio';
import { FormularioPersona } from '../persona/FormularioPersona';
import { erroresDeGuardado, type ErroresDeGuardado } from '../persona/guardar';
import type { EnvioPersona, PersonaApi } from '../persona/tipos';

/** Crear personas (CU-02): formulario vacío, POST /api/crear/personas con la foto y confirmación. */
export function CrearPersona() {
  const [ocupado, setOcupado] = useState(false);
  const [errores, setErrores] = useState<ErroresDeGuardado | null>(null);
  const [creada, setCreada] = useState<PersonaApi | null>(null);
  // Cambiar la llave vuelve a montar el formulario vacío.
  const [version, setVersion] = useState(0);

  async function guardar(envio: EnvioPersona) {
    setOcupado(true);
    setErrores(null);
    try {
      setCreada(await pedirApi<PersonaApi>('/api/crear/personas', { method: 'POST', body: aFormData(envio, 'crear') }));
    } catch (error) {
      setErrores(erroresDeGuardado(error));
    } finally {
      setOcupado(false);
    }
  }

  if (creada) {
    return <PersonaCreada persona={creada} alCrearOtra={() => { setCreada(null); setVersion((v) => v + 1); }} />;
  }

  return (
    <section className="pantalla">
      <h1>Crear personas</h1>
      <p className="nota">Los campos con * son obligatorios.</p>
      {errores && <Alerta tipo="error">{errores.general}</Alerta>}
      <FormularioPersona
        key={version}
        modo="crear"
        textoBoton="Guardar"
        ocupado={ocupado}
        erroresServidor={errores?.porCampo}
        alEnviar={guardar}
        acciones={
          <Link to="/" className="boton secundario">
            Cancelar
          </Link>
        }
      />
    </section>
  );
}

export function PersonaCreada({ persona, alCrearOtra }: { persona: PersonaApi; alCrearOtra: () => void }) {
  const nombre = [persona.primerNombre, persona.segundoNombre, persona.apellidos].filter(Boolean).join(' ');
  return (
    <section className="pantalla">
      <h1>Crear personas</h1>
      <Alerta tipo="exito">
        <strong>Persona registrada.</strong> Se guardaron los datos de {nombre}, {persona.tipoDocumento.toLowerCase()}{' '}
        número {persona.numeroDocumento}, {persona.tieneFoto ? 'con foto.' : 'sin foto.'}
      </Alerta>
      <div className="acciones">
        <button type="button" className="boton" onClick={alCrearOtra}>
          Crear otra persona
        </button>
        <Link to="/" className="boton secundario">
          Volver al menú
        </Link>
      </div>
    </section>
  );
}
