import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { openSecret, studentPasswordFor } from '../dist/modules/platform/platform-secrets.js';

const accessPath = resolve('../.runtime/demo-access.json');
const access = JSON.parse(await readFile(accessPath, 'utf8'));
const prisma = new PrismaClient();
try {
  for (const entry of access) {
    const tenant = await prisma.platformTenant.findUniqueOrThrow({ where: { id: entry.id } });
    const credentials = JSON.parse(openSecret(tenant.credentials));
    entry.studentPassword = studentPasswordFor(credentials.sessionSecret);
    entry.studentUsername = '1002';
    entry.adminPassword = credentials.adminPassword;
    entry.publicUrl = tenant.publicUrl;
    entry.grafanaUrl = tenant.publicUrl ? `${tenant.publicUrl}/grafana/d/attendance-tenant` : null;
  }
  await writeFile(accessPath, JSON.stringify(access, null, 2), { mode: 0o600 });
  console.log('Archivo privado de accesos actualizado. Las contraseñas de administrador y estudiantes son diferentes.');
} finally { await prisma.$disconnect(); }
