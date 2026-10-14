import { Injectable } from '@nestjs/common';
import { AttendanceRules, ensureValidRules } from '../../../shared/domain/attendance-rules';
import type { AuthUser } from '../../../shared/domain/auth-user';
import { ActivityRecorder } from '../../activity/application/activity-recorder.service';
import { AcademicModuleRepository } from '../domain/academic-module.repository';
import { ActiveModuleService } from './active-module.service';

/** Configura las reglas de puntualidad (Presente / Atraso / Falta) del módulo activo. */
@Injectable()
export class UpdateAttendanceRulesUseCase {
  constructor(
    private readonly activeModule: ActiveModuleService,
    private readonly repository: AcademicModuleRepository,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(admin: AuthUser, rules: AttendanceRules) {
    ensureValidRules(rules);
    const module = await this.activeModule.getActiveOrFail();
    const updated = await this.repository.updateRules(module.id, rules);

    await this.activity.record({
      actor: admin,
      action: 'UPDATE_RULES',
      moduleId: module.id,
      entity: 'module',
      entityId: module.id,
      description: `${
        rules.enabled
          ? `Puntualidad activada (abre ${rules.openBeforeMinutes} min antes, tolerancia ${rules.toleranceMinutes} min, atraso hasta ${rules.lateLimitMinutes} min)`
          : 'Puntualidad desactivada (se marca todo el día)'
      } · Presente ${rules.presentPoints} pts, Atraso ${rules.latePoints} pts, mínimo ${rules.minAttendancePercentage}%`,
      details: { previous: module.rules, next: rules },
    });

    return this.repository.summarize(updated);
  }
}
