import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

if (!process.env.DATABASE_URL) throw new Error('Configura backend/.env antes de preparar la demostración.');
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', 'mvp_demo');
const databaseUrl = url.toString();
execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit',
});

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
const relativeDate = (offset) => new Date(new Date(`${today}T12:00:00-04:00`).getTime() + offset * 86400000).toISOString().slice(0, 10);
const demoStudents = [
  ['DEMO1001', 'Ana García', 'ana.garcia@example.com'],
  ['DEMO1002', 'Luis Mendoza', 'luis.mendoza@example.com'],
  ['DEMO1003', 'Carla Flores', 'carla.flores@example.com'],
  ['DEMO1004', 'Diego Rojas', 'diego.rojas@example.com'],
  ['DEMO1005', 'Lucía Vargas', 'lucia.vargas@example.com'],
  ['DEMO1006', 'Mateo Quispe', 'mateo.quispe@example.com'],
];

try {
  let module = await prisma.academicModule.findFirst({ where: { active: true } });
  if (!module) {
    module = await prisma.academicModule.create({ data: { code: `DEMO-${Date.now()}`, name: 'Módulo de demostración', active: true } });
    await prisma.auditLog.create({ data: { entity: 'AcademicModule', entityId: module.id, action: 'ACTIVATE_NEW_MODULE', actor: 'admin', payload: { name: module.name } } });
  }
  const students = [];
  for (const [registrationCode, fullName, email] of demoStudents) {
    students.push(await prisma.student.upsert({
      where: { moduleId_registrationCode: { moduleId: module.id, registrationCode } },
      create: { moduleId: module.id, registrationCode, fullName, email }, update: {},
    }));
  }
  const sessions = [];
  for (const offset of [-3, -2, -1, 0, 1, 2]) {
    const date = relativeDate(offset);
    sessions.push(await prisma.classSession.upsert({
      where: { moduleId_date: { moduleId: module.id, date: new Date(`${date}T00:00:00-04:00`) } },
      create: { moduleId: module.id, title: `Clase ${date}`, date: new Date(`${date}T00:00:00-04:00`), startTime: new Date(`${date}T18:00:00-04:00`), endTime: new Date(`${date}T21:00:00-04:00`) }, update: {},
    }));
  }
  for (const [sessionIndex, studentIndexes] of [[0, [0, 1, 3, 4]], [1, [0, 2, 3, 5]], [2, [1, 2, 4, 5]]]) {
    for (const studentIndex of studentIndexes) {
      const student = students[studentIndex];
      const session = sessions[sessionIndex];
      const existing = await prisma.attendance.findUnique({ where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } } });
      if (!existing) {
        await prisma.$transaction(async (transaction) => {
          const attendance = await transaction.attendance.create({ data: { sessionId: session.id, studentId: student.id, status: 'PRESENT', observedAt: session.startTime } });
          await transaction.auditLog.create({ data: { entity: 'Attendance', entityId: attendance.id, action: 'STUDENT_MARKED_PRESENT', actor: student.registrationCode, createdAt: session.startTime, payload: { sessionId: session.id, studentId: student.id, registrationCode: student.registrationCode, status: 'PRESENT' } } });
        });
      }
    }
  }
  const secret = randomBytes(32).toString('hex');
  await writeFile('.env.demo.local', [
    `DATABASE_URL=${JSON.stringify(databaseUrl)}`, 'PORT=3001', 'FRONTEND_URL=http://localhost:3000',
    'TZ=America/La_Paz', `SESSION_SECRET=${secret}`, 'DEFAULT_ADMIN_PASSWORD=admin123', 'DEFAULT_STUDENT_PASSWORD=12345678', '',
  ].join('\n'));
  const examplesPath = resolve('../demo');
  await mkdir(examplesPath, { recursive: true });
  for (const [filename, headers, rows] of [
    ['estudiantes.xlsx', ['Número de registro', 'Nombre completo', 'Correo electrónico'], [['DEMO2001', 'Sofía Pérez', 'sofia.perez@example.com'], ['DEMO2002', 'Juan López', 'juan.lopez@example.com']]],
    ['fechas.xlsx', ['Fecha', 'Hora inicio', 'Hora fin'], [[relativeDate(3), '18:00', '21:00'], [relativeDate(4), '18:00', '21:00']]],
  ]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Datos');
    sheet.addRow(headers);
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => { column.width = 32; });
    await workbook.xlsx.writeFile(resolve(examplesPath, filename));
  }
  console.log(`Demostración preparada para ${today}. Esquema aislado: mvp_demo. Tus datos originales se conservan.`);
  console.log('Administrador: admin / admin123. Estudiante: DEMO1001 / 12345678.');
} finally {
  await prisma.$disconnect();
}
