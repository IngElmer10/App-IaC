import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
try {
  const plans = await prisma.platformPlan.findMany({ where: { active: true }, orderBy: { maxStudents: 'asc' } });
  const tenants = await prisma.platformTenant.findMany({ where: { status: { not: 'DELETED' } }, select: { slug: true, name: true, engine: true, environment: true, status: true, architectureVersion: true, resources: true, deployedVersion: true } });
  const operations = await prisma.platformOperation.findMany({ where: { state: 'SUCCEEDED' }, orderBy: { createdAt: 'desc' }, take: 12, select: { action: true, state: true, appVersion: true, templateVersion: true, toolVersion: true, createdAt: true, finishedAt: true } });
  const frontend = JSON.parse(await readFile(resolve(root, 'frontend/package-lock.json'), 'utf8'));
  const backend = JSON.parse(await readFile(resolve(root, 'backend/package-lock.json'), 'utf8'));
  const versions = Object.fromEntries([
    ['Next.js', frontend.packages['node_modules/next'].version], ['React', frontend.packages['node_modules/react'].version],
    ['NestJS', backend.packages['node_modules/@nestjs/core'].version], ['Prisma', backend.packages['node_modules/@prisma/client'].version],
    ['Tailwind CSS', frontend.packages['node_modules/tailwindcss'].version], ['Zod', frontend.packages['node_modules/zod'].version],
    ['React Hook Form', frontend.packages['node_modules/react-hook-form'].version], ['Vitest', backend.packages['node_modules/vitest'].version],
    ['Playwright', frontend.packages['node_modules/@playwright/test'].version],
  ]);
  await mkdir(resolve(root, '.runtime/documentation'), { recursive: true });
  await writeFile(resolve(root, '.runtime/documentation/snapshot.json'), JSON.stringify({ at: new Date().toISOString(), repository: 'https://github.com/IngElmer10/App-IaC.git', plans, tenants, operations, versions }, null, 2));
  console.log(`Instantánea sin credenciales: ${plans.length} planes, ${tenants.length} tenants.`);
} finally { await prisma.$disconnect(); }
