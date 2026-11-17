import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { ModificarPersonaDto } from '@gdp/common';

/**
 * Cuerpo de PUT /api/modificar/personas/{documento}: todos los campos del formulario
 * menos el número de documento, que no se puede cambiar (RF-03).
 *
 * La foto se maneja así:
 * - si llega un archivo «foto», reemplaza la actual;
 * - si no llega archivo y eliminarFoto es true, se quita la foto;
 * - si no llega ninguna de las dos cosas, la foto se conserva.
 */
export class ActualizarPersonaDto extends ModificarPersonaDto {
  @ApiPropertyOptional({ description: 'true para quitar la foto actual', default: false })
  @Transform(({ value }) => {
    // En un formulario multipart los valores llegan como texto.
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0' || value === '' || value == null) return false;
    return value;
  })
  @IsOptional()
  @IsBoolean({ message: 'eliminarFoto debe ser true o false' })
  eliminarFoto?: boolean;
}
