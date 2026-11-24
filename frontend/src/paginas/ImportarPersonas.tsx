import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorApi, pedirApi } from '../api/cliente';
import { Alerta } from '../componentes/Alerta';

/** Respuesta de ms-crear al revisar o importar (POST /api/crear/personas/importacion[/revision]). */
export interface ResultadoImportacion {
  archivo: string;
  columnas: { encabezado: string; campo: string }[];
  ignoradas: string[];
  fotosRecibidas: string[];
  filas: {
    linea: number;
    numeroDocumento: string;
    nombre: string;
    estado: 'lista' | 'creada' | 'existe' | 'invalida' | 'error';
    motivos: string[];
    foto: { archivo: string; usada: boolean; motivo?: string } | null;
  }[];
  resumen: { total: number; listas: number; creadas: number; existentes: number; invalidas: number; conFoto: number };
}

const RUTA = '/api/crear/personas/importacion';

const ESTADO: Record<ResultadoImportacion['filas'][number]['estado'], { texto: string; clase: 'exito' | 'error' }> = {
  lista: { texto: 'Lista para crear', clase: 'exito' },
  creada: { texto: 'Creada', clase: 'exito' },
  existe: { texto: 'Ya estaba registrada', clase: 'error' },
  invalida: { texto: 'No se crea', clase: 'error' },
  error: { texto: 'No se pudo crear', clase: 'error' },
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Importar personas desde un archivo (T30), parte de la opción Crear y solo para el administrador.
 * Primero se revisa el archivo sin guardar nada; al confirmar, ms-crear crea cada persona igual que
 * desde el formulario, con su registro en el log.
 */
export function ImportarPersonas() {
  const [datos, setDatos] = useState<File | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [revision, setRevision] = useState<ResultadoImportacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [ocupado, setOcupado] = useState<'revisando' | 'creando' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const cuerpo = () => {
    const formulario = new FormData();
    if (datos) formulario.append('datos', datos);
    for (const foto of fotos) formulario.append('fotos', foto);
    return formulario;
  };

  async function enviar(paso: 'revisando' | 'creando') {
    setOcupado(paso);
    setError(null);
    try {
      const respuesta = await pedirApi<ResultadoImportacion>(paso === 'revisando' ? `${RUTA}/revision` : RUTA, {
        method: 'POST',
        body: cuerpo(),
      });
      if (paso === 'revisando') setRevision(respuesta);
      else setResultado(respuesta);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(null);
    }
  }

  function revisar(evento: FormEvent) {
    evento.preventDefault();
    if (!datos) {
      setError('Elige el archivo de Excel o CSV con las personas.');
      return;
    }
    void enviar('revisando');
  }

  function empezarDeNuevo() {
    setDatos(null);
    setFotos([]);
    setRevision(null);
    setResultado(null);
    setError(null);
    setVersion((v) => v + 1);
  }

  if (resultado) {
    const { creadas, existentes, invalidas } = resultado.resumen;
    return (
      <section className="pantalla importacion">
        <h1>Importar personas</h1>
        <Alerta tipo={creadas > 0 ? 'exito' : 'error'}>
          <strong>{creadas > 0 ? `Se crearon ${plural(creadas, 'persona', 'personas')}.` : 'No se creó ninguna persona.'}</strong>{' '}
          {existentes > 0 && `${plural(existentes, 'ya estaba registrada', 'ya estaban registradas')}. `}
          {invalidas > 0 && `${plural(invalidas, 'fila tiene errores', 'filas tienen errores')} y no se creó. `}
          Cada intento quedó en el log.
        </Alerta>
        <TablaFilas filas={resultado.filas} />
        <div className="acciones">
          <Link to="/log" className="boton">
            Ver el log
          </Link>
          <button type="button" className="boton secundario" onClick={empezarDeNuevo}>
            Importar otro archivo
          </button>
          <Link to="/" className="boton secundario">
            Volver al menú
          </Link>
        </div>
      </section>
    );
  }

  if (revision) {
    const { listas, conFoto, existentes, invalidas } = revision.resumen;
    return (
      <section className="pantalla importacion">
        <h1>Importar personas</h1>
        <p className="nota">
          Revisión de <strong>{revision.archivo}</strong>. Todavía no se ha guardado nada.
        </p>
        {error && <Alerta tipo="error">{error}</Alerta>}
        <ul className="resumen-importacion" data-resumen="revision">
          <li>
            <strong>{plural(listas, 'persona lista', 'personas listas')}</strong> para crear ({conFoto} con foto)
          </li>
          {existentes > 0 && <li>{plural(existentes, 'ya está registrada', 'ya están registradas')}: no se vuelven a crear</li>}
          {invalidas > 0 && <li>{plural(invalidas, 'fila con errores', 'filas con errores')}: no se crean</li>}
        </ul>
        <details className="columnas-importacion">
          <summary>Columnas y fotos reconocidas</summary>
          <ul>
            {revision.columnas.map((c) => (
              <li key={c.campo}>
                «{c.encabezado}» → {c.campo}
              </li>
            ))}
            {revision.ignoradas.length > 0 && <li>No se usan: {revision.ignoradas.map((c) => `«${c}»`).join(', ')}</li>}
            <li>
              Fotos recibidas: {revision.fotosRecibidas.length > 0 ? revision.fotosRecibidas.join(', ') : 'ninguna'}
            </li>
          </ul>
        </details>
        <TablaFilas filas={revision.filas} />
        <div className="acciones">
          <button type="button" className="boton" disabled={listas === 0 || ocupado !== null} onClick={() => void enviar('creando')}>
            {ocupado === 'creando' ? 'Creando…' : `Crear ${plural(listas, 'persona', 'personas')}`}
          </button>
          <button type="button" className="boton secundario" onClick={empezarDeNuevo} disabled={ocupado !== null}>
            Elegir otros archivos
          </button>
          <Link to="/crear" className="boton secundario">
            Cancelar
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="pantalla importacion">
      <h1>Importar personas</h1>
      <p className="nota">
        Sube el Excel (.xlsx) o CSV con una fila por persona y, si las tiene, las fotos: el .zip o las imágenes. La
        columna «Foto» del archivo dice qué imagen le corresponde a cada persona. Primero se revisa el archivo y no se
        guarda nada hasta que lo confirmes.
      </p>
      {error && <Alerta tipo="error">{error}</Alerta>}
      <form className="formulario-importacion" onSubmit={revisar} key={version} noValidate>
        <div className="campo ancho">
          <label htmlFor="importar-datos">
            Archivo con las personas <span className="obligatorio">*</span>
          </label>
          <input
            id="importar-datos"
            name="datos"
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setDatos(e.target.files?.[0] ?? null)}
          />
          <span className="ayuda">Excel (.xlsx) o CSV. La primera fila debe tener los nombres de las columnas.</span>
        </div>
        <div className="campo ancho">
          <label htmlFor="importar-fotos">Fotos</label>
          <input
            id="importar-fotos"
            name="fotos"
            type="file"
            accept=".zip,.jpg,.jpeg,.png"
            multiple
            onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
          />
          <span className="ayuda">Opcional. Un .zip con las fotos o las imágenes (JPG o PNG, máximo 2 MB cada una).</span>
        </div>
        <div className="acciones">
          <button type="submit" className="boton" disabled={ocupado !== null}>
            {ocupado === 'revisando' ? 'Revisando…' : 'Revisar archivo'}
          </button>
          <Link to="/crear" className="boton secundario">
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  );
}

function TablaFilas({ filas }: { filas: ResultadoImportacion['filas'] }) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla-log tabla-importacion">
        <thead>
          <tr>
            <th scope="col">Línea</th>
            <th scope="col">Documento</th>
            <th scope="col">Nombre</th>
            <th scope="col">Estado</th>
            <th scope="col">Foto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.linea} data-estado={f.estado}>
              <td>{f.linea}</td>
              <td className="nowrap">{f.numeroDocumento}</td>
              <td className="partible">{f.nombre}</td>
              <td>
                <span className={`resultado ${ESTADO[f.estado].clase}`}>{ESTADO[f.estado].texto}</span>
                {f.motivos.length > 0 && (
                  <ul className="motivos">
                    {f.motivos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="partible">
                {!f.foto ? (
                  'Sin foto'
                ) : f.foto.usada ? (
                  f.foto.archivo
                ) : (
                  <span className="aviso-foto">
                    {f.foto.archivo}: {f.foto.motivo}. Se crea sin foto
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi) return e.errores[0]?.mensaje ?? e.message;
  return 'No se pudo conectar con el servidor. Intenta de nuevo.';
}
