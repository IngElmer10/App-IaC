import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('..');
const runtime = resolve(root, '.runtime');
await mkdir(runtime, { recursive: true });
if (!process.env.DATABASE_URL) throw new Error('Configura DATABASE_URL en backend/.env.');
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.searchParams.set('schema', 'platform_mvp');
const profile = process.env.AWS_PROFILE || 'iac';
const region = process.env.AWS_REGION || 'us-east-1';
const awsBinary = process.platform === 'win32' ? 'aws.exe' : 'aws';
const aws = (args) => execFileSync(awsBinary, [...args, '--profile', profile, '--region', region, '--output', 'json'], { encoding: 'utf8' }).trim();
const identity = JSON.parse(aws(['sts', 'get-caller-identity']));
const artifactBucket = process.env.PLATFORM_ARTIFACT_BUCKET || `tf-tenantforge-demo-dev-${identity.Account}-transport`;
const stateBucket = process.env.PLATFORM_STATE_BUCKET || `tf-tenantforge-demo-dev-${identity.Account}-state`;
const publicIp = (await (await fetch('https://checkip.amazonaws.com')).text()).trim();
if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(publicIp)) throw new Error('No se pudo determinar la IP para restringir el acceso.');
const artifact = resolve(runtime, 'application.tar.gz');
execFileSync('tar', ['-czf', artifact, '--exclude=node_modules', '--exclude=.next', '--exclude=dist', '--exclude=.env*', '--exclude=*.log', '--exclude=.terraform', '--exclude=*.tfstate*', '--exclude=coverage', '--exclude=test-results', '--exclude=playwright-report', 'backend', 'frontend', 'infrastructure'], { cwd: root, stdio: 'inherit' });
const digest = createHash('sha256').update(await readFile(artifact)).digest('hex');
const key = `mvp/artifacts/application-${digest.slice(0, 16)}.tar.gz`;
if (process.argv.includes('--publish')) {
  aws(['s3api', 'head-bucket', '--bucket', artifactBucket]);
  aws(['s3api', 'head-bucket', '--bucket', stateBucket]);
  aws(['s3api', 'put-object', '--bucket', artifactBucket, '--key', key, '--body', artifact, '--server-side-encryption', 'AES256']);
  console.log('Paquete de aplicación publicado en S3. No se crearon instancias.');
}
execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: databaseUrl.toString() }, stdio: 'inherit' });
let existing = '';
try { existing = await readFile('.env.platform.local', 'utf8'); } catch {}
const existingSecret = existing.match(/^SESSION_SECRET=(.*)$/m)?.[1];
const existingAdminPassword = existing.match(/^PLATFORM_ADMIN_PASSWORD=(.*)$/m)?.[1];
const secret = existingSecret || process.env.SESSION_SECRET || randomBytes(32).toString('hex');
await writeFile('.env.platform.local', [
  `DATABASE_URL=${JSON.stringify(databaseUrl.toString())}`, `SESSION_SECRET=${secret}`, 'PORT=3001',
  'FRONTEND_URL=http://localhost:3000', 'TZ=America/La_Paz', 'PLATFORM_ENABLED=true',
  `PLATFORM_ADMIN_PASSWORD=${process.env.PLATFORM_ADMIN_PASSWORD || existingAdminPassword || 'platform123'}`,
  `AWS_PROFILE=${profile}`, `AWS_REGION=${region}`, `PLATFORM_ARTIFACT_BUCKET=${artifactBucket}`,
  `PLATFORM_ARTIFACT_KEY=${key}`, `PLATFORM_STATE_BUCKET=${stateBucket}`, `PLATFORM_ALLOWED_CIDR=${publicIp}/32`,
  '',
].join('\n'), { mode: 0o600 });
console.log('Plataforma preparada en el esquema platform_mvp. Los datos de asistencia existentes permanecen intactos.');
console.log(`IP de presentación autorizada: ${publicIp}/32. Perfil AWS: ${profile}.`);
console.log('Acceso local: platform / platform123 (salvo contraseña personalizada en el entorno).');
