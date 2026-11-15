import { Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { MarkAttendanceDto } from './dto/mark-attendance.dto.js';
import { ApiAuthGuard, AuthRoleGuard, RequireRoles, type AuthenticatedRequest } from '../auth/auth.guard.js';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('mark')
  @UseGuards(ApiAuthGuard, AuthRoleGuard)
  @RequireRoles('student')
  async mark(@Body() dto: MarkAttendanceDto, @Req() request: AuthenticatedRequest) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: dto.sessionId },
      include: { module: true },
    });
    if (!session || !session.module.active) {
      throw new NotFoundException('No se encontró una clase del módulo activo.');
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const sessionDate = session.date.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    if (sessionDate !== today) {
      throw new ForbiddenException('La asistencia solo se puede marcar durante el día programado.');
    }

    const student = await this.prisma.student.findFirst({
      where: { id: request.authUser!.id, moduleId: session.moduleId, active: true },
    });
    if (!student) {
      throw new NotFoundException('El estudiante no pertenece al módulo activo.');
    }

    const existing = await this.prisma.attendance.findUnique({
      where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
    });
    if (existing) {
      throw new ConflictException('Ya existe una marca de asistencia para esta fecha de clase.');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
      const attendance = await transaction.attendance.create({
        data: {
          sessionId: session.id,
          studentId: student.id,
          status: 'PRESENT',
          observedAt: new Date(),
        },
      });
      await transaction.auditLog.create({
        data: {
          entity: 'Attendance',
          entityId: attendance.id,
          action: 'STUDENT_MARKED_PRESENT',
          actor: student.registrationCode,
          payload: { sessionId: session.id, studentId: student.id, registrationCode: student.registrationCode, status: 'PRESENT' },
        },
      });
      return attendance;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una marca de asistencia para esta fecha de clase.');
      }
      throw error;
    }
  }

  @Get('session/:sessionId')
  @UseGuards(ApiAuthGuard, AuthRoleGuard)
  @RequireRoles('admin')
  getBySession(@Param('sessionId') sessionId: string) {
    return this.prisma.attendance.findMany({
      where: { sessionId, session: { module: { active: true } } },
      include: {
        student: { select: { registrationCode: true, fullName: true, email: true } },
        session: true,
      },
      orderBy: { student: { fullName: 'asc' } },
    });
  }
}
