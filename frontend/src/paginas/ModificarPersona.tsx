import { useState } from 'react';
import { Link } from 'react-router';
import { pedirApi } from '../api/cliente';
import { BusquedaPorDocumento } from '../componentes/BusquedaPorDocumento';
import { Alerta } from '../componentes/Alerta';
import { aFormData, datosDesdePersona, leerComoDataUrl } from '../persona/envio';
import { FormularioPersona } from '../persona/FormularioPersona';
import { erroresDeGuardado, type ErroresDeGuardado } from '../persona/guardar';
import type { EnvioPersona, PersonaApi } from '../persona/tipos';

/**
 * Modificar datos personales (CU-03): busca por documento en ms-modificar (su propia búsqueda,
 * que queda en el log como «Búsqueda previa a una modificación»), llena el formulario y guarda con PUT.
 */
export function ModificarPersona() {
  const [persona, setPersona] = useState<PersonaApi | null>(null);
  const [version, setVersion] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [errores, setErrores] = useState<ErroresDeGuardado | null>(null);
  const [guardado, setGuardado] = useState(false);

  async function guardar(envio: EnvioPersona) {
    if (!persona) return;
    setOcupado(true);
    setErrores(null);
    setGuardado(false);
    try {
      const actualizada = await pedirApi<PersonaApi>(`/api/modificar/personas/${persona.numeroDocumento}`, {
        method: 'PUT',
        body: aFormData(envio, 'modificar'),
      });
      // El PUT no devuelve la foto: se arma con lo que se envió, sin otra búsqueda (que quedaría en el log).
      const foto = envio.foto ? await leerComoDataUrl(envio.foto) : actualizada.tieneFoto ? (persona.foto ?? null) : null;
      setPersona({ ...actualizada, foto });
      setVersion((v) => v + 1);
      setGuardado(true);
    } catch (error) {
      setErrores(erroresDeGuardado(error));
    } finally {
      setOcupado(false);
    }
  }

  function buscarOtra() {
    setPersona(null);
    setErrores(null);
    setGuardado(false);
  }

  if (!persona) {
    return (
      <section className="pantalla">
        <h1>Modificar datos personales</h1>
        <BusquedaPorDocumento
          ruta="/api/modificar/personas"
          alEncontrar={(encontrada) => {
            setPersona(encontrada);
            setVersion((v) => v + 1);
          }}
        />
      </section>
    );
  }

  const nombre = [persona.primerNombre, persona.segundoNombre, persona.apellidos].filter(Boolean).join(' ');
  return (
    <section className="pantalla">
      <h1>Modificar datos personales</h1>
      <p className="nota">
        Editando a <strong>{nombre}</strong> ({persona.numeroDocumento}). Los campos con * son obligatorios.
      </p>
      {guardado && (
        <Alerta tipo="exito">
          <strong>Cambios guardados.</strong> Los datos de {nombre} quedaron actualizados.
        </Alerta>
      )}
      {errores && <Alerta tipo="error">{errores.general}</Alerta>}
      <FormularioPersona
        key={version}
        modo="modificar"
        inicial={datosDesdePersona(persona)}
        fotoActual={persona.foto ?? null}
        textoBoton="Guardar cambios"
        ocupado={ocupado}
        erroresServidor={errores?.porCampo}
        alEnviar={guardar}
        acciones={
          <>
            <button type="button" className="boton secundario" onClick={buscarOtra}>
              Buscar otra persona
            </button>
            <Link to="/" className="boton secundario">
              Volver al menú
            </Link>
          </>
        }
      />
    </section>
  );
}
