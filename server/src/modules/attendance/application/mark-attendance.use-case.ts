import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/application/clock.port';
import type { AuthUser } from '../../../shared/domain/auth-user';
import { toDisplayDate } from '../../../shared/domain/display-date';
import { ActivityRecorder } from '../../activity/application/activity-recorder.service';
import { ClassSessionRepository } from '../../class-sessions/domain/class-session.repository';
import { ensureStudentCanMark, statusForStudentMark } from '../domain/attendance-policy';
import { markWindowFor } from '../domain/mark-window';
import { AttendanceRepository } from '../domain/attendance.repository';
import { buildRecord } from './attendance-record.view';
import { StudentContextService } from './student-context.service';

/** RF-03: el estudiante marca su asistencia del día; con reglas de puntualidad queda Presente o Atraso. */
@Injectable()
export class MarkAttendanceUseCase {
  constructor(
    private readonly context: StudentContextService,
    private readonly sessions: ClassSessionRepository,
    private readonly attendances: AttendanceRepository,
    private readonly activity: ActivityRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(user: AuthUser) {
    const { module, student } = await this.context.resolve(user);
    const today = this.clock.today();
    const time = this.clock.currentTime();
    const session = await this.sessions.findByModuleAndDate(module.id, today);
    const existing = session ? await this.attendances.findOne(student.id, session.id) : null;
    ensureStudentCanMark(session !== null, existing);
    const status = statusForStudentMark(markWindowFor(module.rules, session!), time);

    const attendance = await this.attendances.registerStudentMark({
      moduleId: module.id,
      studentId: student.id,
      sessionId: session!.id,
      status,
      markedAt: this.clock.now(),
    });

    await this.activity.record({
      actor: user,
      action: 'MARK_ATTENDANCE',
      moduleId: module.id,
      studentId: student.id,
      entity: 'attendance',
      entityId: attendance.id,
      description: `${student.fullName} marcó asistencia del ${toDisplayDate(today)}${status === 'ATRASO' ? ' (atraso)' : ''}`,
      details: { sessionId: session!.id, date: today, status },
    });

    return buildRecord(session!, attendance, { today, time, rules: module.rules });
  }
}
