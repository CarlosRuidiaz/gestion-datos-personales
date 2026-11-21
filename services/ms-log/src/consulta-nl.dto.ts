import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ResultadoTransaccion } from '@gdp/common';

/** Usuario con el que quedan en el log las consultas en lenguaje natural: la cuenta de n8n (sección 6.2 del diseño). */
export const USUARIO_N8N = 'n8n';

export const PREGUNTA_MAXIMO = 4000;
export const RESPUESTA_MAXIMO = 20000;

const Recortar = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Cuerpo de POST /api/log/consulta-nl, que envía n8n al terminar cada consulta (sección 7.2 del diseño). */
export class ConsultaNlDto {
  @ApiProperty({ example: '¿Cuál es el empleado más joven que se ha registrado?', maxLength: PREGUNTA_MAXIMO })
  @Recortar()
  @IsString({ message: 'La pregunta es obligatoria' })
  @IsNotEmpty({ message: 'La pregunta es obligatoria' })
  @MaxLength(PREGUNTA_MAXIMO, { message: `La pregunta debe tener máximo ${PREGUNTA_MAXIMO} caracteres` })
  pregunta: string;

  @ApiPropertyOptional({
    example: 'La persona más joven registrada es Ana Torres, de 15 años.',
    maxLength: RESPUESTA_MAXIMO,
    description: 'Puede faltar si el modelo falló y no hubo respuesta',
  })
  @Recortar()
  @IsOptional()
  @IsString({ message: 'La respuesta debe ser texto' })
  @MaxLength(RESPUESTA_MAXIMO, { message: `La respuesta debe tener máximo ${RESPUESTA_MAXIMO} caracteres` })
  respuesta?: string | null;

  @ApiProperty({ enum: ResultadoTransaccion, example: ResultadoTransaccion.EXITO })
  @IsIn(Object.values(ResultadoTransaccion), { message: 'El resultado debe ser EXITO o ERROR' })
  resultado: string;

  @ApiPropertyOptional({
    example: { motivo: 'Se agotó la cuota diaria del modelo' },
    description: 'Datos adicionales, por ejemplo el error del modelo o la sesión del chat',
  })
  @IsOptional()
  @IsObject({ message: 'El detalle debe ser un objeto JSON' })
  detalle?: Record<string, unknown> | null;
}
