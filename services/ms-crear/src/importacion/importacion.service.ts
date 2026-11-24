import { BadRequestException, ConflictException, HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, In } from 'typeorm';
import {
  aErroresDeCampo,
  AuditoriaService,
  CrearPersonaDto,
  errorDeCampos,
  FotoValidada,
  Persona,
  ResultadoTransaccion,
  TipoTransaccion,
  UsuarioAutenticado,
  validarFoto,
} from '@gdp/common';
import { PersonasService } from '../personas.service';
import { ArchivoRecibido, FotoRecibida, leerDatos, leerFotos, nombreBase } from './archivos';
import { Campo, columnasFaltantes, leerFila, mapearColumnas, NOMBRE_DEL_CAMPO } from './columnas';

export type EstadoFila = 'lista' | 'creada' | 'existe' | 'invalida' | 'error';

export interface FilaImportada {
  /** Línea del archivo (la 1 es el encabezado). */
  linea: number;
  numeroDocumento: string;
  nombre: string;
  estado: EstadoFila;
  /** Por qué no se carga, con los mismos mensajes del formulario. */
  motivos: string[];
  /** Foto que le corresponde y si se pudo usar. */
  foto: { archivo: string; usada: boolean; motivo?: string } | null;
}

export interface ResultadoImportacion {
  archivo: string;
  columnas: { encabezado: string; campo: string }[];
  ignoradas: string[];
  fotosRecibidas: string[];
  filas: FilaImportada[];
  resumen: { total: number; listas: number; creadas: number; existentes: number; invalidas: number; conFoto: number };
}

interface Preparada {
  fila: FilaImportada;
  dto: CrearPersonaDto;
  foto: FotoValidada | null;
}

const MENSAJE_EXISTE = 'Ya hay una persona registrada con ese número de documento';
const DOCUMENTO_VALIDO = /^[0-9]{1,10}$/;

/**
 * Importación de personas desde un Excel o CSV y sus fotos (T30). Cada persona se crea con
 * PersonasService.crear, igual que desde el formulario: mismas validaciones, su CREAR en el log en la
 * misma transacción y el aviso a n8n para indexarla. Las filas que no se pueden crear quedan en el
 * log como CREAR con resultado ERROR, igual que un formulario rechazado.
 */
