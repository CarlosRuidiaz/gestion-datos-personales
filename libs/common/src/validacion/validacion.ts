import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

/** Un campo con su mensaje, para que el frontend lo muestre junto al campo. */
export interface ErrorDeCampo {
  campo: string;
  mensaje: string;
}

export const MENSAJE_CAMPOS_INVALIDOS = 'Hay campos con errores';

/**
 * Crea el error 400 que devuelven todos los servicios cuando los datos no son válidos:
 * { statusCode: 400, error: 'Bad Request', message: '...', errores: [{ campo, mensaje }] }
 */
export function errorDeCampos(errores: ErrorDeCampo[], mensaje = MENSAJE_CAMPOS_INVALIDOS): BadRequestException {
  return new BadRequestException({ statusCode: 400, error: 'Bad Request', message: mensaje, errores });
}

/** Reglas cuyo mensaje va primero: un campo vacío debe decir «es obligatorio», no «no puede contener números». */
const REGLAS_PRIORITARIAS = ['isNotEmpty', 'isString', 'esFechaValida'];

/** Convierte los errores de class-validator en un mensaje por campo. */
export function aErroresDeCampo(errores: ValidationError[]): ErrorDeCampo[] {
  return errores.map((error) => {
    const reglas = error.constraints ?? {};
    const prioritaria = REGLAS_PRIORITARIAS.find((regla) => regla in reglas);
    return {
      campo: error.property,
      mensaje: (prioritaria ? reglas[prioritaria] : Object.values(reglas)[0]) ?? 'Valor inválido',
    };
  });
}

/**
 * ValidationPipe común: convierte el cuerpo al DTO, descarta campos desconocidos
 * y devuelve la lista de campos con su mensaje.
 */
export function crearValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    exceptionFactory: (errores) => errorDeCampos(aErroresDeCampo(errores)),
  });
}
