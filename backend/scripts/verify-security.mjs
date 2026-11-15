import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';

const access = JSON.parse(await readFile(resolve('../.runtime/demo-access.json'), 'utf8'));
const checks = [];
const check = (condition, name) => { if (!condition) throw new Error(name); checks.push({ name, passed: true }); console.log(`OK: ${name}`); };
const login = async (base, username, password) => {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return { status: response.status, body: await response.json() };
};
const platform = await login('http://localhost:3001/api', 'platform', process.env.PLATFORM_ADMIN_PASSWORD);
const headers = { Authorization: `Bearer ${platform.body.accessToken}` };
const overview = await (await fetch('http://localhost:3001/api/platform/overview', { headers })).json();

const aws = (args) => JSON.parse(execFileSync(process.platform === 'win32' ? 'aws.exe' : 'aws', [...args, '--profile', process.env.AWS_PROFILE || 'iac', '--region', process.env.AWS_REGION || 'us-east-1', '--output', 'json'], { encoding: 'utf8', env: { ...process.env, AWS_CLI_OUTPUT_ENCODING: 'UTF-8' } }));
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

for (const credentials of access) {
  const tenant = overview.tenants.find((item) => item.id === credentials.id);
  const base = `${tenant.publicUrl}/api`;
  const admin = await login(base, 'admin', credentials.adminPassword);
  const student = await login(base, '1001', credentials.studentPassword);
  const escalation = await login(base, 'admin', credentials.studentPassword);
  check(admin.status === 201 && student.status === 201 && escalation.status === 401, `${tenant.name}: contraseñas y permisos separados entre administrador y estudiante`);
  const studentSettings = await fetch(`${base}/admin/access-settings`, { headers: { Authorization: `Bearer ${student.body.accessToken}` } });
  check(studentSettings.status === 403, `${tenant.name}: el estudiante no puede leer la configuración administrativa`);
  const root = await (await fetch(base)).json();
  check(root.version === '0.2.0', `${tenant.name}: aplicación 0.2.0 desplegada`);

  if (tenant.plan.code === 'basic') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Estudiantes');
    sheet.addRow(['Número de registro', 'Nombre completo', 'Correo electrónico']);
    for (let index = 0; index < tenant.plan.maxStudents; index++) sheet.addRow([`LIMIT${index}`, `Alumno ${index}`, `limit${index}@example.com`]);
    const form = new FormData();
    form.set('file', new Blob([await workbook.xlsx.writeBuffer()]), 'limite.xlsx');
    const adminHeaders = { Authorization: `Bearer ${admin.body.accessToken}` };
    const before = await (await fetch(`${base}/admin/students`, { headers: adminHeaders })).json();
    const response = await fetch(`${base}/admin/import/students`, { method: 'POST', headers: adminHeaders, body: form });
    const after = await (await fetch(`${base}/admin/students`, { headers: adminHeaders })).json();
    check(response.status === 400 && before.length === after.length, `${tenant.name}: el límite del plan rechaza la importación completa sin guardar parcialmente`);
  }

  const other = access.find((item) => item.id !== tenant.id);
  if (!/^[a-z0-9]+$/.test(other.id)) throw new Error('Identificador de prueba inválido.');
  const command = aws(['ssm', 'send-command', '--instance-ids', tenant.instanceId, '--document-name', 'AWS-RunShellScript', '--parameters', JSON.stringify({ commands: [
    `if aws ssm get-parameter --name /tenantforge/mvp/${other.id}/environment --query Parameter.Name --output text --region ${process.env.AWS_REGION || 'us-east-1'} >/tmp/cross-tenant-name 2>/tmp/cross-tenant-error; then echo ISOLATION_FAILED; exit 1; fi`,
    'grep -q AccessDenied /tmp/cross-tenant-error && echo ISOLATION_OK',
  ] })]);
  let success = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    await delay(3000);
    let invocation;
    try { invocation = aws(['ssm', 'get-command-invocation', '--command-id', command.Command.CommandId, '--instance-id', tenant.instanceId]); } catch { continue; }
    if (invocation.Status === 'Success') { success = invocation.StandardOutputContent.includes('ISOLATION_OK'); break; }
    if (invocation.Status === 'Failed') break;
  }
  check(success, `${tenant.name}: su rol IAM no puede leer el secreto SSM de la otra institución`);
}

await writeFile(resolve('../.runtime/security-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, checks }, null, 2));
console.log('Verificación de permisos y cuotas guardada en .runtime/security-verification.json.');
