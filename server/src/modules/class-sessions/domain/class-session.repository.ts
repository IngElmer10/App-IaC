import type { ClassSession } from './class-session';

export abstract class ClassSessionRepository {
  abstract findByModule(moduleId: number): Promise<ClassSession[]>;
  abstract findByModuleAndDate(moduleId: number, date: string): Promise<ClassSession | null>;
  abstract findById(id: number): Promise<ClassSession | null>;
}
