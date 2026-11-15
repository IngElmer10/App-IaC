import 'reflect-metadata';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe.sequential('MVP con PostgreSQL aislado', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let studentToken: string;
  let currentModuleId: string;
  let studentId: string;
  let todaySessionId: string;
  let pastSessionId: string;
  let futureSessionId: string;
  let platformToken: string;
  let platformTenantId: string;
  let platformPlanId: string;
  const schema = `mvp_e2e_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL;
  const originalPlatformEnabled = process.env.PLATFORM_ENABLED;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
  const relativeDate = (offset: number) => new Date(new Date(`${today}T12:00:00-04:00`).getTime() + offset * 86400000).toISOString().slice(0, 10);

  const workbookBuffer = async (headers: string[], rows: string[][]) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Datos');
    sheet.addRow(headers);
    sheet.addRows(rows);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  };

  beforeAll(async () => {
    if (!originalUrl) throw new Error('Configura DATABASE_URL en backend/.env para ejecutar las pruebas.');
    const url = new URL(originalUrl);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.SESSION_SECRET = 'mvp-e2e-isolated-test-secret';
    process.env.DEFAULT_ADMIN_PASSWORD = 'mvp-admin-test';
    process.env.DEFAULT_STUDENT_PASSWORD = 'mvp-student-test';
    process.env.PLATFORM_ENABLED = 'false';
    await promisify(execFile)(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: process.env });
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    process.env.PLATFORM_ENABLED = 'true';
    prisma = app.get(PrismaService);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'admin', password: 'mvp-admin-test' }).expect(201);
    adminToken = login.body.accessToken;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (originalUrl && /^mvp_e2e_[a-f0-9]{32}$/.test(schema)) {
      const cleanup = new PrismaClient({ datasourceUrl: originalUrl });
      try { await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await cleanup.$disconnect(); }
    }
    process.env.DATABASE_URL = originalUrl;
    process.env.PLATFORM_ENABLED = originalPlatformEnabled;
  });

  it('responde al health check y protege las rutas administrativas', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200).expect(({ body }) => expect(body.status).toBe('ok'));
    await request(app.getHttpServer()).get('/api/admin/students').expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'admin', password: 'wrong' }).expect(401);
  });

  it('crea un módulo vacío con auditoría', async () => {
    const response = await request(app.getHttpServer()).post('/api/modules/restart').auth(adminToken, { type: 'bearer' }).send({ name: 'Módulo de prueba MVP' }).expect(201);
    currentModuleId = response.body.id;
    expect(await prisma.academicModule.count({ where: { active: true } })).toBe(1);
  });

  it('descarga plantillas Excel válidas', async () => {
    for (const kind of ['students', 'sessions']) {
      await request(app.getHttpServer()).get(`/api/admin/templates/${kind}`).auth(adminToken, { type: 'bearer' }).expect(200).expect('Content-Type', /spreadsheetml/);
    }
  });

  it('importa estudiantes y permite buscar por nombre y registro', async () => {
    const buffer = await workbookBuffer(['Número de registro', 'Nombre completo', 'Correo electrónico'], [
      ['MVP1001', 'Ana Prueba', 'ana.mvp@example.com'], ['MVP1002', 'Luis Prueba', 'luis.mvp@example.com'],
    ]);
    await request(app.getHttpServer()).post('/api/admin/import/students').auth(adminToken, { type: 'bearer' }).attach('file', buffer, 'estudiantes.xlsx').expect(201).expect(({ body }) => expect(body.imported).toBe(2));
    const response = await request(app.getHttpServer()).get('/api/admin/students?search=Ana').auth(adminToken, { type: 'bearer' }).expect(200);
    expect(response.body).toHaveLength(1);
    studentId = response.body[0].id;
    await request(app.getHttpServer()).post('/api/admin/import/students').auth(adminToken, { type: 'bearer' }).attach('file', buffer, 'duplicados.xlsx').expect(400);
    expect(await prisma.student.count()).toBe(2);
  });

  it('rechaza un Excel inválido sin guardar parcialmente', async () => {
    const buffer = await workbookBuffer(['Número de registro', 'Nombre completo', 'Correo electrónico'], [['MVP2001', 'Alumno inválido', 'sin-correo']]);
    await request(app.getHttpServer()).post('/api/admin/import/students').auth(adminToken, { type: 'bearer' }).attach('file', buffer, 'invalido.xlsx').expect(400);
    expect(await prisma.student.count()).toBe(2);
  });

  it('importa fechas pasadas, actuales y futuras', async () => {
    const buffer = await workbookBuffer(['Fecha', 'Hora inicio', 'Hora fin'], [relativeDate(-1), today, relativeDate(1)].map((date) => [date, '18:00', '21:00']));
    await request(app.getHttpServer()).post('/api/admin/import/sessions').auth(adminToken, { type: 'bearer' }).attach('file', buffer, 'fechas.xlsx').expect(201);
    const sessions = await prisma.classSession.findMany({ orderBy: { date: 'asc' } });
    [pastSessionId, todaySessionId, futureSessionId] = sessions.map((session) => session.id);
  });

  it('autentica al estudiante por correo y limita su rol', async () => {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'ANA.MVP@example.com', password: 'mvp-student-test' }).expect(201);
    studentToken = response.body.accessToken;
    await request(app.getHttpServer()).get('/api/admin/dashboard').auth(studentToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get('/api/admin/access-settings').auth(studentToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get('/api/admin/access-settings').auth(adminToken, { type: 'bearer' }).expect(200).expect(({ body }) => expect(body.defaultStudentPassword).toBe('mvp-student-test'));
    await request(app.getHttpServer()).get('/api/student/MVP1002').auth(studentToken, { type: 'bearer' }).expect(403);
  });

  it('calcula faltas pasadas sin insertar marcas y mantiene futuras pendientes', async () => {
    const response = await request(app.getHttpServer()).get('/api/student/MVP1001').auth(studentToken, { type: 'bearer' }).expect(200);
    expect(response.body.absent).toBe(1);
    expect(response.body.marks.map((mark: { status: string }) => mark.status)).toEqual(['ABSENT', 'PENDING', 'PENDING']);
    expect(response.body.marks[1].canMark).toBe(true);
    expect(await prisma.attendance.count()).toBe(0);
  });

  it('rechaza marcas fuera de fecha y cuerpos inválidos', async () => {
    for (const sessionId of [pastSessionId, futureSessionId]) {
      await request(app.getHttpServer()).post('/api/attendance/mark').auth(studentToken, { type: 'bearer' }).send({ sessionId }).expect(403);
    }
    await request(app.getHttpServer()).post('/api/attendance/mark').auth(studentToken, { type: 'bearer' }).send({}).expect(400);
  });

  it('registra una sola asistencia aunque lleguen dos solicitudes simultáneas', async () => {
    const responses = await Promise.all([0, 1].map(() => request(app.getHttpServer()).post('/api/attendance/mark').auth(studentToken, { type: 'bearer' }).send({ sessionId: todaySessionId })));
    expect(responses.map((response) => response.status).sort((first, second) => first - second)).toEqual([201, 409]);
    expect(await prisma.attendance.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'STUDENT_MARKED_PRESENT' } })).toBe(1);
  });

  it('corrige una falta pasada y conserva los valores anterior y nuevo en auditoría', async () => {
    await request(app.getHttpServer()).put(`/api/admin/attendance/${pastSessionId}/${studentId}`).auth(adminToken, { type: 'bearer' }).send({ status: 'PRESENT' }).expect(200);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'ADMIN_CHANGED_ATTENDANCE' } });
    expect(audit?.payload).toMatchObject({ previousStatus: 'ABSENT', newStatus: 'PRESENT', registrationCode: 'MVP1001' });
    await request(app.getHttpServer()).put(`/api/admin/attendance/${pastSessionId}/${studentId}`).auth(studentToken, { type: 'bearer' }).send({ status: 'ABSENT' }).expect(403);
    const filtered = await request(app.getHttpServer()).get(`/api/admin/attendance?date=${today}&search=Ana`).auth(adminToken, { type: 'bearer' }).expect(200);
    expect(filtered.body.totals).toEqual({ present: 1, absent: 0, pending: 0 });
  });

  it('busca actividades por nombre y exporta los filtros a Excel', async () => {
    const response = await request(app.getHttpServer()).get('/api/admin/activities?search=Ana').auth(adminToken, { type: 'bearer' }).expect(200);
    expect(response.body.map((activity: { action: string }) => activity.action)).toContain('STUDENT_MARKED_PRESENT');
    expect(response.body.map((activity: { action: string }) => activity.action)).toContain('ADMIN_CHANGED_ATTENDANCE');
    await request(app.getHttpServer()).get('/api/admin/attendance/export?search=Ana').auth(adminToken, { type: 'bearer' }).expect(200).expect('Content-Type', /spreadsheetml/);
  });

  it('resume faltas calculadas, presentes y pendientes en el panel', async () => {
    const response = await request(app.getHttpServer()).get('/api/admin/dashboard').auth(adminToken, { type: 'bearer' }).expect(200);
    expect(response.body.attendanceToday).toBe(1);
    expect(response.body.overview).toEqual([{ label: 'Presentes', value: 2 }, { label: 'Faltas', value: 1 }, { label: 'Pendientes', value: 3 }]);
  });

  it('impide módulos activos y asistencias duplicadas desde PostgreSQL', async () => {
    await expect(prisma.academicModule.create({ data: { code: 'DUPLICATE', name: 'No válido', active: true } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.attendance.create({ data: { studentId, sessionId: todaySessionId, status: 'PRESENT' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('reinicia el módulo conservando los datos y bloqueando sesiones antiguas', async () => {
    await request(app.getHttpServer()).post('/api/modules/restart').auth(adminToken, { type: 'bearer' }).send({ name: 'Segundo módulo' }).expect(201);
    expect(await prisma.student.count({ where: { moduleId: currentModuleId } })).toBe(2);
    expect(await prisma.attendance.count()).toBe(2);
    await request(app.getHttpServer()).get('/api/admin/students').auth(adminToken, { type: 'bearer' }).expect(200).expect([]);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'MVP1001', password: 'mvp-student-test' }).expect(401);
    await request(app.getHttpServer()).post('/api/attendance/mark').auth(studentToken, { type: 'bearer' }).send({ sessionId: todaySessionId }).expect(404);
    await request(app.getHttpServer()).get(`/api/attendance/session/${todaySessionId}`).auth(adminToken, { type: 'bearer' }).expect(200).expect([]);
  });

  it('autentica al administrador de plataforma y separa sus permisos', async () => {
    process.env.PLATFORM_ADMIN_PASSWORD = 'platform-e2e-password';
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'platform', password: 'platform-e2e-password' }).expect(201);
    platformToken = login.body.accessToken;
    await request(app.getHttpServer()).get('/api/platform/overview').auth(adminToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get('/api/platform/overview').auth(studentToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get('/api/admin/students').auth(platformToken, { type: 'bearer' }).expect(403);
  });

  it('crea tenants con credenciales cifradas y trabajos persistidos sin desplegar durante los tests', async () => {
    const plan = await prisma.platformPlan.create({ data: { code: 'test-basic', name: 'Básico', description: 'Prueba', instanceType: 't3.small', vcpu: 2, memoryMb: 2048, storageGb: 20, maxStudents: 50, maxSessions: 50 } });
    platformPlanId = plan.id;
    const response = await request(app.getHttpServer()).post('/api/platform/tenants').auth(platformToken, { type: 'bearer' }).send({ name: 'Institución de prueba', slug: 'test-institucion', contactEmail: 'test@example.com', environment: 'dev', engine: 'terraform', planId: plan.id, adminPassword: 'owner-test-secret' }).expect(201);
    platformTenantId = response.body.id;
    expect(response.body.credentials).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('owner-test-secret');
    const stored = await prisma.platformTenant.findUniqueOrThrow({ where: { id: platformTenantId } });
    expect(stored.credentials).not.toContain('owner-test-secret');
    expect(await prisma.platformOperation.count({ where: { tenantId: platformTenantId, state: 'QUEUED' } })).toBe(1);
  });

  it('rechaza identificadores duplicados y dos operaciones activas para el mismo tenant', async () => {
    await request(app.getHttpServer()).post('/api/platform/tenants').auth(platformToken, { type: 'bearer' }).send({ name: 'Duplicada', slug: 'test-institucion', contactEmail: 'test2@example.com', environment: 'dev', engine: 'terraform', planId: platformPlanId, adminPassword: 'owner-test-secret' }).expect(409);
    await request(app.getHttpServer()).post(`/api/platform/tenants/${platformTenantId}/actions`).auth(platformToken, { type: 'bearer' }).send({ action: 'DEPLOY' }).expect(409);
    await request(app.getHttpServer()).post(`/api/platform/tenants/${platformTenantId}/actions`).auth(platformToken, { type: 'bearer' }).send({ action: 'DELETE', confirmation: 'otro-tenant' }).expect(400);
  });

  it('ofrece vista previa de recursos, filtros y edición auditada de planes', async () => {
    const preview = await request(app.getHttpServer()).get(`/api/platform/tenants/${platformTenantId}/preview?planId=${platformPlanId}`).auth(platformToken, { type: 'bearer' }).expect(200);
    expect(preview.body.changes).toHaveLength(6);
    const tenants = await request(app.getHttpServer()).get('/api/platform/tenants?environment=dev&search=instituci').auth(platformToken, { type: 'bearer' }).expect(200);
    expect(tenants.body).toHaveLength(1);
    await request(app.getHttpServer()).patch(`/api/platform/plans/${platformPlanId}`).auth(platformToken, { type: 'bearer' }).send({ name: 'Básico actualizado', maxStudents: 60, maxSessions: 60 }).expect(200);
    expect(await prisma.auditLog.count({ where: { entityId: platformPlanId, action: 'UPDATE_PLAN' } })).toBe(1);
  });

  it('reintenta una operación fallida sobre el mismo tenant y conserva la anterior', async () => {
    const previous = await prisma.platformOperation.findFirstOrThrow({ where: { tenantId: platformTenantId } });
    await prisma.platformOperation.update({ where: { id: previous.id }, data: { state: 'FAILED', error: 'Fallo de prueba' } });
    await request(app.getHttpServer()).post(`/api/platform/operations/${previous.id}/retry`).auth(platformToken, { type: 'bearer' }).expect(201);
    expect(await prisma.platformTenant.count()).toBe(1);
    expect(await prisma.platformOperation.count({ where: { tenantId: platformTenantId } })).toBe(2);
    const response = await request(app.getHttpServer()).get(`/api/platform/tenants/${platformTenantId}`).auth(platformToken, { type: 'bearer' }).expect(200);
    expect(response.body.operations.some((operation: { state: string }) => operation.state === 'FAILED')).toBe(true);
  });

  it('expone métricas reales de base de datos sin datos personales', async () => {
    const response = await request(app.getHttpServer()).get('/api/metrics').expect(200);
    expect(response.text).toContain('attendance_database_up 1');
    expect(response.text).not.toContain('ana.mvp@example.com');
  });

  it('recibe solicitudes públicas sin aprovisionar ni exponer la contraseña', async () => {
    const before = await prisma.platformOperation.count();
    const response = await request(app.getHttpServer()).post('/api/public/tenant-requests').send({ name: 'Universidad Solicitante', slug: 'solicitud-publica', contactEmail: 'docente@example.com', phone: '+591 70000000', adminPassword: 'request-owner-secret', planId: platformPlanId, engine: 'terraform', environment: 'dev', color: '#7c3aed' }).expect(202);
    expect(response.body.status).toBe('PENDING');
    expect(response.body.credentials).toBeUndefined();
    expect(await prisma.platformOperation.count()).toBe(before);
    expect(await prisma.platformTenant.count({ where: { slug: 'solicitud-publica' } })).toBe(0);
    const stored = await prisma.tenantRequest.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored.credentials).not.toContain('request-owner-secret');
    expect(stored.color).toBe('#7c3aed');
    await request(app.getHttpServer()).get('/api/platform/requests').expect(401);
    await request(app.getHttpServer()).get('/api/platform/requests').auth(adminToken, { type: 'bearer' }).expect(403);
    const inbox = await request(app.getHttpServer()).get('/api/platform/requests?status=PENDING').auth(platformToken, { type: 'bearer' }).expect(200);
    expect(inbox.body[0].credentials).toBeUndefined();
    expect(inbox.body[0].adminPassword).toBeUndefined();
  });

  it('reserva identificadores pendientes y valida teléfono, color y honeypot', async () => {
    const values = { name: 'Duplicada pública', slug: 'solicitud-publica', contactEmail: 'docente@example.com', phone: '+591 70000000', adminPassword: 'request-owner-secret', planId: platformPlanId, engine: 'terraform', environment: 'dev', color: '#059669' };
    await request(app.getHttpServer()).post('/api/public/tenant-requests').send(values).expect(409);
    await request(app.getHttpServer()).post('/api/platform/tenants').auth(platformToken, { type: 'bearer' }).send({ ...values, phone: undefined }).expect(409);
    for (const invalid of [{ phone: 'abc' }, { color: 'red' }, { website: 'spam.example.com' }, { phone: undefined }]) {
      await request(app.getHttpServer()).post('/api/public/tenant-requests').send({ ...values, slug: 'invalid-request', ...invalid }).expect(400);
    }
  });

  it('aprueba una sola vez ante dos revisiones simultáneas y crea tres recursos previstos', async () => {
    const pending = await prisma.tenantRequest.findFirstOrThrow({ where: { slug: 'solicitud-publica', status: 'PENDING' } });
    const reviews = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(`/api/platform/requests/${pending.id}/review`).auth(platformToken, { type: 'bearer' }).send({ decision: 'APPROVE' })));
    expect(reviews.map((response) => response.status).sort((left, right) => left - right)).toEqual([201, 409]);
    const tenant = await prisma.platformTenant.findUniqueOrThrow({ where: { slug: pending.slug } });
    expect(tenant.architectureVersion).toBe(2);
    expect(tenant.color).toBe('#7c3aed');
    expect(tenant.contactPhone).toBe('+591 70000000');
    expect(await prisma.platformOperation.count({ where: { tenantId: tenant.id } })).toBe(1);
    expect((await prisma.tenantRequest.findUniqueOrThrow({ where: { id: pending.id } })).credentials).toBeNull();
  });

  it('rechaza con motivo, elimina la contraseña y permite volver a solicitar', async () => {
    const values = { name: 'Instituto Revisión', slug: 'solicitud-rechazo', contactEmail: 'revision@example.com', phone: '70000000', adminPassword: 'request-owner-secret', planId: platformPlanId, engine: 'cloudformation', environment: 'staging' };
    const response = await request(app.getHttpServer()).post('/api/public/tenant-requests').send(values).expect(202);
    await request(app.getHttpServer()).post(`/api/platform/requests/${response.body.id}/review`).auth(platformToken, { type: 'bearer' }).send({ decision: 'REJECT' }).expect(400);
    await request(app.getHttpServer()).post(`/api/platform/requests/${response.body.id}/review`).auth(platformToken, { type: 'bearer' }).send({ decision: 'REJECT', reason: 'Datos de contacto incompletos' }).expect(201);
    expect((await prisma.tenantRequest.findUniqueOrThrow({ where: { id: response.body.id } })).credentials).toBeNull();
    expect(await prisma.platformTenant.count({ where: { slug: values.slug } })).toBe(0);
    await request(app.getHttpServer()).post('/api/public/tenant-requests').send(values).expect(202);
  });
});
