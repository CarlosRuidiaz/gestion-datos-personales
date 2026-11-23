import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { rutaDelLog, SIN_FILTROS, totalDePaginas, validarFiltros, type RegistroLog } from './consulta';
import { fechaHoraLocal, resumenDetalle } from './formato';
import { TablaLog } from './TablaLog';

const registro = (cambios: Partial<RegistroLog>): RegistroLog => ({
  id: '1',
  fechaHora: '2026-11-22T20:42:10.000Z',
  tipo: 'CREAR',
  numeroDocumento: '1043123456',
  usuario: 'admin.prueba',
  resultado: 'EXITO',
  detalle: null,
  pregunta: null,
  respuesta: null,
  ...cambios,
});

describe('filtros del log (CP-06)', () => {
  it('sin filtros pide solo la página y el tamaño', () => {
    expect(rutaDelLog(SIN_FILTROS, 1)).toBe('/api/log?pagina=1&tamano=20');
  });

  it('combina tipo, documento y fechas, y omite los vacíos', () => {
    expect(rutaDelLog({ tipo: 'BORRAR', documento: ' 1043123456 ', desde: '2026-11-01', hasta: '' }, 3)).toBe(
      '/api/log?tipo=BORRAR&documento=1043123456&desde=2026-11-01&pagina=3&tamano=20',
    );
  });

  it('valida el documento y el orden de las fechas', () => {
    expect(validarFiltros(SIN_FILTROS)).toEqual({});
    expect(validarFiltros({ ...SIN_FILTROS, documento: '12a' }).documento).toBe(
      'El número de documento debe tener solo dígitos y máximo 10 caracteres',
    );
    expect(validarFiltros({ ...SIN_FILTROS, desde: '2026-11-20', hasta: '2026-11-19' }).hasta).toBe(
      'La fecha final no puede ser anterior a la inicial',
    );
    expect(validarFiltros({ ...SIN_FILTROS, desde: '2026-11-20', hasta: '2026-11-20' })).toEqual({});
  });

  it('cuenta las páginas', () => {
    expect(totalDePaginas(0, 20)).toBe(1);
    expect(totalDePaginas(20, 20)).toBe(1);
    expect(totalDePaginas(21, 20)).toBe(2);
  });
});

describe('formato del log', () => {
  it('muestra la fecha y hora en hora de Bogotá, como dd-mmm-yyyy', () => {
    expect(fechaHoraLocal('2026-11-22T20:42:10.000Z')).toBe('22-nov-2026 15:42:10');
    // A las 2 de la mañana en UTC todavía es el día anterior en Bogotá.
    expect(fechaHoraLocal('2026-03-01T02:05:00Z')).toBe('28-feb-2026 21:05:00');
  });

  it('una modificación muestra el valor anterior y el nuevo de cada campo', () => {
    const lineas = resumenDetalle(
      registro({
        tipo: 'MODIFICAR',
        detalle: {
          anterior: { correo: 'a@ejemplo.com', segundoNombre: null },
          nuevo: { correo: 'b@ejemplo.com', segundoNombre: 'Lucía' },
          foto: 'reemplazada',
        },
      }),
    );
    expect(lineas).toEqual(['Correo: a@ejemplo.com → b@ejemplo.com', 'Segundo nombre: (vacío) → Lucía', 'Foto reemplazada']);
  });

  it('un borrado muestra los datos que tenía la persona (CP-05)', () => {
    const lineas = resumenDetalle(
      registro({
        tipo: 'BORRAR',
        detalle: {
          anterior: { apellidos: 'Rojas', numeroDocumento: '9999999981', primerNombre: 'Marta', fechaNacimiento: '1995-08-12', tieneFoto: false },
          teniaFoto: false,
        },
      }),
    );
    // En el orden del formulario, sin repetir el documento ni la foto.
    expect(lineas).toEqual(['Datos que tenía: Primer nombre: Marta · Apellidos: Rojas · Fecha de nacimiento: 12-ago-1995', 'No tenía foto']);
  });

  it('una creación muestra los datos registrados', () => {
    expect(resumenDetalle(registro({ detalle: { nuevo: { primerNombre: 'Pedro', tieneFoto: true } } }))).toEqual([
      'Datos registrados: Primer nombre: Pedro',
      'Con foto',
    ]);
  });

  it('un rechazo muestra el código, el motivo, los errores de campo y el contexto', () => {
    const lineas = resumenDetalle(
      registro({
        tipo: 'CONSULTAR',
        resultado: 'ERROR',
        detalle: {
          estado: 400,
          motivo: 'Hay campos con errores',
          errores: [{ campo: 'correo', mensaje: 'El correo electrónico no tiene un formato válido' }],
          contexto: 'Búsqueda previa a una modificación',
        },
      }),
    );
    expect(lineas).toEqual([
      'Error 400: Hay campos con errores',
      'El correo electrónico no tiene un formato válido',
      'Búsqueda previa a una modificación',
    ]);
  });

  it('una consulta en lenguaje natural muestra la pregunta y la respuesta', () => {
    const lineas = resumenDetalle(
      registro({ tipo: 'CONSULTA_NL', numeroDocumento: null, usuario: 'n8n', pregunta: '¿Quién es el más joven?', respuesta: 'Ana Torres' }),
    );
    expect(lineas).toEqual(['Pregunta: ¿Quién es el más joven?', 'Respuesta: Ana Torres']);
  });
});

describe('tabla del log', () => {
  it('dibuja cada registro con sus columnas, el resultado y el detalle completo', () => {
    const html = renderToStaticMarkup(
      <TablaLog
        registros={[
          registro({ id: '7', detalle: { nuevo: { primerNombre: 'Pedro' } } }),
          registro({ id: '8', tipo: 'CONSULTA_NL', numeroDocumento: null, usuario: 'n8n', resultado: 'ERROR' }),
        ]}
      />,
    );
    expect(html).toContain('data-registro="7"');
    expect(html).toContain('22-nov-2026 15:42:10');
    expect(html).toContain('<td>Crear</td>');
    expect(html).toContain('<td>Consulta en lenguaje natural</td>');
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('class="resultado exito">Éxito');
    expect(html).toContain('class="resultado error">Error');
    expect(html).toContain('Ver detalle completo');
  });
});