@Injectable()
export class ImportacionService {
  private readonly logger = new Logger(ImportacionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly personas: PersonasService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Revisa los archivos sin crear nada: qué columnas reconoció y qué pasará con cada fila. */
  async revisar(datos: ArchivoRecibido | undefined, fotos: ArchivoRecibido[]): Promise<ResultadoImportacion> {
    return (await this.analizar(datos, fotos)).resultado;
  }

  /** Crea las personas válidas que no existen y devuelve qué pasó con cada fila. */
  async importar(
    datos: ArchivoRecibido | undefined,
    fotos: ArchivoRecibido[],
    usuario: UsuarioAutenticado,
  ): Promise<ResultadoImportacion> {
    const { resultado, preparadas } = await this.analizar(datos, fotos);

    for (const p of preparadas) {
      try {
        await this.personas.crear(p.dto, p.foto, usuario);
        p.fila.estado = 'creada';
      } catch (error) {
        const conflicto = error instanceof ConflictException;
        p.fila.estado = conflicto ? 'existe' : 'error';
        p.fila.motivos = [conflicto ? MENSAJE_EXISTE : 'No se pudo guardar. Intenta de nuevo'];
        if (!conflicto) this.logger.error(`Línea ${p.fila.linea}: ${(error as Error).message}`);
      }
    }

    for (const fila of resultado.filas.filter((f) => f.estado !== 'creada')) {
      await this.auditoria.registrarAparte({
        tipo: TipoTransaccion.CREAR,
        numeroDocumento: DOCUMENTO_VALIDO.test(fila.numeroDocumento) ? fila.numeroDocumento : null,
        usuario: usuario.nombre,
        resultado: ResultadoTransaccion.ERROR,
        detalle: {
          contexto: `Importación desde ${resultado.archivo}, línea ${fila.linea}`,
          motivo: fila.motivos.join('; '),
          ...(DOCUMENTO_VALIDO.test(fila.numeroDocumento) ? {} : { documentoRecibido: fila.numeroDocumento.slice(0, 50) }),
        },
      });
    }

    resultado.resumen = resumir(resultado.filas);
    return resultado;
  }

  private async analizar(
    datos: ArchivoRecibido | undefined,
    archivosFotos: ArchivoRecibido[],
  ): Promise<{ resultado: ResultadoImportacion; preparadas: Preparada[] }> {
    if (!datos) throw errorDeCampos([{ campo: 'datos', mensaje: 'Elige el archivo de Excel o CSV con las personas' }]);
    const archivo = nombreDeArchivo(datos.originalname);

    let filas: string[][];
    let fotos: Map<string, FotoRecibida>;
    try {
      filas = leerDatos(datos);
    } catch (error) {
      throw errorDeCampos([{ campo: 'datos', mensaje: `No se pudo leer ${archivo}: ${(error as Error).message}` }]);
    }
    try {
      fotos = leerFotos(archivosFotos.map((a) => ({ ...a, originalname: nombreDeArchivo(a.originalname) })));
    } catch (error) {
      throw errorDeCampos([{ campo: 'fotos', mensaje: `No se pudieron leer las fotos: ${(error as Error).message}` }]);
    }
    if (filas.length < 2) throw errorDeCampos([{ campo: 'datos', mensaje: `${archivo} no tiene personas` }]);

    const [encabezado, ...cuerpo] = filas;
    const { mapa, ignoradas } = mapearColumnas(encabezado);
    const faltan = columnasFaltantes(mapa);
    if (faltan.length > 0) {
      throw errorDeCampos([
        {
          campo: 'datos',
          mensaje: `No se encontraron las columnas: ${faltan.join(', ')}. La primera fila debe tener los nombres de las columnas`,
        },
      ]);
    }

    const leidas = cuerpo.map((fila, i) => ({ linea: i + 2, datos: leerFila(fila, mapa) }));
    const documentos = leidas.map((l) => l.datos.numeroDocumento).filter((d) => DOCUMENTO_VALIDO.test(d));
    const existentes = new Set(
      documentos.length === 0
        ? []
        : (
            await this.dataSource.getRepository(Persona).find({
              select: { numeroDocumento: true },
              where: { numeroDocumento: In(documentos) },
            })
          ).map((p) => p.numeroDocumento),
    );

    const vistos = new Set<string>();
    const preparadas: Preparada[] = [];
    const resultadoFilas: FilaImportada[] = [];
    for (const { linea, datos: d } of leidas) {
      const { foto: archivoFoto, ...campos } = d;
      const dto = plainToInstance(CrearPersonaDto, campos);
      const motivos = aErroresDeCampo(await validate(dto)).map((e) => e.mensaje);
      const fila: FilaImportada = {
        linea,
        numeroDocumento: d.numeroDocumento,
        nombre: [d.primerNombre, d.segundoNombre, d.apellidos].filter(Boolean).join(' '),
        estado: 'lista',
        motivos,
        foto: null,
      };

      let foto: FotoValidada | null = null;
      if (archivoFoto) {
        const recibida = fotos.get(nombreBase(archivoFoto).toLowerCase());
        if (!recibida) fila.foto = { archivo: archivoFoto, usada: false, motivo: 'No está entre las fotos subidas' };
        else {
          try {
            foto = validarFoto({ buffer: recibida.bytes });
            fila.foto = { archivo: recibida.nombre, usada: foto !== null };
          } catch (error) {
            fila.foto = { archivo: recibida.nombre, usada: false, motivo: mensajeDeFoto(error) };
          }
        }
      }

      if (motivos.length > 0) fila.estado = 'invalida';
      else if (vistos.has(dto.numeroDocumento)) {
        fila.estado = 'invalida';
        fila.motivos = ['El número de documento está repetido en el archivo'];
      } else if (existentes.has(dto.numeroDocumento)) {
        fila.estado = 'existe';
        fila.motivos = [MENSAJE_EXISTE];
      }
      if (fila.estado !== 'invalida') vistos.add(dto.numeroDocumento);
      if (fila.estado === 'lista') preparadas.push({ fila, dto, foto });
      resultadoFilas.push(fila);
    }

    const columnas = (Object.entries(mapa) as [Campo, number][]).map(([campo, i]) => ({
      encabezado: String(encabezado[i]).trim(),
      campo: NOMBRE_DEL_CAMPO[campo],
    }));
    return {
      resultado: {
        archivo,
        columnas,
        ignoradas,
        fotosRecibidas: [...fotos.values()].map((f) => f.nombre),
        filas: resultadoFilas,
        resumen: resumir(resultadoFilas),
      },
      preparadas,
    };
  }
}

function resumir(filas: FilaImportada[]): ResultadoImportacion['resumen'] {
  const cuenta = (e: EstadoFila) => filas.filter((f) => f.estado === e).length;
  return {
    total: filas.length,
    listas: cuenta('lista'),
    creadas: cuenta('creada'),
    existentes: cuenta('existe'),
    invalidas: cuenta('invalida') + cuenta('error'),
    conFoto: filas.filter((f) => (f.estado === 'lista' || f.estado === 'creada') && f.foto?.usada).length,
  };
}

function mensajeDeFoto(error: unknown): string {
  if (error instanceof HttpException) {
    const r = error.getResponse() as { errores?: { mensaje: string }[] };
    if (r.errores?.[0]) return r.errores[0].mensaje;
  }
  if (error instanceof BadRequestException) return error.message;
  return 'La foto no es válida';
}

/** Multer entrega el nombre en latin1; los nombres con tildes llegan en UTF-8. */
function nombreDeArchivo(nombre: string): string {
  const utf8 = Buffer.from(nombre, 'latin1').toString('utf8');
  return utf8.includes('�') ? nombre : utf8;
}
