import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ClassSession } from '../../domain/class-session';
import { ClassSessionRepository } from '../../domain/class-session.repository';
import { ClassSessionOrmEntity } from './class-session.orm-entity';

@Injectable()
export class TypeormClassSessionRepository extends ClassSessionRepository {
  constructor(
    @InjectRepository(ClassSessionOrmEntity)
    private readonly repo: Repository<ClassSessionOrmEntity>,
  ) {
    super();
  }

  async findByModule(moduleId: number): Promise<ClassSession[]> {
    const rows = await this.repo.find({ where: { moduleId }, order: { classDate: 'ASC' } });
    return rows.map(toDomain);
  }

  async findByModuleAndDate(moduleId: number, date: string): Promise<ClassSession | null> {
    const row = await this.repo.findOneBy({ moduleId, classDate: date });
    return row ? toDomain(row) : null;
  }

  async findById(id: number): Promise<ClassSession | null> {
    const row = await this.repo.findOneBy({ id });
    return row ? toDomain(row) : null;
  }
}

/** PostgreSQL devuelve TIME como HH:mm:ss; el dominio usa HH:mm. */
function toDomain(row: ClassSessionOrmEntity): ClassSession {
  return {
    ...row,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
  };
}
