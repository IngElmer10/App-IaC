import { AttendanceService } from './attendance.service.js';

describe('AttendanceService', () => {
  it('should reject duplicate attendance for the same student and session', () => {
    const service = new AttendanceService();
    const marks = [
      { sessionId: 's1', studentId: 'st1', status: 'PRESENT' },
      { sessionId: 's1', studentId: 'st1', status: 'ABSENT' },
    ];

    expect(() => service.validateUniqueMark(marks as never[])).toThrow(
      'Ya existe una marca de asistencia para este estudiante en la sesión',
    );
  });
});
