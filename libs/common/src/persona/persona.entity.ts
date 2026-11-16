import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Tabla persona (sección 6.2 del diseño). El esquema lo crea database/init.sql:
 * esta clase solo lo describe, y TypeORM va con synchronize en false.
 */
@Entity({ name: 'persona' })
export class Persona {
  @PrimaryColumn({ name: 'numero_documento', type: 'varchar', length: 10 })
  numeroDocumento: string;

  @Column({ name: 'tipo_documento', type: 'varchar', length: 20 })
  tipoDocumento: string;

  @Column({ name: 'primer_nombre', type: 'varchar', length: 30 })
  primerNombre: string;

  @Column({ name: 'segundo_nombre', type: 'varchar', length: 30, nullable: true })
  segundoNombre: string | null;

  @Column({ type: 'varchar', length: 60 })
  apellidos: string;

  /** Fecha sin hora, como texto yyyy-mm-dd (así no la mueve la zona horaria). */
  @Column({ name: 'fecha_nacimiento', type: 'date' })
  fechaNacimiento: string;

  @Column({ type: 'varchar', length: 25 })
  genero: string;

  @Column({ type: 'varchar', length: 100 })
  correo: string;

  @Column({ type: 'char', length: 10 })
  celular: string;

  /** Imagen de hasta 2 MB. Va junto con fotoTipo, o los dos en null. */
  @Column({ type: 'bytea', nullable: true })
  foto: Buffer | null;

  /** Tipo MIME: image/jpeg o image/png. */
  @Column({ name: 'foto_tipo', type: 'varchar', length: 20, nullable: true })
  fotoTipo: string | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}
