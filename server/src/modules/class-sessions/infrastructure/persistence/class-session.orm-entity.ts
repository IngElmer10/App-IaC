import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('class_sessions')
export class ClassSessionOrmEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'module_id', type: 'int' })
  moduleId: number;

  /** DATE de PostgreSQL; TypeORM lo devuelve como 'YYYY-MM-DD'. */
  @Column({ name: 'class_date', type: 'date' })
  classDate: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;
}
