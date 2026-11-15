import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service.js';

export type ImportStudentPayload = {
  registrationCode: string;
  fullName: string;
  email: string;
};

export type ImportClassSessionPayload = {
  date: string;
  startTime: string;
  endTime: string;
};

export type ExcelUpload = {
  buffer?: Buffer;
  originalname?: string;
};

type ExcelRow = {
  number: number;
  values: Record<string, unknown>;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  getAccessSettings() {
    return {
      tenantName: process.env.TENANT_NAME || 'Institución educativa',
      defaultStudentPassword: process.env.DEFAULT_STUDENT_PASSWORD || '12345678',
      maxStudents: Number(process.env.MAX_STUDENTS || 0) || null,
      maxSessions: Number(process.env.MAX_SESSIONS || 0) || null,
    };
  }

  static normalizeStudentRow(row: Record<string, unknown>): ImportStudentPayload | null {
    const registrationCode = AdminService.getRecordValue(row, [
      'numero de registro',
      'número de registro',
      'numero registro',
      'nro de registro',
      'número registro',
      'registration code',
      'registrationcode',
      'registro',
    ]);

    const fullName = AdminService.getRecordValue(row, [
      'nombre completo',
      'full name',
      'full_name',
      'nombre',
      'fullname',
    ]);

    const email = AdminService.getRecordValue(row, [
      'correo electronico',
      'correo electrónico',
      'email',
      'correo',
    ]);

    const normalized = {
      registrationCode: AdminService.stringValue(registrationCode),
      fullName: AdminService.stringValue(fullName),
      email: AdminService.stringValue(email).toLowerCase(),
    };

    return normalized.registrationCode && normalized.fullName && normalized.email ? normalized : null;
  }

  static normalizeClassSessionRow(row: Record<string, unknown>): ImportClassSessionPayload | null {
    const date = AdminService.parseDateValue(AdminService.getRecordValue(row, ['fecha', 'date']));
    const startTime = AdminService.parseTimeValue(
      AdminService.getRecordValue(row, ['hora inicio', 'hora de inicio', 'start time', 'starttime']),
    );
    const endTime = AdminService.parseTimeValue(
      AdminService.getRecordValue(row, ['hora fin', 'hora de fin', 'end time', 'endtime']),
    );

    if (!date || !startTime || !endTime || startTime >= endTime) {
      return null;
    }

    return { date, startTime, endTime };
  }

  private static getRecordValue(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const match = Object.entries(row).find(([header]) => {
        const normalized = AdminService.normalizeHeader(header);
        return normalized === AdminService.normalizeHeader(key);
      });

      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  private static normalizeHeader(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  private static stringValue(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object' && 'text' in value) {
      return String(value.text).trim();
    }

    return String(value).trim();
  }

  static parseDateValue(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
    }

    const normalized = AdminService.stringValue(value);
    const dayFirst = normalized.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    const isoDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dayFirst) {
      const [, dayValue, monthValue, yearValue] = dayFirst;
      const year = Number(yearValue.length === 2 ? `20${yearValue}` : yearValue);
      return AdminService.validDate(year, Number(monthValue), Number(dayValue));
    }

    if (isoDate) {
      const [, year, month, day] = isoDate;
      return AdminService.validDate(Number(year), Number(month), Number(day));
    }

    return null;
  }

  private static validDate(year: number, month: number, day: number) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return null;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private static parseTimeValue(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
    }

    if (typeof value === 'number' && value >= 0 && value < 1) {
      const minutes = Math.round(value * 24 * 60);
      if (minutes >= 24 * 60) {
        return null;
      }
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }

    const match = AdminService.stringValue(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      return null;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  async getDashboard() {
    const activeModule = await this.prisma.academicModule.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeModule) {
      return {
        activeModule: null,
        totalStudents: 0,
        totalSessions: 0,
        attendanceToday: 0,
        overview: [
          { label: 'Presentes', value: 0 },
          { label: 'Ausentes', value: 0 },
        ],
      };
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const [totalStudents, totalSessions, overview] = await Promise.all([
      this.prisma.student.count({ where: { moduleId: activeModule.id, active: true } }),
      this.prisma.classSession.count({ where: { moduleId: activeModule.id } }),
      this.getAttendanceOverview({}),
    ]);

    return {
      activeModule,
      totalStudents,
      totalSessions,
      attendanceToday: overview.records.filter((record) => record.date === today && record.status === 'PRESENT').length,
      overview: [
        { label: 'Presentes', value: overview.totals.present },
        { label: 'Faltas', value: overview.totals.absent },
        { label: 'Pendientes', value: overview.totals.pending },
      ],
    };
  }

  async getStudents(search = '') {
    const activeModule = await this.prisma.academicModule.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeModule) {
      return [];
    }

    const query = search.trim();
    return this.prisma.student.findMany({
      where: {
        moduleId: activeModule.id,
        active: true,
        ...(query
          ? {
              OR: [
                { fullName: { contains: query, mode: 'insensitive' } },
                { registrationCode: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { fullName: 'asc' },
      select: { id: true, registrationCode: true, fullName: true, email: true },
    });
  }

  async getAttendanceOverview(filters: { date?: string; search?: string }) {
    const activeModule = await this.prisma.academicModule.findFirst({ where: { active: true } });
    if (!activeModule) {
      return { students: [], sessions: [], records: [], totals: { present: 0, absent: 0, pending: 0 } };
    }

    const studentSearch = filters.search?.trim();
    const sessionDate = filters.date ? AdminService.parseDateValue(filters.date) : null;
    if (filters.date && !sessionDate) {
      throw new BadRequestException('La fecha del filtro debe tener formato YYYY-MM-DD.');
    }

    const [students, sessions] = await Promise.all([
      this.prisma.student.findMany({
        where: {
          moduleId: activeModule.id,
          active: true,
          ...(studentSearch
            ? {
                OR: [
                  { fullName: { contains: studentSearch, mode: 'insensitive' } },
                  { registrationCode: { contains: studentSearch, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { fullName: 'asc' },
        select: { id: true, registrationCode: true, fullName: true, email: true },
      }),
      this.prisma.classSession.findMany({
        where: {
          moduleId: activeModule.id,
          ...(sessionDate ? { date: this.toLaPazDate(sessionDate) } : {}),
        },
        orderBy: { date: 'asc' },
        select: { id: true, date: true, startTime: true, endTime: true },
      }),
    ]);

    const attendances = students.length && sessions.length
      ? await this.prisma.attendance.findMany({
          where: {
            studentId: { in: students.map((student) => student.id) },
            sessionId: { in: sessions.map((session) => session.id) },
          },
          select: { id: true, sessionId: true, studentId: true, status: true, observedAt: true },
        })
      : [];
    const attendanceByKey = new Map(attendances.map((attendance) => [`${attendance.sessionId}:${attendance.studentId}`, attendance]));
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const records = sessions.flatMap((session) => {
      const date = session.date.toISOString().slice(0, 10);
      return students.map((student) => {
        const attendance = attendanceByKey.get(`${session.id}:${student.id}`);
        const status = attendance?.status ?? (date < today ? 'ABSENT' : 'PENDING');
        return {
          attendanceId: attendance?.id ?? null,
          sessionId: session.id,
          studentId: student.id,
          registrationCode: student.registrationCode,
          fullName: student.fullName,
          email: student.email,
          date,
          startTime: session.startTime,
          endTime: session.endTime,
          status,
          observedAt: attendance?.observedAt ?? null,
        };
      });
    });

    return {
      students,
      sessions,
      records,
      totals: {
        present: records.filter((record) => record.status === 'PRESENT').length,
        absent: records.filter((record) => record.status === 'ABSENT').length,
        pending: records.filter((record) => record.status === 'PENDING').length,
      },
    };
  }

  async updateAttendance(sessionId: string, studentId: string, status: string) {
    if (status !== 'PRESENT' && status !== 'ABSENT') {
      throw new BadRequestException('El estado administrativo debe ser PRESENT o ABSENT.');
    }

    const session = await this.prisma.classSession.findFirst({
      where: { id: sessionId, module: { is: { active: true } } },
      include: { module: true },
    });
    const student = session
      ? await this.prisma.student.findFirst({ where: { id: studentId, moduleId: session.moduleId, active: true } })
      : null;

    if (!session || !student) {
      throw new NotFoundException('No se encontró la clase o el estudiante en el módulo activo.');
    }

    const existing = await this.prisma.attendance.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } },
    });
    const sessionDate = session.date.toISOString().slice(0, 10);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const previousStatus = existing?.status ?? (sessionDate < today ? 'ABSENT' : 'PENDING');
    if (previousStatus === status) {
      return { attendance: existing, previousStatus, status, changed: false };
    }

    return this.prisma.$transaction(async (transaction) => {
      const attendance = await transaction.attendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId } },
        create: { sessionId, studentId, status, observedAt: null },
        update: { status },
      });
      await transaction.auditLog.create({
        data: {
          entity: 'Attendance',
          entityId: attendance.id,
          action: 'ADMIN_CHANGED_ATTENDANCE',
          actor: 'admin',
          payload: {
            sessionId,
            studentId,
            registrationCode: student.registrationCode,
            previousStatus,
            newStatus: status,
          },
        },
      });
      return { attendance, previousStatus, status, changed: true };
    });
  }

  async getActivities(filters: { date?: string; search?: string }) {
    const activeModule = await this.prisma.academicModule.findFirst({ where: { active: true } });
    if (!activeModule) {
      return [];
    }

    const search = filters.search?.trim().toLowerCase();
    const sessionDate = filters.date ? AdminService.parseDateValue(filters.date) : null;
    if (filters.date && !sessionDate) {
      throw new BadRequestException('La fecha del filtro debe tener formato YYYY-MM-DD.');
    }

    const [sessionIds, studentIds] = await Promise.all([
      this.prisma.classSession.findMany({ where: { moduleId: activeModule.id }, select: { id: true } }),
      this.prisma.student.findMany({ where: { moduleId: activeModule.id }, select: { id: true, registrationCode: true, fullName: true } }),
    ]);
    const attendanceIds = sessionIds.length && studentIds.length
      ? await this.prisma.attendance.findMany({
          where: {
            sessionId: { in: sessionIds.map((session) => session.id) },
            studentId: { in: studentIds.map((student) => student.id) },
          },
          select: { id: true },
        })
      : [];
    const dateStart = sessionDate ? this.toLaPazDate(sessionDate) : undefined;
    const dateEnd = sessionDate ? new Date(dateStart!.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
    const activities = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: activeModule.id },
          { entityId: { in: attendanceIds.map((attendance) => attendance.id) } },
        ],
        ...(dateStart && dateEnd ? { createdAt: { gte: dateStart, lte: dateEnd } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    if (!search) {
      return activities;
    }

    const matchingStudents = studentIds.filter((student) => `${student.registrationCode} ${student.fullName}`.toLowerCase().includes(search));
    const matchingCodes = new Set(matchingStudents.map((student) => student.registrationCode.toLowerCase()));
    const matchingIds = new Set(matchingStudents.map((student) => student.id));
    return activities.filter((activity) => {
      const payload = activity.payload && typeof activity.payload === 'object' && !Array.isArray(activity.payload)
        ? activity.payload as Record<string, unknown>
        : {};
      const payloadText = JSON.stringify(payload).toLowerCase();
      return activity.actor?.toLowerCase().includes(search)
        || (activity.actor && matchingCodes.has(activity.actor.toLowerCase()))
        || (typeof payload.studentId === 'string' && matchingIds.has(payload.studentId))
        || payloadText.includes(search);
    });
  }

  async importStudentsFromExcel(file: ExcelUpload) {
    const rows = await this.readExcelRows(file);
    const students: ImportStudentPayload[] = [];
    const errors: string[] = [];
    const registrationRows = new Map<string, number>();
    const emailRows = new Map<string, number>();

    for (const row of rows) {
      const student = AdminService.normalizeStudentRow(row.values);
      if (!student || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) {
        errors.push(`Fila ${row.number}: completa número de registro, nombre y un correo válido.`);
        continue;
      }

      const registrationKey = student.registrationCode.toLowerCase();
      const previousRegistrationRow = registrationRows.get(registrationKey);
      if (previousRegistrationRow) {
        errors.push(`Fila ${row.number}: número de registro duplicado (también aparece en fila ${previousRegistrationRow}).`);
      } else {
        registrationRows.set(registrationKey, row.number);
      }

      const previousEmailRow = emailRows.get(student.email);
      if (previousEmailRow) {
        errors.push(`Fila ${row.number}: correo duplicado (también aparece en fila ${previousEmailRow}).`);
      } else {
        emailRows.set(student.email, row.number);
      }
      students.push(student);
    }

    if (errors.length || students.length === 0) {
      throw new BadRequestException({
        message: errors.length ? 'Corrige los errores del archivo antes de importarlo.' : 'El archivo no contiene estudiantes.',
        errors: errors.length ? errors : ['No se encontraron filas con las columnas de estudiantes requeridas.'],
      });
    }

    const activeModule = await this.getOrCreateActiveModule();
    const studentLimit = Number(process.env.MAX_STUDENTS || 0);
    if (studentLimit > 0 && await this.prisma.student.count({ where: { moduleId: activeModule.id, active: true } }) + students.length > studentLimit) {
      throw new BadRequestException(`El plan permite hasta ${studentLimit} estudiantes. Solicita un cambio de plan.`);
    }
    const existingStudents = await this.prisma.student.findMany({
      where: {
        moduleId: activeModule.id,
        OR: [
          { registrationCode: { in: students.map((student) => student.registrationCode) } },
          { email: { in: students.map((student) => student.email) } },
        ],
      },
      select: { registrationCode: true, email: true },
    });

    for (const existing of existingStudents) {
      if (registrationRows.has(existing.registrationCode.toLowerCase())) {
        errors.push(`El número de registro ${existing.registrationCode} ya existe en el módulo activo.`);
      }
      if (emailRows.has(existing.email.toLowerCase())) {
        errors.push(`El correo ${existing.email} ya existe en el módulo activo.`);
      }
    }

    if (errors.length) {
      throw new BadRequestException({ message: 'Hay estudiantes duplicados en el módulo activo.', errors });
    }

    await this.prisma.$transaction([
      this.prisma.student.createMany({
        data: students.map((student) => ({ ...student, moduleId: activeModule.id, active: true })),
      }),
      this.prisma.auditLog.create({
        data: {
          entity: 'AcademicModule',
          entityId: activeModule.id,
          action: 'IMPORT_STUDENTS',
          actor: 'admin',
          payload: { count: students.length },
        },
      }),
    ]);

    return { imported: students.length, moduleId: activeModule.id };
  }

  async importSessionsFromExcel(file: ExcelUpload) {
    const rows = await this.readExcelRows(file);
    const sessions: ImportClassSessionPayload[] = [];
    const errors: string[] = [];
    const dates = new Map<string, number>();

    for (const row of rows) {
      const session = AdminService.normalizeClassSessionRow(row.values);
      if (!session) {
        errors.push(`Fila ${row.number}: completa fecha, hora de inicio y hora de fin válidas.`);
        continue;
      }

      const previousRow = dates.get(session.date);
      if (previousRow) {
        errors.push(`Fila ${row.number}: fecha duplicada (también aparece en fila ${previousRow}).`);
      } else {
        dates.set(session.date, row.number);
      }
      sessions.push(session);
    }

    if (errors.length || sessions.length === 0) {
      throw new BadRequestException({
        message: errors.length ? 'Corrige los errores del archivo antes de importarlo.' : 'El archivo no contiene fechas de clase.',
        errors: errors.length ? errors : ['No se encontraron filas con las columnas de fechas requeridas.'],
      });
    }

    const activeModule = await this.getOrCreateActiveModule();
    const sessionLimit = Number(process.env.MAX_SESSIONS || 0);
    if (sessionLimit > 0 && await this.prisma.classSession.count({ where: { moduleId: activeModule.id } }) + sessions.length > sessionLimit) {
      throw new BadRequestException(`El plan permite hasta ${sessionLimit} fechas de clase. Solicita un cambio de plan.`);
    }
    const existingSessions = await this.prisma.classSession.findMany({
      where: { moduleId: activeModule.id, date: { in: sessions.map((session) => this.toLaPazDate(session.date)) } },
      select: { date: true },
    });
    const existingDates = new Set(existingSessions.map((session) => session.date.toISOString().slice(0, 10)));
    const duplicates = sessions.filter((session) => existingDates.has(session.date));

    if (duplicates.length) {
      throw new BadRequestException({
        message: 'Algunas fechas ya están registradas en el módulo activo.',
        errors: duplicates.map((session) => `La fecha ${session.date} ya existe.`),
      });
    }

    await this.prisma.$transaction([
      this.prisma.classSession.createMany({
        data: sessions.map((session) => ({
          moduleId: activeModule.id,
          title: `Clase ${session.date}`,
          date: this.toLaPazDate(session.date),
          startTime: this.toLaPazDateTime(session.date, session.startTime),
          endTime: this.toLaPazDateTime(session.date, session.endTime),
        })),
      }),
      this.prisma.auditLog.create({
        data: {
          entity: 'AcademicModule',
          entityId: activeModule.id,
          action: 'IMPORT_CLASS_SESSIONS',
          actor: 'admin',
          payload: { count: sessions.length },
        },
      }),
    ]);

    return { imported: sessions.length, moduleId: activeModule.id };
  }

  async createTemplate(kind: string) {
    if (kind !== 'students' && kind !== 'sessions') {
      throw new BadRequestException('La plantilla debe ser students o sessions.');
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(kind === 'students' ? 'Estudiantes' : 'Fechas');
    if (kind === 'students') {
      sheet.addRow(['Número de registro', 'Nombre completo', 'Correo electrónico']);
      sheet.addRow(['DEMO1001', 'Ana García', 'ana.garcia@example.com']);
      sheet.addRow(['DEMO1002', 'Luis Mendoza', 'luis.mendoza@example.com']);
    } else {
      sheet.addRow(['Fecha', 'Hora inicio', 'Hora fin']);
      sheet.addRow([new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' }), '18:00', '21:00']);
    }
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    sheet.columns.forEach((column) => { column.width = 32; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async exportAttendance(filters: { date?: string; search?: string }) {
    const overview = await this.getAttendanceOverview(filters);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Asistencias');
    sheet.addRow(['Fecha', 'Número de registro', 'Nombre completo', 'Correo electrónico', 'Estado', 'Hora de marca (La Paz)']);
    for (const record of overview.records) {
      sheet.addRow([
        record.date, record.registrationCode, record.fullName, record.email,
        record.status === 'PRESENT' ? 'Presente' : record.status === 'ABSENT' ? 'Falta' : 'Pendiente',
        record.observedAt?.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz' }) ?? '',
      ]);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => { column.width = 30; });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'F1' };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async readExcelRows(file: ExcelUpload) {
    if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('Debes seleccionar un archivo Excel .xlsx válido.');
    }

    if (!file.originalname?.toLowerCase().endsWith('.xlsx') || file.buffer.subarray(0, 2).toString() !== 'PK') {
      throw new BadRequestException(
        'Formato no compatible. Guarda el archivo como Libro de Excel (*.xlsx) y vuelve a subirlo.',
      );
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.read(Readable.from([file.buffer]));
    } catch {
      throw new BadRequestException('No se pudo leer el archivo .xlsx. Ábrelo en Excel y guárdalo nuevamente.');
    }

    if (workbook.worksheets.length === 0) {
      throw new BadRequestException('El archivo .xlsx no contiene hojas con datos.');
    }

    const parsedRows: ExcelRow[] = [];
    for (const worksheet of workbook.worksheets) {
      const headerValues = worksheet.getRow(1).values;
      const headers = Array.isArray(headerValues) ? headerValues : [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1 || !Array.isArray(row.values)) {
          return;
        }

        const values = row.values.reduce((record, value, index) => {
          const headerText = AdminService.stringValue(headers[index]);
          if (headerText) {
            record[headerText] = value;
          }
          return record;
        }, {} as Record<string, unknown>);

        if (Object.values(values).some((value) => value !== null && value !== undefined && value !== '')) {
          parsedRows.push({ number: rowNumber, values });
        }
      });
    }

    return parsedRows;
  }

  private async getOrCreateActiveModule() {
    const activeModule = await this.prisma.academicModule.findFirst({ where: { active: true } });
    if (activeModule) {
      return activeModule;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return this.prisma.academicModule.create({
      data: {
        code: `MOD-${year}${month}-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: `Módulo ${year}-${month}`,
        active: true,
      },
    });
  }

  private toLaPazDate(date: string) {
    return new Date(`${date}T00:00:00.000-04:00`);
  }

  private toLaPazDateTime(date: string, time: string) {
    return new Date(`${date}T${time}:00-04:00`);
  }
}
