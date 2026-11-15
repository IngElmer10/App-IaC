import { BadRequestException, Injectable } from '@nestjs/common';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

@Injectable()
export class AttendanceService {
  validateUniqueMark(marks: Array<{ sessionId: string; studentId: string; status: AttendanceStatus }>) {
    const seen = new Set<string>();

    for (const mark of marks) {
      const key = `${mark.sessionId}:${mark.studentId}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          'Ya existe una marca de asistencia para este estudiante en la sesión',
        );
      }
      seen.add(key);
    }

    return true;
  }
}
