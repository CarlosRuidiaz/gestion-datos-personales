import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { formatearFecha, hoyIso, parsearFecha } from './fecha';
import {
  CAMPOS,
  GENEROS,
  LONGITUD,
  PERSONA_VACIA,
  TIPOS_DOCUMENTO,
  type CampoConError,
  type CampoPersona,
  type DatosPersona,
  type EnvioPersona,
} from './tipos';
import { normalizarPersona, validarPersona, type ErroresPersona } from './validaciones';

// Constante para que el valor por defecto no cambie en cada render (el efecto de abajo depende de él).
const SIN_ERRORES: ErroresPersona = {};

interface Props {
  modo: 'crear' | 'modificar';
  /** Valores con que empieza el formulario (al modificar, los de la persona buscada). */
  inicial?: DatosPersona;
  /** Foto actual como data URL (al modificar). */
  fotoActual?: string | null;
  /** Errores que devolvió la API en un 400 o un 409, por campo. Se borran cuando el usuario edita el campo. */
  erroresServidor?: ErroresPersona;
  ocupado?: boolean;
  textoBoton: string;
  alEnviar: (envio: EnvioPersona) => void;
  /** Botones extra junto al de guardar (por ejemplo, «Buscar otra persona»). */
  acciones?: ReactNode;
}

/**
 * Formulario de persona para crear y modificar (sección 8.2 del diseño). Sigue el prototipo del
 * enunciado: datos de identificación con la foto a la derecha y, debajo de una línea, los de contacto.
 * Valida cada campo al salir de él y todos al guardar; los errores aparecen junto a su campo.
 */
