import { NOMBRE_TIPO, type RegistroLog, type TipoLog } from './consulta';
import { fechaHoraLocal, resumenDetalle, tieneDetalle } from './formato';

/** Tabla de transacciones del log, de la más reciente a la más antigua (sección 8.2 del diseño). */
export function TablaLog({ registros }: { registros: RegistroLog[] }) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla-log">
        <thead>
          <tr>
            <th scope="col">Fecha y hora</th>
            <th scope="col">Tipo</th>
            <th scope="col">Documento</th>
            <th scope="col">Usuario</th>
            <th scope="col">Resultado</th>
            <th scope="col">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((registro) => {
            const lineas = resumenDetalle(registro);
            return (
              <tr key={registro.id} data-registro={registro.id}>
                <td className="nowrap">{fechaHoraLocal(registro.fechaHora)}</td>
                <td>{NOMBRE_TIPO[registro.tipo as TipoLog] ?? registro.tipo}</td>
                <td>{registro.numeroDocumento ?? '—'}</td>
                <td>{registro.usuario}</td>
                <td>
                  <span className={`resultado ${registro.resultado === 'EXITO' ? 'exito' : 'error'}`}>
                    {registro.resultado === 'EXITO' ? 'Éxito' : 'Error'}
                  </span>
                </td>
                <td className="detalle">
                  {lineas.length > 0 && (
                    <ul>
                      {lineas.map((linea, i) => (
                        <li key={i}>{linea}</li>
                      ))}
                    </ul>
                  )}
                  {tieneDetalle(registro) && (
                    <details>
                      <summary>Ver detalle completo</summary>
                      <pre>{JSON.stringify(registro.detalle, null, 2)}</pre>
                    </details>
                  )}
                  {lineas.length === 0 && !tieneDetalle(registro) && <span className="vacio">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
