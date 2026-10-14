import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/application/clock.port';
import type { AuthUser } from '../../../shared/domain/auth-user';
import { toDisplayDate } from '../../../shared/domain/display-date';
import { NotFoundError } from '../../../shared/domain/errors';
import { ActiveModuleService } from '../../academic-modules/application/active-module.service';
import { ActivityRecorder } from '../../activity/application/activity-recorder.service';
import { ClassSessionRepository } from '../../class-sessions/domain/class-session.repository';
import { StudentRepository } from '../../students/domain/student.repository';
import { ensureAdminChangeIsEffective, ensureStatusAllowed } from '../domain/attendance-policy';
import type { StoredAttendanceStatus } from '../domain/attendance-status';
import { AttendanceRepository } from '../domain/attendance.repository';
import { buildRecord } from './attendance-record.view';

export interface UpdateAttendanceInput {
  studentId: number;
  sessionId: number;
  status: StoredAttendanceStatus;
  reason?: string;
}

/** RF-07 / RN-06 / RN-07: el admin corrige cualquier fecha y el cambio queda auditado. */
@Injectable()
export class UpdateAttendanceUseCase {
  constructor(
    private readonly activeModule: ActiveModuleService,
    private readonly students: StudentRepository,
    private readonly sessions: ClassSessionRepository,
    private readonly attendances: AttendanceRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(admin: AuthUser, input: UpdateAttendanceInput) {
    const module = await this.activeModule.getActiveOrFail();
    ensureStatusAllowed(module.rules, input.status);
    const [student, session] = await Promise.all([
      this.students.findById(input.studentId),
      this.sessions.findById(input.sessionId),
    ]);
    if (!student || student.moduleId !== module.id) {
      throw new NotFoundError('El estudiante no pertenece al módulo activo');
    }
    if (!session || session.moduleId !== module.id) {
      throw new NotFoundError('La fecha de clase no pertenece al módulo activo');
    }

    const context = { today: this.clock.today(), time: this.clock.currentTime(), rules: module.rules };
    const existing = await this.attendances.findOne(student.id, session.id);
    const previousStatus = buildRecord(session, existing, context).status;
    ensureAdminChangeIsEffective(previousStatus, input.status);

    const reason = input.reason?.trim() || null;
    const attendance = await this.attendances.applyAdminChange({
      moduleId: module.id,
      studentId: student.id,
      sessionId: session.id,
      previousStatus,
      newStatus: input.status,
      adminId: admin.id,
      reason,
      now: this.clock.now(),
    });

    await this.activity.record({
      actor: admin,
      action: 'EDIT_ATTENDANCE',
      moduleId: module.id,
      studentId: student.id,
      entity: 'attendance',
      entityId: attendance.id,
      description: `Cambió la asistencia de ${student.fullName} del ${toDisplayDate(session.classDate)}: ${previousStatus} → ${input.status}`,
      details: {
        sessionId: session.id,
        date: session.classDate,
        previousStatus,
        newStatus: input.status,
        reason,
      },
    });

    return buildRecord(session, attendance, context);
  }
}
