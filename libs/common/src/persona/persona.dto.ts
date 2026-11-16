import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { GENEROS, LONGITUD, TIPOS_DOCUMENTO } from '../constantes';
import { esFechaFutura, parsearFecha } from './fecha';

const SIN_NUMEROS = /^[^0-9]+$/;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Quita espacios al inicio y al final. */
const Recortar = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Recorta y convierte el texto vacío en null (los formularios envían texto vacío en los campos opcionales). */
const RecortarOpcional = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const texto = value.trim();
    return texto === '' ? null : texto;
  });

/** La fecha ya debe venir convertida a yyyy-mm-dd por parsearFecha. */
function EsFechaValida(opciones?: ValidationOptions) {
  return (objeto: object, propiedad: string) =>
    registerDecorator({
      name: 'esFechaValida',
      target: objeto.constructor,
      propertyName: propiedad,
      options: opciones,
      validator: { validate: (valor: unknown) => typeof valor === 'string' && FECHA_ISO.test(valor) },
    });
}

function NoEsFechaFutura(opciones?: ValidationOptions) {
  return (objeto: object, propiedad: string) =>
    registerDecorator({
      name: 'noEsFechaFutura',
      target: objeto.constructor,
      propertyName: propiedad,
      options: opciones,
      validator: {
        // Si no es una fecha válida, el error lo da EsFechaValida.
        validate: (valor: unknown) => typeof valor !== 'string' || !FECHA_ISO.test(valor) || !esFechaFutura(valor),
      },
    });
}

/**
 * Datos del formulario de persona, con las validaciones de la sección 3.3 del diseño.
 * Los mensajes son los que ve el usuario junto a cada campo.
 */
export class CrearPersonaDto {
  @ApiProperty({ enum: TIPOS_DOCUMENTO, example: 'Cédula' })
  @Recortar()
  @IsIn(TIPOS_DOCUMENTO, { message: 'El tipo de documento debe ser Tarjeta de identidad o Cédula' })
  tipoDocumento: string;

  @ApiProperty({ example: '1043123456', description: 'Solo dígitos, máximo 10. Es la llave de búsqueda' })
  @Recortar()
  @Matches(/^[0-9]{1,10}$/, { message: 'El número de documento debe tener solo dígitos y máximo 10 caracteres' })
  numeroDocumento: string;

  @ApiProperty({ example: 'Pedro', maxLength: LONGITUD.nombre })
  @Recortar()
  @IsString({ message: 'El primer nombre es obligatorio' })
  @IsNotEmpty({ message: 'El primer nombre es obligatorio' })
  @MaxLength(LONGITUD.nombre, { message: 'El primer nombre no puede tener más de 30 caracteres' })
  @Matches(SIN_NUMEROS, { message: 'El primer nombre no puede contener números' })
  primerNombre: string;

  @ApiPropertyOptional({ example: 'Andrés', maxLength: LONGITUD.nombre, nullable: true })
  @RecortarOpcional()
  @IsOptional()
  @IsString({ message: 'El segundo nombre debe ser texto' })
  @MaxLength(LONGITUD.nombre, { message: 'El segundo nombre no puede tener más de 30 caracteres' })
  @Matches(SIN_NUMEROS, { message: 'El segundo nombre no puede contener números' })
  segundoNombre?: string | null;

  @ApiProperty({ example: 'Pérez Gómez', maxLength: LONGITUD.apellidos })
  @Recortar()
  @IsString({ message: 'Los apellidos son obligatorios' })
  @IsNotEmpty({ message: 'Los apellidos son obligatorios' })
  @MaxLength(LONGITUD.apellidos, { message: 'Los apellidos no pueden tener más de 60 caracteres' })
  @Matches(SIN_NUMEROS, { message: 'Los apellidos no pueden contener números' })
  apellidos: string;

  @ApiProperty({
    example: '05-mar-2001',
    description: 'Se acepta dd-mmm-yyyy (mes en español) o yyyy-mm-dd. Después de validar queda como yyyy-mm-dd',
  })
  @Transform(({ value }) => parsearFecha(value) ?? value)
  @EsFechaValida({
    message: 'La fecha de nacimiento debe elegirse en el calendario o escribirse como dd-mmm-yyyy (por ejemplo, 05-mar-2001)',
  })
  @NoEsFechaFutura({ message: 'La fecha de nacimiento no puede ser futura' })
  fechaNacimiento: string;

  @ApiProperty({ enum: GENEROS, example: 'Masculino' })
  @Recortar()
  @IsIn(GENEROS, { message: 'El género debe ser Masculino, Femenino, No binario o Prefiero no reportar' })
  genero: string;

  @ApiProperty({ example: 'pedro.perez@example.com', maxLength: LONGITUD.correo })
  @Recortar()
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  @MaxLength(LONGITUD.correo, { message: 'El correo electrónico no puede tener más de 100 caracteres' })
  correo: string;

  @ApiProperty({ example: '3001234567', description: 'Solo dígitos, exactamente 10' })
  @Recortar()
  @Matches(/^[0-9]{10}$/, { message: 'El celular debe tener exactamente 10 dígitos' })
  celular: string;
}

/** Datos para modificar una persona: los mismos campos, sin el número de documento (no se puede cambiar). */
export class ModificarPersonaDto extends OmitType(CrearPersonaDto, ['numeroDocumento'] as const) {}
