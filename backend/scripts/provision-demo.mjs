import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { openSecret, studentPasswordFor } from '../dist/modules/platform/platform-secrets.js';

if (!process.argv.includes('--confirm-costs')) throw new Error('Este comando crea recursos facturables. Agrega --confirm-costs después de autorizar el despliegue.');
const base = 'http://localhost:3001/api';
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'platform', password: process.env.PLATFORM_ADMIN_PASSWORD }) });
const session = await login.json();
if (!login.ok) throw new Error('No fue posible ingresar como administrador de plataforma.');
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` };
const plans = await (await fetch(`${base}/platform/plans`, { headers })).json();
const existing = await (await fetch(`${base}/platform/tenants`, { headers })).json();
let access = [];
try { access = JSON.parse(await readFile(resolve('../.runtime/demo-access.json'), 'utf8')); } catch {}
for (const [slug, name, code, engine] of [['andina-demo', 'Universidad Andina', 'basic', 'terraform'], ['tecnologica-demo', 'Instituto Tecnológico', 'standard', 'cloudformation']]) {
  if (existing.some((tenant) => tenant.slug === slug)) { console.log(`${slug} ya existe; no se creará otro tenant.`); continue; }
  const password = randomBytes(12).toString('hex');
  const response = await fetch(`${base}/platform/tenants`, { method: 'POST', headers, body: JSON.stringify({ slug, name, contactEmail: `${slug}@example.com`, environment: 'dev', engine, planId: plans.find((plan) => plan.code === code).id, adminPassword: password }) });
  const tenant = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(tenant));
  const prisma = new PrismaClient();
  let studentPassword;
  try {
    const stored = await prisma.platformTenant.findUniqueOrThrow({ where: { id: tenant.id } });
    studentPassword = studentPasswordFor(JSON.parse(openSecret(stored.credentials)).sessionSecret);
  } finally { await prisma.$disconnect(); }
  access.push({ id: tenant.id, slug, name, engine, adminUsername: 'admin', adminPassword: password, studentPassword });
  console.log(`${name}: solicitud de despliegue registrada (${engine}, plan ${code}).`);
}
if (access.length) {
  await mkdir(resolve('../.runtime'), { recursive: true });
  await writeFile(resolve('../.runtime/demo-access.json'), JSON.stringify(access, null, 2), { mode: 0o600 });
  console.log('Credenciales de las instituciones guardadas localmente en .runtime/demo-access.json; no se publican en el repositorio.');
}
