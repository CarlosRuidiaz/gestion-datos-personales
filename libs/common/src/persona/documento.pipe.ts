import { Injectable, PipeTransform } from '@nestjs/common';
import { errorDeCampos } from '../validacion/validacion';

/**
 * Valida el número de documento que llega en la ruta (/personas/:documento).
 * Uso: @Param('documento', DocumentoPipe) documento: string
 */
@Injectable()
export class DocumentoPipe implements PipeTransform<unknown, string> {
  transform(valor: unknown): string {
    const texto = typeof valor === 'string' ? valor.trim() : '';
    if (!/^[0-9]{1,10}$/.test(texto)) {
      throw errorDeCampos([
        { campo: 'numeroDocumento', mensaje: 'El número de documento debe tener solo dígitos y máximo 10 caracteres' },
      ]);
    }
    return texto;
  }
}
