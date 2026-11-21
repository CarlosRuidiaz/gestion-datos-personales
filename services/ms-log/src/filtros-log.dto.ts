import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min, ValidateBy, ValidationOptions } from 'class-validator';
import { parsearFecha, TipoTransaccion } from '@gdp/common';

export const TAMANO_POR_DEFECTO = 20;
export const TAMANO_MAXIMO = 100;

/**
 * La fecha debe existir en el calendario. Después de la conversión, una fecha válida ya es yyyy-mm-dd
 * y parsearFecha la deja igual; un texto como 2020-13-01 no cambia y aquí se rechaza.
 */
const EsFechaReal = (opciones?: ValidationOptions) =>
  ValidateBy({ name: 'esFechaReal', validator: { validate: (valor: unknown) => parsearFecha(valor) === valor } }, opciones);

const MENSAJE_FECHA = 'debe escribirse como yyyy-mm-dd o dd-mmm-yyyy (por ejemplo, 05-mar-2026)';

/** Un filtro vacío (?tipo=) cuenta como no enviado: así lo manda un formulario sin llenar. */
function vacioANoEnviado(valor: unknown): unknown {
  if (typeof valor !== 'string') return valor;
  const texto = valor.trim();
  return texto === '' ? undefined : texto;
}

const Texto = () => Transform(({ value }) => vacioANoEnviado(value));

/** Convierte la fecha a yyyy-mm-dd. Si no es válida, deja el texto tal cual para que la validación la rechace. */
const Fecha = () =>
  Transform(({ value }) => {
    const texto = vacioANoEnviado(value);
    return typeof texto === 'string' ? (parsearFecha(texto) ?? texto) : texto;
  });

const Entero = () =>
  Transform(({ value }) => {
    const texto = vacioANoEnviado(value);
    return typeof texto === 'string' ? Number(texto) : texto;
  });

/**
 * Filtros de GET /api/log (RF-07). Todos son opcionales y se combinan entre sí.
 * Las fechas son días completos en la zona horaria del servicio (variable TZ): «hasta» incluye todo ese día.
 */
export class FiltrosLogDto {
  @ApiPropertyOptional({ enum: TipoTransaccion, example: TipoTransaccion.CREAR })
  @Texto()
  @IsOptional()
  @IsIn(Object.values(TipoTransaccion), {
    message: `El tipo debe ser uno de estos: ${Object.values(TipoTransaccion).join(', ')}`,
  })
  tipo?: TipoTransaccion;

  @ApiPropertyOptional({ example: '1043123456', description: 'Número de documento exacto' })
  @Texto()
  @IsOptional()
  @Matches(/^[0-9]{1,10}$/, { message: 'El número de documento debe tener solo dígitos y máximo 10 caracteres' })
  documento?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Primer día incluido' })
  @Fecha()
  @IsOptional()
  @EsFechaReal({ message: `La fecha «desde» ${MENSAJE_FECHA}` })
  desde?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Último día incluido' })
  @Fecha()
  @IsOptional()
  @EsFechaReal({ message: `La fecha «hasta» ${MENSAJE_FECHA}` })
  hasta?: string;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @Entero()
  @IsOptional()
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser 1 o mayor' })
  pagina?: number;

  @ApiPropertyOptional({ example: TAMANO_POR_DEFECTO, default: TAMANO_POR_DEFECTO, minimum: 1, maximum: TAMANO_MAXIMO })
  @Entero()
  @IsOptional()
  @IsInt({ message: 'El tamaño de página debe ser un número entero' })
  @Min(1, { message: `El tamaño de página debe estar entre 1 y ${TAMANO_MAXIMO}` })
  @Max(TAMANO_MAXIMO, { message: `El tamaño de página debe estar entre 1 y ${TAMANO_MAXIMO}` })
  tamano?: number;
}
