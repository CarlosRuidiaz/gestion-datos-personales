import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  aPersonaRespuesta,
  AuditoriaService,
  CrearPersonaDto,
  datosParaLog,
  FotoValidada,
  Persona,
  PersonaRespuesta,
  ResultadoTransaccion,
  TipoTransaccion,
  UsuarioAutenticado,
} from '@gdp/common';

const MENSAJE_DUPLICADO = 'Ya hay una persona registrada con ese número de documento';
/** Código de PostgreSQL para una llave repetida. */
const LLAVE_REPETIDA = '23505';

@Injectable()
export class PersonasService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Crea la persona y su registro de log en una sola transacción (flujo «Crear persona», sección 5.2).
   * Si el documento ya existe lanza 409; ese intento lo registra el filtro de auditoría.
   */
  async crear(dto: CrearPersonaDto, foto: FotoValidada | null, usuario: UsuarioAutenticado): Promise<PersonaRespuesta> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        if (await manager.existsBy(Persona, { numeroDocumento: dto.numeroDocumento })) {
          throw new ConflictException(MENSAJE_DUPLICADO);
        }

        await manager.insert(Persona, {
          numeroDocumento: dto.numeroDocumento,
          tipoDocumento: dto.tipoDocumento,
          primerNombre: dto.primerNombre,
          segundoNombre: dto.segundoNombre ?? null,
          apellidos: dto.apellidos,
          fechaNacimiento: dto.fechaNacimiento,
          genero: dto.genero,
          correo: dto.correo,
          celular: dto.celular,
          foto: foto?.foto ?? null,
          fotoTipo: foto?.fotoTipo ?? null,
        });
        const persona = await manager.findOneByOrFail(Persona, { numeroDocumento: dto.numeroDocumento });

        await this.auditoria.registrar(manager, {
          tipo: TipoTransaccion.CREAR,
          numeroDocumento: persona.numeroDocumento,
          usuario: usuario.nombre,
          resultado: ResultadoTransaccion.EXITO,
          detalle: { nuevo: datosParaLog(persona) },
        });

        return aPersonaRespuesta(persona);
      });
    } catch (error) {
      // Dos peticiones simultáneas con el mismo documento: la segunda choca con la llave primaria.
      if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === LLAVE_REPETIDA) {
        throw new ConflictException(MENSAJE_DUPLICADO);
      }
      throw error;
    }
  }
}
