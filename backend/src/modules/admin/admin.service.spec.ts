import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AdminService } from './admin.service.js';

const activeModule = { id: 'module-current', code: 'MOD-CURRENT', name: 'Módulo actual', active: true };

function createPrismaMock() {
  const studentCreateMany = vi.fn().mockResolvedValue({ count: 1 });
  const sessionCreateMany = vi.fn().mockResolvedValue({ count: 1 });
  const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-1' });
  const attendanceUpsert = vi.fn().mockResolvedValue({ id: 'attendance-1', status: 'PRESENT' });
  const prisma = {
    academicModule: {
      findFirst: vi.fn().mockResolvedValue(activeModule),
      create: vi.fn().mockResolvedValue(activeModule),
    },
    student: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      createMany: studentCreateMany,
      count: vi.fn().mockResolvedValue(0),
    },
    classSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      createMany: sessionCreateMany,
      count: vi.fn().mockResolvedValue(0),
    },
    attendance: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: attendanceUpsert,
    },
    auditLog: { create: auditCreate, findMany: vi.fn().mockResolvedValue([]) },
  };
  const transaction = vi.fn((operation: Promise<unknown>[] | ((tx: typeof prisma) => Promise<unknown>)) =>
    Array.isArray(operation) ? Promise.all(operation) : operation(prisma),
  );
  Object.assign(prisma, { $transaction: transaction });

  return { prisma, studentCreateMany, sessionCreateMany, transaction, attendanceUpsert, auditCreate };
}

describe('AdminService import helpers', () => {
  it('normalizes a valid student row from the Excel format described in the requirements', () => {
    const row = {
      'Número de registro': '1001',
      'Nombre completo': 'Juan Pérez',
      'Correo electrónico': 'juan@gmail.com',
    };

    expect(AdminService.normalizeStudentRow(row)).toMatchObject({
      registrationCode: '1001',
      fullName: 'Juan Pérez',
      email: 'juan@gmail.com',
    });
  });

  it('normalizes class dates using the format in the requirement document', () => {
    const row = {
      Fecha: '05/10/2026',
      'Hora inicio': '18:00',
      'Hora fin': '21:00',
    };

    expect(AdminService.normalizeClassSessionRow(row)).toMatchObject({
      date: '2026-10-05',
      startTime: '18:00',
      endTime: '21:00',
    });
  });

  it('normalizes native Excel date and time cell values', () => {
    expect(
      AdminService.normalizeClassSessionRow({
        Fecha: new Date('2026-10-05T00:00:00.000Z'),
        'Hora inicio': 0.75,
        'Hora fin': 0.875,
      }),
    ).toMatchObject({
      date: '2026-10-05',
      startTime: '18:00',
      endTime: '21:00',
    });
  });

  it('imports student rows from a real XLSX buffer', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Estudiantes');
    worksheet.addRow(['Número de registro', 'Nombre completo', 'Correo electrónico']);
    worksheet.addRow(['20991001', 'Estudiante de Prueba', 'estudiante.prueba@example.com']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { prisma, studentCreateMany } = createPrismaMock();
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(
      service.importStudentsFromExcel({ buffer, originalname: 'estudiantes.xlsx' }),
    ).resolves.toMatchObject({ imported: 1, moduleId: activeModule.id });
    expect(studentCreateMany).toHaveBeenCalledWith({
      data: [
        {
          registrationCode: '20991001',
          fullName: 'Estudiante de Prueba',
          email: 'estudiante.prueba@example.com',
          moduleId: activeModule.id,
          active: true,
        },
      ],
    });
  });

  it('rejects legacy XLS files with an actionable message', async () => {
    const { prisma } = createPrismaMock();
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(
      service.importStudentsFromExcel({
        buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
        originalname: 'estudiantes.xls',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not persist duplicate registration codes from the same workbook', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Estudiantes');
    worksheet.addRow(['Número de registro', 'Nombre completo', 'Correo electrónico']);
    worksheet.addRow(['20991001', 'Estudiante Uno', 'uno@example.com']);
    worksheet.addRow(['20991001', 'Estudiante Dos', 'dos@example.com']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { prisma, transaction } = createPrismaMock();
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(service.importStudentsFromExcel({ buffer, originalname: 'estudiantes.xlsx' })).rejects.toMatchObject({
      response: {
        errors: expect.arrayContaining([expect.stringContaining('número de registro duplicado')]),
      },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('persists class dates separately with the requirement columns', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Fechas');
    worksheet.addRow(['Fecha', 'Hora inicio', 'Hora fin']);
    worksheet.addRow(['05/10/2026', '18:00', '21:00']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { prisma, sessionCreateMany } = createPrismaMock();
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(service.importSessionsFromExcel({ buffer, originalname: 'fechas.xlsx' })).resolves.toMatchObject({
      imported: 1,
    });
    expect(sessionCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          moduleId: activeModule.id,
          title: 'Clase 2026-10-05',
          startTime: new Date('2026-10-05T22:00:00.000Z'),
          endTime: new Date('2026-10-06T01:00:00.000Z'),
        }),
      ],
    });
  });

  it('audits the previous and new status when an administrator corrects attendance', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00.000Z'));
    const { prisma, attendanceUpsert, auditCreate } = createPrismaMock();
    prisma.classSession.findFirst.mockResolvedValue({
      id: 'session-1',
      moduleId: activeModule.id,
      date: new Date('2026-10-05T04:00:00.000Z'),
      module: { active: true },
    });
    prisma.student.findFirst.mockResolvedValue({ id: 'student-1', registrationCode: '20991001' });
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(service.updateAttendance('session-1', 'student-1', 'PRESENT')).resolves.toMatchObject({
      previousStatus: 'ABSENT',
      status: 'PRESENT',
      changed: true,
    });
    expect(attendanceUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'PRESENT', observedAt: null }),
    }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'ADMIN_CHANGED_ATTENDANCE',
        payload: expect.objectContaining({
          registrationCode: '20991001',
          previousStatus: 'ABSENT',
          newStatus: 'PRESENT',
        }),
      }),
    }));
    vi.useRealTimers();
  });

  it('rejects invalid administrative attendance states', async () => {
    const { prisma } = createPrismaMock();
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(service.updateAttendance('session-1', 'student-1', 'LATE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
