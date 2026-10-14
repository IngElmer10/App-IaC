import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicModulesModule } from '../academic-modules/academic-modules.module';
import { ListSessionsUseCase } from './application/list-sessions.use-case';
import { ClassSessionRepository } from './domain/class-session.repository';
import { SessionsController } from './infrastructure/http/sessions.controller';
import { ClassSessionOrmEntity } from './infrastructure/persistence/class-session.orm-entity';
import { TypeormClassSessionRepository } from './infrastructure/persistence/typeorm-class-session.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ClassSessionOrmEntity]), AcademicModulesModule],
  controllers: [SessionsController],
  providers: [
    { provide: ClassSessionRepository, useClass: TypeormClassSessionRepository },
    ListSessionsUseCase,
  ],
  exports: [ClassSessionRepository],
})
export class ClassSessionsModule {}
