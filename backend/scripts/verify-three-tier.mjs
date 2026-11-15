import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { ProvisionerService } from '../dist/modules/platform/provisioner.service.js';
import { openSecret } from '../dist/modules/platform/platform-secrets.js';

const prisma = new PrismaClient();
const provisioner = new ProvisionerService(prisma);
const checks = [];
const sessions = [];
const record = (name, condition) => { if (!condition) throw new Error(name); checks.push({ name, passed: true }); console.log(`OK ${name}`); };
const sql = `SELECT json_build_object('students',(SELECT count(*) FROM "Student"),'sessions',(SELECT count(*) FROM "ClassSession"),'attendance',(SELECT count(*) FROM "Attendance"),'modules',(SELECT count(*) FROM "AcademicModule"))`;
async function json(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return payload;
}

try {
  const slug = process.argv.find((argument) => argument.startsWith('--slug='))?.slice(7);
  const tenants = await prisma.platformTenant.findMany({ where: { status: { not: 'DELETED' }, instanceId: { not: null }, ...(slug ? { slug } : {}) } });
  for (const tenant of tenants) {
    const resources = tenant.resources || [];
    record(`${tenant.slug}: tres instancias distintas`, tenant.architectureVersion === 2 && resources.length === 3 && new Set(resources.map((resource) => resource.instanceId)).size === 3);
    const instances = JSON.parse(await provisioner.aws(['ec2', 'describe-instances', '--instance-ids', ...resources.map((resource) => resource.instanceId)])).Reservations.flatMap((reservation) => reservation.Instances);
    for (const resource of resources) {
      const instance = instances.find((candidate) => candidate.InstanceId === resource.instanceId);
      record(`${tenant.slug}: nombre AWS de ${resource.role}`, instance.Tags.some((tag) => tag.Key === 'Name' && tag.Value === `${tenant.slug}-${resource.role}-${tenant.environment}`));
      record(`${tenant.slug}: estado AWS de ${resource.role}`, instance.State.Name === (tenant.status === 'SUSPENDED' ? 'stopped' : 'running'));
    }
    const groups = JSON.parse(await provisioner.aws(['ec2', 'describe-security-groups', '--group-ids', ...instances.flatMap((instance) => instance.SecurityGroups.map((group) => group.GroupId))])).SecurityGroups;
    record(`${tenant.slug}: sin API ni PostgreSQL expuestos a Internet`, groups.every((group) => group.IpPermissions.every((permission) => !(permission.IpRanges?.some((range) => range.CidrIp === '0.0.0.0/0') || permission.Ipv6Ranges?.some((range) => range.CidrIpv6 === '::/0')))));
    if (tenant.status === 'SUSPENDED') continue;
    const credentials = JSON.parse(openSecret(tenant.credentials));
    const session = await json(`${tenant.publicUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: tenant.contactEmail, password: credentials.adminPassword }) });
    record(`${tenant.slug}: acceso por correo del administrador`, session.user.role === 'admin');
    sessions.push({ slug: tenant.slug, url: tenant.publicUrl, token: session.accessToken });
    const metrics = await json(`${tenant.publicUrl}/monitoring/api/v1/query?query=${encodeURIComponent('up{job="node",role=~"frontend|backend|database"}')}`);
    record(`${tenant.slug}: Grafana/Prometheus monitorea tres nodos`, metrics.data.result.length === 3 && metrics.data.result.every((metric) => metric.value[1] === '1') && new Set(metrics.data.result.map((metric) => metric.metric.role)).size === 3);
    const databaseMetrics = await json(`${tenant.publicUrl}/monitoring/api/v1/query?query=pg_up`);
    record(`${tenant.slug}: PostgreSQL exporter disponible`, databaseMetrics.data.result.some((metric) => metric.value[1] === '1'));
    const frontend = resources.find((resource) => resource.role === 'frontend');
    const backend = resources.find((resource) => resource.role === 'backend');
    const database = resources.find((resource) => resource.role === 'database');
    for (const resource of [frontend, backend, database]) {
      const forbidden = resource.role === 'frontend' ? ':(3001|5432) ' : resource.role === 'backend' ? ':(3000|5432) ' : ':(3000|3001) ';
      const output = await provisioner.remote(resource.instanceId, [`if ss -ltn | grep -E '${forbidden}' >/dev/null; then echo MISPLACED; else echo ISOLATED; fi`]);
      record(`${tenant.slug}: servicio separado en ${resource.role}`, output.trim() === 'ISOLATED');
    }
    const output = await provisioner.remote(database.instanceId, [`printf %s '${Buffer.from(sql).toString('base64')}' | base64 -d | sudo -u postgres psql -d attendance -tA`]);
    const actual = JSON.parse(output.trim());
    const snapshot = tenant.migrationSnapshot;
    record(`${tenant.slug}: datos originales conservados`, snapshot && Object.entries(snapshot).every(([key, value]) => Number(actual[key]) >= Number(value)));
    const grafana = await json(`${tenant.publicUrl}/grafana/api/health`);
    record(`${tenant.slug}: Grafana operativo`, grafana.database === 'ok');
  }
  if (sessions.length >= 2) {
    const response = await fetch(`${sessions[1].url}/api/admin/students`, { headers: { Authorization: `Bearer ${sessions[0].token}` }, signal: AbortSignal.timeout(15000) });
    record(`${sessions[0].slug} no puede acceder a ${sessions[1].slug}`, response.status === 401);
  }
  await writeFile('../.runtime/three-tier-verification.json', JSON.stringify({ passed: true, at: new Date().toISOString(), checks }, null, 2));
} catch (error) {
  await writeFile('../.runtime/three-tier-verification.json', JSON.stringify({ passed: false, at: new Date().toISOString(), checks, error: error.message }, null, 2));
  console.error(error.message);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
