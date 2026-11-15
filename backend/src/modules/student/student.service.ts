import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentSummary(identifier: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        active: true,
        module: { is: { active: true } },
        OR: [{ id: identifier }, { registrationCode: identifier }, { email: identifier.toLowerCase() }],
      },
      include: { module: true },
    });

    if (!student || !student.module) {
      throw new NotFoundException('Estudiante no encontrado');
    }

    const sessions = await this.prisma.classSession.findMany({
      where: { moduleId: student.moduleId! },
      orderBy: { date: 'asc' },
      include: { attendances: { where: { studentId: student.id } } },
    });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const marks = sessions.map((session) => {
      const attendance = session.attendances[0];
      const sessionDate = session.date.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
      const status = attendance?.status ?? (sessionDate < today ? 'ABSENT' : 'PENDING');

      return {
        sessionId: session.id,
        date: sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        status,
        observedAt: attendance?.observedAt ?? null,
        canMark: sessionDate === today && !attendance,
      };
    });
    const present = marks.filter((mark) => mark.status === 'PRESENT').length;
    const absent = marks.filter((mark) => mark.status === 'ABSENT').length;
    const completedSessions = present + absent;

    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        registrationCode: student.registrationCode,
        email: student.email,
      },
      activeModule: student.module,
      attendanceRate: completedSessions === 0 ? 0 : Math.round((present / completedSessions) * 100),
      totalSessions: sessions.length,
      present,
      absent,
      marks,
    };
  }
}
