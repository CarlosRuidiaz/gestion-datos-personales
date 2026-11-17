import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  aPersonaRespuesta,
  AuditoriaService,
  CONTEXTO_PREVIO_MODIFICAR,
  datosParaLog,
  FotoValidada,
  Persona,
  PersonaRespuesta,
  ResultadoTransaccion,
  TipoTransaccion,
  UsuarioAutenticado,
} from '@gdp/common';
import { ActualizarPersonaDto } from './actualizar-persona.dto';

const MENSAJE_NO_ENCONTRADA = 'No hay una persona registrada con ese número de documento';

/** Campos del formulario que se pueden modificar (todos menos el documento y la foto). */
const CAMPOS = [
  'tipoDocumento',
  'primerNombre',
  'segundoNombre',
  'apellidos',
  'fechaNacimiento',
  'genero',
  'correo',
  'celular',
] as const;
type Campo = (typeof CAMPOS)[number];

@Injectable()
export class PersonasService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Búsqueda previa a la modificación. La hace este mismo servicio para no depender de
   * ms-consultar, y queda en el log con el tipo CONSULTAR (sección 5.2 del diseño).
   */
  async buscar(documento: string, usuario: UsuarioAutenticado): Promise<PersonaRespuesta> {
    return this.dataSource.transaction(async (manager) => {
      const persona = await manager.findOneBy(Persona, { numeroDocumento: documento });
      if (!persona) {
        throw new NotFoundException(MENSAJE_NO_ENCONTRADA);
      }
      await this.auditoria.registrar(manager, {
        tipo: TipoTransaccion.CONSULTAR,
        numeroDocumento: documento,
        usuario: usuario.nombre,
        resultado: ResultadoTransaccion.EXITO,
        detalle: { contexto: CONTEXTO_PREVIO_MODIFICAR },
      });
      return aPersonaRespuesta(persona, { incluirFoto: true });
    });
  }

  /**
   * Modifica la persona y registra el log en la misma transacción. El detalle del log
   * guarda el valor anterior y el nuevo de cada campo que cambió.
   */
  async modificar(
    documento: string,
    dto: ActualizarPersonaDto,
    foto: FotoValidada | null,
    usuario: UsuarioAutenticado,
  ): Promise<PersonaRespuesta> {
    return this.dataSource.transaction(async (manager) => {
      // Bloquea la fila: dos modificaciones simultáneas se aplican una después de la otra.
      const persona = await manager.findOne(Persona, {
        where: { numeroDocumento: documento },
        lock: { mode: 'pessimistic_write' },
      });
      if (!persona) {
        throw new NotFoundException(MENSAJE_NO_ENCONTRADA);
      }

      const antes = datosParaLog(persona);
      const nuevos: Record<Campo, string | null> = {
        tipoDocumento: dto.tipoDocumento,
        primerNombre: dto.primerNombre,
        segundoNombre: dto.segundoNombre ?? null,
        apellidos: dto.apellidos,
        fechaNacimiento: dto.fechaNacimiento,
        genero: dto.genero,
        correo: dto.correo,
        celular: dto.celular,
      };

      const cambios: Partial<Persona> = {};
      const anterior: Record<string, unknown> = {};
      const nuevo: Record<string, unknown> = {};
      for (const campo of CAMPOS) {
        if (antes[campo] !== nuevos[campo]) {
          anterior[campo] = antes[campo];
          nuevo[campo] = nuevos[campo];
          (cambios as Record<string, unknown>)[campo] = nuevos[campo];
        }
      }

      let cambioDeFoto: string | undefined;
      if (foto) {
        cambios.foto = foto.foto;
        cambios.fotoTipo = foto.fotoTipo;
        cambioDeFoto = persona.foto ? 'reemplazada' : 'agregada';
      } else if (dto.eliminarFoto && persona.foto) {
        cambios.foto = null;
        cambios.fotoTipo = null;
        cambioDeFoto = 'eliminada';
      }

      const huboCambios = Object.keys(cambios).length > 0;
      if (huboCambios) {
        // TypeORM actualiza fecha_actualizacion por su cuenta.
        await manager.update(Persona, { numeroDocumento: documento }, cambios);
      }

      const detalle: Record<string, unknown> = { anterior, nuevo };
      if (cambioDeFoto) detalle.foto = cambioDeFoto;
      if (!huboCambios) detalle.sinCambios = true;
      await this.auditoria.registrar(manager, {
        tipo: TipoTransaccion.MODIFICAR,
        numeroDocumento: documento,
        usuario: usuario.nombre,
        resultado: ResultadoTransaccion.EXITO,
        detalle,
      });

      const actualizada = await manager.findOneByOrFail(Persona, { numeroDocumento: documento });
      return aPersonaRespuesta(actualizada);
    });
  }
}
