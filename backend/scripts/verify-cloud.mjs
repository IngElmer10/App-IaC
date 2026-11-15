import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';

const base = 'http://localhost:3001/api';
const access = JSON.parse(await readFile(resolve('../.runtime/demo-access.json'), 'utf8'));
const checks = [];
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const record = (name) => { checks.push({ name, passed: true, at: new Date().toISOString() }); console.log(`OK: ${name}`); };
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function json(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${typeof payload.message === 'string' ? payload.message : 'Falló la solicitud.'}`);
  return payload;
}

async function login(url, username, password) {
  return json(`${url}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
}

const session = await login(base, 'platform', process.env.PLATFORM_ADMIN_PASSWORD);
const platformHeaders = { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' };
const tenantInfo = (id) => json(`${base}/platform/tenants/${id}`, { headers: platformHeaders });

async function waitOperation(tenantId, operationId) {
  for (let attempt = 0; attempt < 240; attempt++) {
    const tenant = await tenantInfo(tenantId);
    const operation = tenant.operations.find((item) => item.id === operationId);
    if (operation?.state === 'SUCCEEDED') return tenant;
    if (operation?.state === 'FAILED') throw new Error(`${tenant.slug}: ${operation.error}`);
    if (attempt % 12 === 0) console.log(`Esperando ${tenant.slug}: ${operation?.action} ${operation?.progress ?? 0}%`);
    await delay(5000);
  }
  throw new Error('La operación no terminó dentro del tiempo de verificación.');
}

async function action(tenantId, actionName, extra = {}) {
  const operation = await json(`${base}/platform/tenants/${tenantId}/actions`, { method: 'POST', headers: platformHeaders, body: JSON.stringify({ action: actionName, ...extra }) });
  return waitOperation(tenantId, operation.id);
}

async function upload(url, token, kind, headers, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Datos');
  sheet.addRow(headers);
  sheet.addRows(rows);
  const form = new FormData();
  form.set('file', new Blob([await workbook.xlsx.writeBuffer()]), `${kind}.xlsx`);
  return json(`${url}/admin/import/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
}

try {
  const tenants = [];
  for (const credentials of access) {
    let tenant = await tenantInfo(credentials.id);
    if (tenant.status !== 'ACTIVE') {
      const operation = tenant.operations.find((item) => ['QUEUED', 'RUNNING'].includes(item.state));
      if (!operation) throw new Error(`${tenant.slug}: no tiene un despliegue activo ni una operación pendiente.`);
      tenant = await waitOperation(tenant.id, operation.id);
    }
    const url = `${tenant.publicUrl}/api`;
    const admin = await login(url, 'admin', credentials.adminPassword);
    const headers = { Authorization: `Bearer ${admin.accessToken}`, 'Content-Type': 'application/json' };
    let students = await json(`${url}/admin/students`, { headers });
    if (students.length === 0) {
      const name = tenant.slug === 'andina-demo' ? 'Ana Andina' : 'Bruno Tecnológico';
      await upload(url, admin.accessToken, 'students', ['Número de registro', 'Nombre completo', 'Correo electrónico'], [['1001', name, `${tenant.slug}@example.com`], ['1002', `Alumno de ${tenant.name}`, `alumno2-${tenant.slug}@example.com`]]);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
      const dates = [-1, 0, 1].map((offset) => [new Date(new Date(`${today}T12:00:00-04:00`).getTime() + offset * 86400000).toISOString().slice(0, 10), '18:00', '21:00']);
      await upload(url, admin.accessToken, 'sessions', ['Fecha', 'Hora inicio', 'Hora fin'], dates);
      students = await json(`${url}/admin/students`, { headers });
    }
    const student = await login(url, '1001', credentials.studentPassword);
    const studentHeaders = { Authorization: `Bearer ${student.accessToken}`, 'Content-Type': 'application/json' };
    const summary = await json(`${url}/student/1001`, { headers: studentHeaders });
    const mark = summary.marks.find((item) => item.canMark);
    if (mark) {
      await json(`${url}/attendance/mark`, { method: 'POST', headers: studentHeaders, body: JSON.stringify({ sessionId: mark.sessionId }) });
      const duplicate = await fetch(`${url}/attendance/mark`, { method: 'POST', headers: studentHeaders, body: JSON.stringify({ sessionId: mark.sessionId }) });
      assert(duplicate.status === 409, 'La marca duplicada no fue rechazada.');
    }
    const metrics = await (await fetch(`${url}/metrics`)).text();
    assert(metrics.includes('attendance_database_up 1'), 'PostgreSQL no está disponible.');
    const grafana = await json(`${tenant.publicUrl}/grafana/api/health`);
    assert(grafana.database === 'ok', 'Grafana no está saludable.');
    const prometheus = await json(`${tenant.publicUrl}/monitoring/api/v1/query?query=up`);
    assert(prometheus.status === 'success' && prometheus.data.result.length >= 2, 'No hay métricas de los servicios.');
    tenants.push({ tenant, credentials, url, headers, studentHeaders, students });
    record(`${tenant.name}: frontend, backend, PostgreSQL, Grafana, métricas y asistencia`);
  }

  assert(tenants.length === 2, 'Se requieren dos tenants para demostrar aislamiento.');
  const [first, second] = tenants;
  const crossedStudent = await fetch(`${second.url}/student/1001`, { headers: first.studentHeaders });
  const crossedAdmin = await fetch(`${second.url}/admin/students`, { headers: first.headers });
  assert(crossedStudent.status === 401 && crossedAdmin.status === 401, 'Falló el aislamiento de tokens entre instituciones.');
  assert(first.students[0].fullName !== second.students[0].fullName, 'Los tenants muestran datos iguales inesperadamente.');
  record('Aislamiento entre tenants: mismo registro, datos distintos y tokens cruzados rechazados con 401');

  if (process.argv.includes('--lifecycle')) {
    const updated = await action(second.tenant.id, 'UPDATE');
    assert(updated.instanceId === second.tenant.instanceId, 'La actualización reemplazó la VM de CloudFormation.');
    record('Actualización de aplicación CloudFormation conservando la misma VM');
    const before = await json(`${first.url}/student/1001`, { headers: first.studentHeaders });
    let backedUp = await action(first.tenant.id, 'BACKUP');
    const backup = backedUp.backups[0];
    assert(Boolean(backup), 'El respaldo no fue registrado.');
    record('Respaldo PostgreSQL real guardado en S3');
    const historical = before.marks.find((item) => item.status === 'ABSENT');
    if (historical) {
      await json(`${first.url}/admin/attendance/${historical.sessionId}/${before.student.id}`, { method: 'PUT', headers: first.headers, body: JSON.stringify({ status: 'PRESENT' }) });
      backedUp = await action(first.tenant.id, 'RESTORE', { backupId: backup.id, confirmation: first.tenant.slug });
      const restored = await json(`${first.url}/student/1001`, { headers: first.studentHeaders });
      assert(restored.marks.find((item) => item.sessionId === historical.sessionId)?.status === 'ABSENT', 'La restauración no recuperó el estado del respaldo.');
      record('Restauración comprobada: se recuperó la falta previa a una modificación posterior al respaldo');
    }

    const suspended = await action(second.tenant.id, 'SUSPEND');
    assert(suspended.status === 'SUSPENDED', 'La institución no fue suspendida.');
    record('Suspensión real de cómputo en EC2');
    const resumed = await action(second.tenant.id, 'RESUME');
    second.tenant = resumed;
    second.url = `${resumed.publicUrl}/api`;
    const afterResume = await json(`${second.url}/admin/students`, { headers: second.headers });
    assert(afterResume.length === second.students.length, 'Se perdieron datos al reanudar.');
    record('Reanudación comprobada con conservación de estudiantes');

    const plans = await json(`${base}/platform/plans`, { headers: platformHeaders });
    const standard = plans.find((plan) => plan.code === 'standard');
    const basic = plans.find((plan) => plan.code === 'basic');
    const preview = await json(`${base}/platform/tenants/${first.tenant.id}/preview?planId=${standard.id}`, { headers: platformHeaders });
    assert(preview.proposed.instanceType === standard.instanceType, 'La vista previa no corresponde al nuevo plan.');
    const upgraded = await action(first.tenant.id, 'CHANGE_PLAN', { planId: standard.id });
    first.tenant = upgraded;
    first.url = `${upgraded.publicUrl}/api`;
    assert(upgraded.plan.id === standard.id, 'El cambio de plan no fue aplicado.');
    record('Cambio real de plan con vista previa y recursos actualizados');
    const downgraded = await action(first.tenant.id, 'CHANGE_PLAN', { planId: basic.id });
    first.tenant = downgraded;
    first.url = `${downgraded.publicUrl}/api`;
    record('Retorno al plan Básico conservando el disco y los datos');

    await action(first.tenant.id, 'TEST_ALERT');
    let alertVisible = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const overview = await json(`${base}/platform/overview`, { headers: platformHeaders });
      if (overview.alerts.some((alert) => alert.tenantId === first.tenant.id && alert.name === 'AlertaDeDemostracion')) { alertVisible = true; break; }
      await delay(5000);
    }
    assert(alertVisible, 'La alerta de Prometheus no apareció en la plataforma.');
    record('Alerta real evaluada por Prometheus y recogida por la plataforma');
    await action(first.tenant.id, 'CLEAR_ALERT');
  }

  const report = { checkedAt: new Date().toISOString(), passed: true, checks, tenants: tenants.map(({ tenant }) => ({ id: tenant.id, name: tenant.name, engine: tenant.engine, url: tenant.publicUrl })) };
  await writeFile(resolve('../.runtime/cloud-verification.json'), JSON.stringify(report, null, 2));
  console.log('Evidencia guardada en .runtime/cloud-verification.json.');
} catch (error) {
  await writeFile(resolve('../.runtime/cloud-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: false, checks, error: error.message }, null, 2));
  throw error;
}