export function FormularioPersona({
  modo,
  inicial = PERSONA_VACIA,
  fotoActual = null,
  erroresServidor = SIN_ERRORES,
  ocupado = false,
  textoBoton,
  alEnviar,
  acciones,
}: Props) {
  const id = useId();
  const [valores, setValores] = useState<DatosPersona>(inicial);
  const [foto, setFoto] = useState<File | null>(null);
  const [eliminarFoto, setEliminarFoto] = useState(false);
  const [tocados, setTocados] = useState<Set<CampoConError>>(new Set());
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [servidor, setServidor] = useState<ErroresPersona>(erroresServidor);
  const [vistaFotoNueva, setVistaFotoNueva] = useState<string | null>(null);

  // Cada respuesta nueva de la API trae su propia lista de errores.
  useEffect(() => setServidor(erroresServidor), [erroresServidor]);

  // Vista previa de la foto elegida, liberando la anterior.
  useEffect(() => {
    if (!foto) {
      setVistaFotoNueva(null);
      return;
    }
    const url = URL.createObjectURL(foto);
    setVistaFotoNueva(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const errores = useMemo(() => validarPersona(valores, foto, modo), [valores, foto, modo]);
  const errorDe = (campo: CampoConError) =>
    ((intentoGuardar || tocados.has(campo)) && errores[campo]) || servidor[campo];

  const tocar = (campo: CampoConError) => setTocados((previos) => new Set(previos).add(campo));
  const cambiar = (campo: CampoPersona, valor: string) => {
    setValores((previos) => ({ ...previos, [campo]: valor }));
    setServidor(({ [campo]: _, ...resto }) => resto);
  };

  const elegirFoto = (archivo: File | null) => {
    setFoto(archivo);
    if (archivo) setEliminarFoto(false);
    tocar('foto');
    setServidor(({ foto: _, ...resto }) => resto);
  };

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    setIntentoGuardar(true);
    const primero = CAMPOS.find((campo) => errores[campo]);
    if (primero) {
      document.getElementById(`${id}-${primero}`)?.focus();
      return;
    }
    alEnviar({ datos: normalizarPersona(valores), foto, eliminarFoto: !foto && eliminarFoto });
  };

  const campo = (nombre: CampoConError) => {
    const error = errorDe(nombre);
    return {
      id: `${id}-${nombre}`,
      name: nombre,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `${id}-${nombre}-error` : undefined,
    };
  };
  const texto = (nombre: CampoPersona) => ({
    ...campo(nombre),
    value: valores[nombre],
    onChange: (e: { target: { value: string } }) => cambiar(nombre, e.target.value),
    onBlur: () => tocar(nombre),
  });
  const mensaje = (nombre: CampoConError) => {
    const error = errorDe(nombre);
    return error ? (
      <span className="error-campo" id={`${id}-${nombre}-error`} data-error={nombre}>
        {error}
      </span>
    ) : null;
  };

  const vistaFoto = vistaFotoNueva ?? (eliminarFoto ? null : fotoActual);
  const fechaIso = parsearFecha(valores.fechaNacimiento) ?? '';

  return (
    <form className="formulario-persona" onSubmit={enviar} noValidate data-modo={modo}>
      <fieldset disabled={ocupado}>
        <div className="identificacion">
          <div className="campos">
            <Campo etiqueta="Tipo de documento" para={`${id}-tipoDocumento`} obligatorio>
              <select {...texto('tipoDocumento')}>
                <option value="">Elige una opción</option>
                {TIPOS_DOCUMENTO.map((tipo) => (
                  <option key={tipo}>{tipo}</option>
                ))}
              </select>
              {mensaje('tipoDocumento')}
            </Campo>

            <Campo etiqueta="Nro. Documento" para={`${id}-numeroDocumento`} obligatorio={modo === 'crear'}>
              {modo === 'crear' ? (
                <input {...texto('numeroDocumento')} inputMode="numeric" maxLength={LONGITUD.numeroDocumento} autoComplete="off" />
              ) : (
                <input {...campo('numeroDocumento')} value={valores.numeroDocumento} readOnly aria-readonly="true" />
              )}
              {modo === 'modificar' && <span className="ayuda">El número de documento no se puede cambiar.</span>}
              {mensaje('numeroDocumento')}
            </Campo>

            <Campo etiqueta="Primer nombre" para={`${id}-primerNombre`} obligatorio>
              <input {...texto('primerNombre')} maxLength={LONGITUD.nombre} autoComplete="off" />
              {mensaje('primerNombre')}
            </Campo>

            <Campo etiqueta="Segundo nombre" para={`${id}-segundoNombre`}>
              <input {...texto('segundoNombre')} maxLength={LONGITUD.nombre} autoComplete="off" />
              {mensaje('segundoNombre')}
            </Campo>

            <Campo etiqueta="Apellidos" para={`${id}-apellidos`} obligatorio ancho>
              <input {...texto('apellidos')} maxLength={LONGITUD.apellidos} autoComplete="off" />
              {mensaje('apellidos')}
            </Campo>

            <Campo etiqueta="Fecha de nacimiento" para={`${id}-fechaNacimiento`} obligatorio>
              <div className="fecha">
                <input {...texto('fechaNacimiento')} placeholder="dd-mmm-aaaa" autoComplete="off" />
                <input
                  type="date"
                  className="calendario"
                  aria-label="Elegir la fecha de nacimiento en el calendario"
                  title="Elegir en el calendario"
                  max={hoyIso()}
                  value={fechaIso}
                  onChange={(e) => {
                    cambiar('fechaNacimiento', e.target.value ? formatearFecha(e.target.value) : '');
                    tocar('fechaNacimiento');
                  }}
                />
              </div>
              <span className="ayuda">Elígela en el calendario o escríbela, por ejemplo 05-mar-2001.</span>
              {mensaje('fechaNacimiento')}
            </Campo>

            <Campo etiqueta="Género" para={`${id}-genero`} obligatorio>
              <select {...texto('genero')}>
                <option value="">Elige una opción</option>
                {GENEROS.map((genero) => (
                  <option key={genero}>{genero}</option>
                ))}
              </select>
              {mensaje('genero')}
            </Campo>
          </div>

          <div className="foto">
            <span className="etiqueta">Foto</span>
            <div className="marco-foto">
              {vistaFoto ? <img src={vistaFoto} alt="Foto de la persona" /> : <span className="sin-foto">Sin foto</span>}
            </div>
            <label className="boton secundario elegir-foto" htmlFor={`${id}-foto`}>
              {vistaFoto ? 'Cambiar foto' : 'Elegir foto'}
            </label>
            <input
              {...campo('foto')}
              className="archivo-oculto"
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => {
                elegirFoto(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            {foto && (
              <button type="button" className="enlace" onClick={() => elegirFoto(null)}>
                No usar la foto elegida
              </button>
            )}
            {modo === 'modificar' && fotoActual && !foto && (
              <label className="casilla">
                <input type="checkbox" checked={eliminarFoto} onChange={(e) => setEliminarFoto(e.target.checked)} />
                Quitar la foto actual
              </label>
            )}
            <span className="ayuda">JPG o PNG, máximo 2 MB. Opcional.</span>
            {mensaje('foto')}
          </div>
        </div>

        <hr />

        <div className="contacto">
          <Campo etiqueta="Correo electrónico" para={`${id}-correo`} obligatorio>
            <input {...texto('correo')} type="email" maxLength={LONGITUD.correo} autoComplete="off" />
            {mensaje('correo')}
          </Campo>

          <Campo etiqueta="Celular" para={`${id}-celular`} obligatorio>
            <input {...texto('celular')} inputMode="numeric" maxLength={LONGITUD.celular} autoComplete="off" />
            {mensaje('celular')}
          </Campo>
        </div>

        <div className="acciones">
          <button type="submit" className="boton">
            {ocupado ? 'Guardando…' : textoBoton}
          </button>
          {acciones}
        </div>
      </fieldset>
    </form>
  );
}

function Campo({
  etiqueta,
  para,
  obligatorio = false,
  ancho = false,
  children,
}: {
  etiqueta: string;
  para: string;
  obligatorio?: boolean;
  ancho?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={ancho ? 'campo ancho' : 'campo'}>
      <label htmlFor={para}>
        {etiqueta}
        {obligatorio && (
          <span className="obligatorio" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
