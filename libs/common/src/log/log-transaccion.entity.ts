import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Tabla log_transaccion (sección 6.2 del diseño). Solo ms-log puede leerla.
 * Para escribir en el log se usa AuditoriaService, nunca esta entidad:
 * los demás servicios no tienen SELECT y un save() de TypeORM fallaría.
 */
@Entity({ name: 'log_transaccion' })
export class LogTransaccion {
  /** BIGSERIAL: llega como texto para no perder precisión. */
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'fecha_hora', type: 'timestamptz' })
  fechaHora: Date;

  @Column({ type: 'varchar', length: 20 })
  tipo: string;

  @Column({ name: 'numero_documento', type: 'varchar', length: 10, nullable: true })
  numeroDocumento: string | null;

  @Column({ type: 'varchar', length: 100 })
  usuario: string;

  @Column({ type: 'varchar', length: 10 })
  resultado: string;

  @Column({ type: 'jsonb', nullable: true })
  detalle: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  pregunta: string | null;

  @Column({ type: 'text', nullable: true })
  respuesta: string | null;
}
