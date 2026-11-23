import { useEffect, useState, type FormEvent } from 'react';
import { ErrorApi, pedirApi } from '../api/cliente';
import { Alerta } from '../componentes/Alerta';
import {
  NOMBRE_TIPO,
  rutaDelLog,
  SIN_FILTROS,
  TIPOS_LOG,
  totalDePaginas,
  validarFiltros,
  type ErroresFiltros,
  type FiltrosLog,
  type PaginaLog,
} from '../log/consulta';
import { TablaLog } from '../log/TablaLog';
import { hoyIso } from '../persona/fecha';

/**
 * Consultar log (CU-07, CP-06), para los dos roles: filtros de tipo, documento y fechas, que se
 * combinan, sobre una tabla paginada. Al entrar muestra las transacciones más recientes.
 */
export function ConsultarLog() {
  const [borrador, setBorrador] = useState<FiltrosLog>(SIN_FILTROS);
  const [aplicados, setAplicados] = useState<FiltrosLog>(SIN_FILTROS);
  const [pagina, setPagina] = useState(1);
  // Sube en cada búsqueda, para volver a pedir el log aunque los filtros no cambien.
  const [consulta, setConsulta] = useState(0);
  const [datos, setDatos] = useState<PaginaLog | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [erroresFiltros, setErroresFiltros] = useState<ErroresFiltros>({});

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    pedirApi<PaginaLog>(rutaDelLog(aplicados, pagina))
      .then((respuesta) => {
        if (activo) setDatos(respuesta);
      })
      .catch((e: unknown) => {
        if (!activo) return;
        setDatos(null);
        if (e instanceof ErrorApi && e.estado === 400 && e.errores.length > 0) {
          setErroresFiltros(Object.fromEntries(e.errores.map(({ campo, mensaje }) => [campo, mensaje])));
          setError('Revisa los filtros marcados.');
        } else {
          setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar con el servidor. Intenta de nuevo.');
        }
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [aplicados, pagina, consulta]);

  function aplicar(filtros: FiltrosLog) {
    setAplicados({ ...filtros, documento: filtros.documento.trim() });
    setPagina(1);
    setConsulta((c) => c + 1);
  }

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    const errores = validarFiltros(borrador);
    setErroresFiltros(errores);
    if (Object.keys(errores).length > 0) return;
    aplicar(borrador);
  }

  function limpiar() {
    setBorrador(SIN_FILTROS);
    setErroresFiltros({});
    aplicar(SIN_FILTROS);
  }

  const cambiar = (campo: keyof FiltrosLog) => (e: { target: { value: string } }) => {
    setBorrador((previos) => ({ ...previos, [campo]: e.target.value }));
    setErroresFiltros(({ [campo]: _, ...resto }) => resto);
  };
  const ayudaError = (campo: keyof FiltrosLog) =>
    erroresFiltros[campo] ? (
      <span className="error-campo" id={`filtro-${campo}-error`} data-error={campo}>
        {erroresFiltros[campo]}
      </span>
    ) : null;
  const atributos = (campo: keyof FiltrosLog) => ({
    id: `filtro-${campo}`,
    name: campo,
    value: borrador[campo],
    onChange: cambiar(campo),
    'aria-invalid': erroresFiltros[campo] ? true : undefined,
    'aria-describedby': erroresFiltros[campo] ? `filtro-${campo}-error` : undefined,
  });

  const paginas = datos ? totalDePaginas(datos.total, datos.tamano) : 1;
  const hoy = hoyIso();

  return (
    <section className="pantalla ancha">
      <h1>Consultar log</h1>
      <form className="filtros-log" onSubmit={buscar} noValidate>
        <div className="campo">
          <label htmlFor="filtro-tipo">Tipo de transacción</label>
          <select {...atributos('tipo')}>
            <option value="">Todos</option>
            {TIPOS_LOG.map((tipo) => (
              <option key={tipo} value={tipo}>
                {NOMBRE_TIPO[tipo]}
              </option>
            ))}
          </select>
          {ayudaError('tipo')}
        </div>
        <div className="campo">
          <label htmlFor="filtro-documento">Número de documento</label>
          <input {...atributos('documento')} inputMode="numeric" maxLength={10} autoComplete="off" />
          {ayudaError('documento')}
        </div>
        <div className="campo">
          <label htmlFor="filtro-desde">Desde</label>
          <input {...atributos('desde')} type="date" max={borrador.hasta || hoy} />
          {ayudaError('desde')}
        </div>
        <div className="campo">
          <label htmlFor="filtro-hasta">Hasta</label>
          <input {...atributos('hasta')} type="date" min={borrador.desde || undefined} max={hoy} />
          {ayudaError('hasta')}
        </div>
        <div className="acciones-filtros">
          <button type="submit" className="boton" disabled={cargando}>
            Buscar
          </button>
          <button type="button" className="boton secundario" onClick={limpiar} disabled={cargando}>
            Limpiar filtros
          </button>
        </div>
      </form>

      {error && <Alerta tipo="error">{error}</Alerta>}

      <div aria-live="polite" aria-busy={cargando}>
        {cargando && !datos && <p className="nota">Cargando transacciones…</p>}
        {datos && datos.total === 0 && (
          <div className="aviso sin-resultados" data-sin-resultados>
            No hay transacciones que cumplan los filtros.
          </div>
        )}
        {datos && datos.total > 0 && (
          <>
            <p className="resumen-log">
              {datos.total === 1 ? '1 transacción' : `${datos.total} transacciones`} · Página {datos.pagina} de{' '}
              {paginas} · Hora de Bogotá
            </p>
            <TablaLog registros={datos.registros} />
            {paginas > 1 && (
              <nav className="paginacion" aria-label="Páginas del log">
                <button
                  type="button"
                  className="boton secundario"
                  onClick={() => setPagina((p) => p - 1)}
                  disabled={cargando || pagina <= 1}
                >
                  Anterior
                </button>
                <span>
                  Página {datos.pagina} de {paginas}
                </span>
                <button
                  type="button"
                  className="boton secundario"
                  onClick={() => setPagina((p) => p + 1)}
                  disabled={cargando || pagina >= paginas}
                >
                  Siguiente
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
