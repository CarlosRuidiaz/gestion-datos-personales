// Pruebas del conversor de CSV (T28). Se ejecutan con: node --test database/
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  celular, decodificar, documento, fecha, generarSql, genero, leerCsv, procesar, tipoDocumento,
} from './datos-profesor-csv.mjs';

const HOY = '2026-11-23';

describe('valores', () => {
  it('tipo de documento', () => {
    for (const v of ['CC', 'C.C.', 'cédula', 'Cedula de ciudadania', 'Cédula']) assert.equal(tipoDocumento(v), 'Cédula');
    for (const v of ['TI', 'T.I', 'tarjeta de identidad']) assert.equal(tipoDocumento(v), 'Tarjeta de identidad');
    assert.equal(tipoDocumento('Pasaporte'), null);
  });

  it('género', () => {
    assert.equal(genero('M'), 'Masculino');
    assert.equal(genero('mujer'), 'Femenino');
    assert.equal(genero('No Binario'), 'No binario');
    assert.equal(genero('Prefiero no reportar'), 'Prefiero no reportar');
    assert.equal(genero('X'), null);
  });

  it('fechas en los formatos comunes, leyendo día/mes/año', () => {
    assert.equal(fecha('2003-03-05'), '2003-03-05');
    assert.equal(fecha('05/03/2003'), '2003-03-05');
    assert.equal(fecha('5-3-2003'), '2003-03-05');
    assert.equal(fecha('05-mar-2003'), '2003-03-05');
    assert.equal(fecha('5 marzo 2003'), '2003-03-05');
    assert.equal(fecha('05/03/2003 0:00'), '2003-03-05');
    assert.equal(fecha('37685'), '2003-03-05'); // número de serie de Excel
    assert.equal(fecha('31/02/2003'), null);
    assert.equal(fecha('ayer'), null);
  });

  it('documento y celular sin adornos', () => {
    assert.equal(documento('1.043.123.456'), '1043123456');
    assert.equal(celular('+57 300 123 4567'), '3001234567');
    assert.equal(celular('(300) 123-4567'), '3001234567');
  });
});

describe('lectura del archivo', () => {
  it('detecta punto y coma y respeta comillas', () => {
    const { separador, filas } = leerCsv('a;b\n"x;1";"di ""hola"""\r\n\n');
    assert.equal(separador, ';');
    assert.deepEqual(filas, [['a', 'b'], ['x;1', 'di "hola"']]);
  });

  it('lee Windows-1252 (Excel en español) y quita el BOM de UTF-8', () => {
    assert.equal(decodificar(Buffer.from([0x43, 0xe9, 0x64, 0x75, 0x6c, 0x61])), 'Cédula');
    assert.equal(decodificar(Buffer.from('﻿hola', 'utf8')), 'hola');
  });
});

describe('procesar', () => {
  const csv = [
    'Tipo Doc;No. Identificación;Nombres;Primer Apellido;Segundo Apellido;Fecha Nacimiento;Sexo;E-mail;Teléfono;Foto',
    'CC;1.043.123.456;Pedro Andrés;Pérez;Gómez;05/03/2003;M;Pedro.Perez@example.com;300 123 4567;pedro.jpg',
    'TI;1201234567;Juliana;Mora;;14/06/2009;F;juliana@example.com;3178901234;',
    'CC;22345678;Rosa Maximilianoooooooooooooooooooooo;Fontalvo;;30/01/1962;F;rosa@example.com;3167890123;',
    'CC;1043123456;Repetido;Pérez;;05/03/2003;M;otro@example.com;3001234567;',
    'CC;123;Ana;Barrios;;21/04/2090;Z;sin-arroba;300;',
  ].join('\n');

  it('reconoce los encabezados, combina nombres y apellidos y normaliza los valores', () => {
    const r = procesar(csv, HOY);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.ignoradas, ['Foto']);
    assert.equal(r.validas.length, 2);
    const [pedro, juliana] = r.validas;
    assert.equal(pedro.tipoDocumento, 'Cédula');
    assert.equal(pedro.numeroDocumento, '1043123456');
    assert.equal(pedro.primerNombre, 'Pedro');
    assert.equal(pedro.segundoNombre, 'Andrés');
    assert.equal(pedro.apellidos, 'Pérez Gómez');
    assert.equal(pedro.fechaNacimiento, '2003-03-05');
    assert.equal(pedro.genero, 'Masculino');
    assert.equal(pedro.correo, 'pedro.perez@example.com');
    assert.equal(pedro.celular, '3001234567');
    assert.equal(juliana.tipoDocumento, 'Tarjeta de identidad');
    assert.equal(juliana.segundoNombre, '');
    assert.equal(juliana.apellidos, 'Mora');
  });

  it('deja fuera las filas inválidas o repetidas, con el motivo', () => {
    const { fuera } = procesar(csv, HOY);
    assert.equal(fuera.length, 3);
    assert.equal(fuera[0].linea, 4);
    assert.match(fuera[0].motivos.join(), /segundo nombre tiene más de 30 caracteres/);
    assert.match(fuera[1].motivos.join(), /documento repetido/);
    const motivos = fuera[2].motivos.join(' | ');
    for (const m of ['fecha de nacimiento es futura', 'género no reconocido', 'correo inválido', 'celular inválido']) {
      assert.ok(motivos.includes(m), m);
    }
  });

  it('avisa qué columnas faltan', () => {
    const r = procesar('Documento,Nombre completo,Correo\n1,Ana,a@b.co\n', HOY);
    assert.match(r.error, /primer nombre/);
    assert.match(r.error, /celular/);
  });

  it('genera SQL con las comillas escapadas y NULL en el segundo nombre vacío', () => {
    const r = procesar('Tipo,Documento,Primer nombre,Segundo nombre,Apellidos,Fecha,Género,Correo,Celular\nCC,1,Ana,,O\'Neil,2000-01-01,F,a@b.co,3000000000\n', HOY);
    const salida = generarSql(r.validas);
    assert.ok(salida.includes(`('1', 'Cédula', 'Ana', NULL, 'O''Neil', DATE '2000-01-01', 'Femenino', 'a@b.co', '3000000000')`));
    assert.ok(salida.includes("'datos-profesor'"));
  });
});
