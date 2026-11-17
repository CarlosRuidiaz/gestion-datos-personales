import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Persona } from './persona.entity';

/**
 * Forma en que todos los servicios devuelven una persona. La foto nunca viaja como
 * bytes sueltos: o no se incluye (solo tieneFoto) o va lista para un <img src="...">.
 */
export class PersonaRespuesta {
  @ApiProperty({ example: '1043123456' })
  numeroDocumento: string;

  @ApiProperty({ example: 'Cédula' })
  tipoDocumento: string;

  @ApiProperty({ example: 'Pedro' })
  primerNombre: string;

  @ApiProperty({ example: 'Andrés', nullable: true })
  segundoNombre: string | null;

  @ApiProperty({ example: 'Pérez Gómez' })
  apellidos: string;

  @ApiProperty({ example: '2003-03-05', description: 'Siempre yyyy-mm-dd' })
  fechaNacimiento: string;

  @ApiProperty({ example: 'Masculino' })
  genero: string;

  @ApiProperty({ example: 'pedro.perez@example.com' })
  correo: string;

  @ApiProperty({ example: '3001234567' })
  celular: string;

  @ApiProperty()
  tieneFoto: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Solo en las respuestas que incluyen la foto: data:image/png;base64,... o null si no tiene',
  })
  foto?: string | null;

  @ApiProperty()
  fechaCreacion: Date;

  @ApiProperty()
  fechaActualizacion: Date;
}

/** Convierte la entidad en la respuesta de la API. Con incluirFoto, la foto va como data URL. */
export function aPersonaRespuesta(persona: Persona, opciones: { incluirFoto?: boolean } = {}): PersonaRespuesta {
  const tieneFoto = Boolean(persona.foto && persona.fotoTipo);
  const respuesta: PersonaRespuesta = {
    numeroDocumento: persona.numeroDocumento,
    tipoDocumento: persona.tipoDocumento,
    primerNombre: persona.primerNombre,
    segundoNombre: persona.segundoNombre ?? null,
    apellidos: persona.apellidos,
    fechaNacimiento: persona.fechaNacimiento,
    genero: persona.genero,
    correo: persona.correo,
    // La columna es CHAR(10): se quita el relleno por si acaso.
    celular: persona.celular?.trim(),
    tieneFoto,
    fechaCreacion: persona.fechaCreacion,
    fechaActualizacion: persona.fechaActualizacion,
  };
  if (opciones.incluirFoto) {
    respuesta.foto = tieneFoto ? `data:${persona.fotoTipo};base64,${persona.foto!.toString('base64')}` : null;
  }
  return respuesta;
}

/** Datos de una persona para el detalle del log: todo menos la foto. */
export function datosParaLog(persona: Persona): Record<string, unknown> {
  const { foto, fechaCreacion, fechaActualizacion, ...datos } = aPersonaRespuesta(persona);
  return datos;
}
