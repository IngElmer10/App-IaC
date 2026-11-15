import { writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:3001/api';
const headers = { 'Content-Type': 'application/json' };
const results = [];
const pause = (milliseconds) => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));

async function json(path, options = {}) {
  const response = await fetch(`${base}/${path}`, { headers, signal: AbortSignal.timeout(15000), ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
  return payload;
}

async function action(tenant, name) {
  const operation = await json(`platform/tenants/${tenant.id}/actions`, { method: 'POST', body: JSON.stringify({ action: name, ...(name === 'MIGRATE' ? { confirmation: tenant.slug } : {}) }) });
  for (let attempt = 0; attempt < 360; attempt++) {
    const current = await json(`platform/tenants/${tenant.id}`);
    const job = current.operations.find((candidate) => candidate.id === operation.id);
    if (job?.state === 'SUCCEEDED') return current;
    if (job?.state === 'FAILED') throw new Error(`${tenant.slug}: ${job.error}`);
    if (attempt % 12 === 0) console.log(`${tenant.slug}: ${name} ${job?.progress || 0}%`);
    await pause(5000);
  }
  throw new Error(`${tenant.slug}: tiempo máximo de espera.`);
}

try {
  if (!process.argv.includes('--execute')) throw new Error('Usa --execute para migrar los tenants existentes; se crearán recursos facturables.');
  const session = await json('auth/login', { method: 'POST', body: JSON.stringify({ username: 'platform', password: process.env.PLATFORM_ADMIN_PASSWORD }) });
  headers.Authorization = `Bearer ${session.accessToken}`;
  const overview = await json('platform/overview');
  const tenants = overview.tenants.filter((tenant) => tenant.architectureVersion < 2 && tenant.instanceId).sort((left, right) => Number(right.status === 'SUSPENDED') - Number(left.status === 'SUSPENDED'));
  for (const original of tenants) {
    const suspended = original.status === 'SUSPENDED';
    let tenant = original;
    try {
      if (suspended) tenant = await action(tenant, 'RESUME');
      tenant = await action(tenant, 'MIGRATE');
      if (tenant.resources?.length !== 3) throw new Error('No se encontraron tres instancias.');
      let monitored = false;
      for (let attempt = 0; attempt < 18; attempt++) {
        const response = await fetch(`${tenant.publicUrl}/monitoring/api/v1/query?query=${encodeURIComponent('up{job="node",role=~"frontend|backend|database"}')}`, { signal: AbortSignal.timeout(15000) });
        const metrics = await response.json();
        if (metrics.data?.result?.filter((metric) => metric.value[1] === '1').length === 3) { monitored = true; break; }
        await pause(5000);
      }
      if (!monitored) throw new Error('Las tres instancias no aparecieron en Prometheus.');
      results.push({ slug: tenant.slug, passed: true, instances: tenant.resources.map((resource) => ({ role: resource.role, instanceId: resource.instanceId })), monitored: 3 });
      console.log(`OK ${tenant.slug}: tres instancias, datos verificados y tres exporters disponibles.`);
    } finally {
      if (suspended) {
        const current = await json(`platform/tenants/${original.id}`);
        if (current.status !== 'SUSPENDED') await action(current, 'SUSPEND');
        console.log(`${original.slug}: se conservó el estado SUSPENDED original.`);
      }
    }
  }
  await writeFile('../.runtime/three-tier-migrations.json', JSON.stringify({ passed: true, at: new Date().toISOString(), results }, null, 2));
} catch (error) {
  await writeFile('../.runtime/three-tier-migrations.json', JSON.stringify({ passed: false, at: new Date().toISOString(), results, error: error.message }, null, 2));
  console.error(error.message);
  process.exitCode = 1;
}
