import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../shared/application/clock.port';
import type { AuthUser } from '../../../shared/domain/auth-user';
import type { ActivityAction } from '../domain/activity-log';
import { ActivityLogRepository } from '../domain/activity-log.repository';

export interface RecordActivityInput {
  actor: AuthUser;
  action: ActivityAction;
  description: string;
  moduleId: number | null;
  studentId?: number | null;
  entity?: string;
  entityId?: number;
  details?: Record<string, unknown>;
}

/** Registra las acciones importantes (RF-09). Un fallo aquí no rompe la operación principal. */
@Injectable()
export class ActivityRecorder {
  private readonly logger = new Logger(ActivityRecorder.name);

  constructor(
    private readonly repository: ActivityLogRepository,
    private readonly clock: Clock,
  ) {}

  async record(input: RecordActivityInput): Promise<void> {
    try {
      await this.repository.save({
        moduleId: input.moduleId,
        actorType: input.actor.role,
        actorId: input.actor.id,
        actorName: input.actor.name,
        action: input.action,
        studentId: input.studentId ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        description: input.description,
        details: input.details ?? null,
        createdAt: this.clock.now(),
      });
    } catch (error) {
      this.logger.error(`No se pudo registrar la actividad ${input.action}`, error);
    }
  }
}
