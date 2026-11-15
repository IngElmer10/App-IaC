import type {
  PlatformOperation,
  PlatformPlan,
  PlatformTenant,
} from '@prisma/client';
import { createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import { studentPasswordFor } from './platform-secrets.js';
import {
  tenantHostname,
  tenantResources,
  tenantRoles,
  type TenantResource,
  type TenantRole,
} from './tenant-resources.js';
import { threeTierTemplate } from './three-tier-template.js';

type Runtime = {
  root: string;
  region: string;
  bucket: string;
  aws: (args: string[]) => Promise<string>;
  command: (binary: string, args: string[], cwd?: string) => Promise<string>;
  remote: (instanceId: string, commands: string[]) => Promise<string>;
  log: (id: string, progress: number, message: string) => Promise<void>;
  waitReady: (id: string, url: string) => Promise<void>;
};
type Credentials = {
  adminPassword: string;
  dbPassword: string;
  sessionSecret: string;
};
const pause = (milliseconds: number) =>
  new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
const countsSql = `SELECT json_build_object('students',(SELECT count(*) FROM "Student"),'sessions',(SELECT count(*) FROM "ClassSession"),'attendance',(SELECT count(*) FROM "Attendance"),'modules',(SELECT count(*) FROM "AcademicModule"))`;
const countsCommand = `printf %s '${Buffer.from(countsSql).toString('base64')}' | base64 -d | sudo -u postgres psql -d attendance -tA`;

export class ThreeTierProvisioner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: Runtime,
  ) {}

  private async parameter(
    directory: string,
    name: string,
    environment: Record<string, string>,
  ) {
    const file = resolve(directory, 'role-parameter.json');
    await writeFile(
      file,
      JSON.stringify({
        Name: name,
        Type: 'SecureString',
        Value: JSON.stringify(environment),
        Overwrite: true,
      }),
      { mode: 0o600 },
    );
    try {
      await this.runtime.aws([
        'ssm',
        'put-parameter',
        '--cli-input-json',
        `file://${file}`,
      ]);
    } finally {
      await writeFile(file, '{}');
    }
  }

  private async describe(resources: TenantResource[]) {
    const result = JSON.parse(
      await this.runtime.aws([
        'ec2',
        'describe-instances',
        '--instance-ids',
        ...resources.map((resource) => resource.instanceId),
      ]),
    );
    const instances = result.Reservations.flatMap(
      (reservation: any) => reservation.Instances,
    );
    return resources.map((resource) => {
      const instance = instances.find(
        (candidate: any) => candidate.InstanceId === resource.instanceId,
      );
      if (!instance)
        throw new Error(`No se encontró la instancia ${resource.role}.`);
      return {
        ...resource,
        privateIp: instance.PrivateIpAddress,
        publicIp: instance.PublicIpAddress,
        instanceType: instance.InstanceType,
      };
    });
  }

  private async configure(
    resource: TenantResource,
    parameterName: string,
    artifactKey: string,
  ) {
    const bootstrap = `AWS_REGION=${this.runtime.region}\nARTIFACT_BUCKET=${this.runtime.bucket}\nARTIFACT_KEY=${artifactKey}\nSSM_PARAMETER=${parameterName}/${resource.role}\nSERVICE_ROLE=${resource.role}\n`;
    await this.runtime.remote(resource.instanceId, [
      'set -eu',
      `printf %s '${Buffer.from(bootstrap).toString('base64')}' | base64 -d > /etc/tenantforge-bootstrap`,
      'chmod 600 /etc/tenantforge-bootstrap',
      `aws s3 cp s3://${this.runtime.bucket}/${artifactKey} /tmp/app.tar.gz --region ${this.runtime.region}`,
      'tar -xzf /tmp/app.tar.gz -C /opt/tenantforge',
      'cp /opt/tenantforge/infrastructure/scripts/bootstrap-role.sh /tmp/tenantforge-bootstrap-run.sh',
      'bash /tmp/tenantforge-bootstrap-run.sh',
    ]);
  }

  private async waitRole(resource: TenantResource) {
    await this.runtime.remote(resource.instanceId, [
      'set -eu',
      `for attempt in $(seq 1 150); do [ "$(cat /var/lib/tenantforge/role-ready 2>/dev/null || true)" = '${resource.role}' ] && exit 0; sleep 5; done`,
      'tail -50 /var/log/cloud-init-output.log >&2; exit 1',
    ]);
  }

  async deploy(
    operation: PlatformOperation,
    tenant: PlatformTenant & { plan: PlatformPlan },
    credentials: Credentials,
  ) {
    const runtime = this.runtime;
    const artifactKey = process.env.PLATFORM_ARTIFACT_KEY;
    if (!artifactKey || !process.env.PLATFORM_STATE_BUCKET)
      throw new Error(
        'Publica el paquete de la aplicación antes del despliegue.',
      );
    const directory = resolve(runtime.root, '.runtime', 'tenants', tenant.id);
    await mkdir(directory, { recursive: true });
    const parameterName = `/tenantforge/mvp/${tenant.id}/environment`;
    const migrating = Boolean(
      tenant.instanceId && tenant.architectureVersion < 2,
    );
    const previousResources = tenantResources(tenant);
    const missingInstances =
      3 - Math.max(previousResources.length, tenant.instanceId ? 1 : 0);
    if (missingInstances > 0) {
      const quota = JSON.parse(
        await runtime.aws([
          'service-quotas',
          'get-service-quota',
          '--service-code',
          'ec2',
          '--quota-code',
          'L-1216C47A',
        ]),
      ).Quota.Value;
      const current = JSON.parse(
        await runtime.aws([
          'ec2',
          'describe-instances',
          '--filters',
          'Name=instance-state-name,Values=running,pending',
        ]),
      ).Reservations.flatMap((reservation: any) => reservation.Instances);
      const used = current.reduce(
        (total: number, instance: any) =>
          total +
          instance.CpuOptions.CoreCount * instance.CpuOptions.ThreadsPerCore,
        0,
      );
      if (used + missingInstances * tenant.plan.vcpu > quota)
        throw new Error(
          `La cuota EC2 no alcanza para tres instancias: ${used}/${quota} vCPU en uso. Suspende otra institución o solicita ampliar la cuota antes de reintentar.`,
        );
    }
    let backupKey: string | undefined;
    let promoted = false;
    let snapshot: Record<string, number> | undefined;
    if (migrating) {
      backupKey = `mvp/backups/${tenant.id}/${operation.id}-migration.dump`;
      await runtime.log(
        operation.id,
        15,
        'Pausa de escritura y respaldo previo a separar las instancias. Los datos originales se conservan.',
      );
      let output: string;
      try {
        output = await runtime.remote(tenant.instanceId!, [
          'set -eu',
          'mkdir -p /var/lib/tenantforge',
          'cp /opt/tenantforge/backend/.env /var/lib/tenantforge/legacy-backend.env',
          'cp /etc/nginx/sites-available/default /var/lib/tenantforge/legacy-nginx.conf',
          'systemctl stop attendance-backend',
          'systemctl start postgresql',
          `bash -o pipefail -c 'sudo -u postgres pg_dump -Fc attendance | aws s3 cp - s3://${runtime.bucket}/${backupKey} --region ${runtime.region} --sse AES256'`,
          countsCommand,
        ]);
      } catch (error) {
        await runtime
          .remote(tenant.instanceId!, ['systemctl start attendance-backend'])
          .catch(() => undefined);
        throw error;
      }
      snapshot = JSON.parse(
        output
          .trim()
          .split('\n')
          .find((line) => line.trim().startsWith('{')) || '{}',
      );
      if (Object.keys(snapshot!).length !== 4) {
        await runtime.remote(tenant.instanceId!, [
          'systemctl start attendance-backend',
        ]);
        throw new Error('No se pudo verificar el respaldo antes de migrar.');
      }
      const backup = await this.prisma.platformBackup.create({
        data: { tenantId: tenant.id, objectKey: backupKey },
      });
      await this.prisma.platformTenant.update({
        where: { id: tenant.id },
        data: { migrationBackupId: backup.id, migrationSnapshot: snapshot },
      });
    }
    try {
      for (const role of tenantRoles)
        await this.parameter(directory, `${parameterName}/${role}`, {
          CONFIG_READY: 'false',
          ARTIFACT_KEY: artifactKey,
        });
      const networking = JSON.parse(
        await runtime.aws([
          'ec2',
          'describe-subnets',
          '--filters',
          'Name=default-for-az,Values=true',
          '--query',
          'Subnets[0].{subnet:SubnetId,vpc:VpcId}',
        ]),
      );
      if (!networking.subnet || !process.env.PLATFORM_ALLOWED_CIDR)
        throw new Error(
          'Configura una subred pública y PLATFORM_ALLOWED_CIDR.',
        );
      let previous: Record<string, any> = {};
      try {
        previous = JSON.parse(
          await readFile(resolve(directory, 'terraform.tfvars.json'), 'utf8'),
        );
      } catch {}
      const variables = {
        region: runtime.region,
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        environment: tenant.environment,
        instance_type: tenant.plan.instanceType,
        storage_gb: Math.max(tenant.plan.storageGb, previous.storage_gb || 20),
        frontend_storage_gb:
          previous.frontend_storage_gb ||
          (migrating ? previous.storage_gb || tenant.plan.storageGb : 20),
        legacy_migration: migrating,
        vpc_id: networking.vpc,
        subnet_id: networking.subnet,
        allowed_cidr: process.env.PLATFORM_ALLOWED_CIDR,
        artifact_bucket: runtime.bucket,
        artifact_key: artifactKey,
        parameter_name: parameterName,
      };
      await runtime.log(
        operation.id,
        25,
        `Aprovisionando frontend, backend y PostgreSQL independientes con ${tenant.engine}.`,
      );
      let resources: TenantResource[];
      if (tenant.engine === 'terraform' || tenant.engine === 'opentofu') {
        const binary = tenant.engine === 'terraform' ? 'terraform' : 'tofu';
        for (const name of ['main.tf', 'cloud-init.sh.tftpl'])
          await writeFile(
            resolve(directory, name),
            await readFile(
              resolve(runtime.root, 'infrastructure', 'terraform', name),
            ),
          );
        await writeFile(
          resolve(directory, 'terraform.tfvars.json'),
          JSON.stringify(variables),
        );
        await runtime.command(
          binary,
          [
            'init',
            '-input=false',
            '-no-color',
            `-backend-config=bucket=${process.env.PLATFORM_STATE_BUCKET}`,
            `-backend-config=key=mvp/tenants/${tenant.id}/terraform.tfstate`,
            `-backend-config=region=${runtime.region}`,
            '-backend-config=encrypt=true',
            '-backend-config=use_lockfile=true',
          ],
          directory,
        );
        await runtime.command(
          binary,
          ['plan', '-input=false', '-no-color', '-out=deployment.plan'],
          directory,
        );
        const plan = JSON.parse(
          await runtime.command(
            binary,
            ['show', '-json', 'deployment.plan'],
            directory,
          ),
        );
        if (
          plan.resource_changes?.some(
            (change: any) =>
              change.type === 'aws_instance' &&
              change.change.actions.includes('delete'),
          )
        )
          throw new Error(
            'Despliegue detenido: el plan reemplazaría una instancia existente. No se modificaron los datos.',
          );
        await runtime.command(
          binary,
          ['apply', '-input=false', '-no-color', 'deployment.plan'],
          directory,
        );
        resources = JSON.parse(
          await runtime.command(binary, ['output', '-json'], directory),
        ).resources.value;
      } else if (tenant.engine === 'cloudformation') {
        const stack = `mvp-asistencia-${tenant.slug}`;
        let deployed: any;
        try {
          deployed = JSON.parse(
            await runtime.aws([
              'cloudformation',
              'get-template',
              '--stack-name',
              stack,
            ]),
          ).TemplateBody;
          if (typeof deployed === 'string') deployed = JSON.parse(deployed);
        } catch {}
        const source = await readFile(
          resolve(runtime.root, 'infrastructure/terraform/cloud-init.sh.tftpl'),
          'utf8',
        );
        const data = Object.fromEntries(
          tenantRoles.map((role) => [
            role,
            source.replace(/\$\{([a-z_]+)\}/g, (_, key: string) =>
              String(
                (
                  {
                    ...variables,
                    parameter_name: `${parameterName}/${role}`,
                    service_role: role,
                  } as Record<string, string | number | boolean>
                )[key] ?? '',
              ),
            ),
          ]),
        ) as Record<TenantRole, string>;
        const template = threeTierTemplate(
          JSON.parse(
            await readFile(
              resolve(
                runtime.root,
                'infrastructure/cloudformation/tenant.json',
              ),
              'utf8',
            ),
          ),
          data,
          tenant.slug,
          tenant.environment,
          deployed,
          migrating,
        );
        if (deployed) {
          for (const logicalId of ['BackendMachine', 'DatabaseMachine'])
            if (deployed.Resources[logicalId])
              template.Resources[logicalId] = deployed.Resources[logicalId];
        }
        const file = resolve(directory, 'template.json');
        await writeFile(file, JSON.stringify(template));
        const changeSet = `deployment-${operation.id}`;
        await runtime.aws([
          'cloudformation',
          'create-change-set',
          '--stack-name',
          stack,
          '--change-set-name',
          changeSet,
          '--change-set-type',
          deployed ? 'UPDATE' : 'CREATE',
          '--template-body',
          `file://${file}`,
          '--capabilities',
          'CAPABILITY_IAM',
          '--parameters',
          ...Object.entries({
            TenantId: tenant.id,
            InstanceType: tenant.plan.instanceType,
            StorageGb: variables.storage_gb,
            VpcId: networking.vpc,
            SubnetId: networking.subnet,
            AllowedCidr: variables.allowed_cidr,
            ArtifactBucket: runtime.bucket,
            ParameterName: parameterName,
          }).map(
            ([key, value]) => `ParameterKey=${key},ParameterValue=${value}`,
          ),
        ]);
        try {
          await runtime.aws([
            'cloudformation',
            'wait',
            'change-set-create-complete',
            '--stack-name',
            stack,
            '--change-set-name',
            changeSet,
          ]);
        } catch {}
        const changes = JSON.parse(
          await runtime.aws([
            'cloudformation',
            'describe-change-set',
            '--stack-name',
            stack,
            '--change-set-name',
            changeSet,
          ]),
        );
        if (
          changes.Status === 'FAILED' &&
          !/didn.t contain changes|No updates/.test(changes.StatusReason || '')
        )
          throw new Error(changes.StatusReason);
        if (changes.Status !== 'FAILED') {
          if (
            changes.Changes?.some(
              (change: any) =>
                change.ResourceChange.ResourceType === 'AWS::EC2::Instance' &&
                ['True', 'Conditional'].includes(
                  change.ResourceChange.Replacement,
                ),
            )
          )
            throw new Error(
              'CloudFormation intentó reemplazar una instancia existente. Se canceló para proteger los datos.',
            );
          await runtime.aws([
            'cloudformation',
            'execute-change-set',
            '--stack-name',
            stack,
            '--change-set-name',
            changeSet,
          ]);
          await runtime.aws([
            'cloudformation',
            'wait',
            deployed ? 'stack-update-complete' : 'stack-create-complete',
            '--stack-name',
            stack,
          ]);
        }
        const outputs = JSON.parse(
          await runtime.aws([
            'cloudformation',
            'describe-stacks',
            '--stack-name',
            stack,
          ]),
        ).Stacks[0].Outputs;
        resources = tenantRoles.map((role) => ({
          role,
          instanceId: outputs.find(
            (output: any) =>
              output.OutputKey ===
              (role === 'frontend'
                ? 'InstanceId'
                : role === 'backend'
                  ? 'BackendInstanceId'
                  : 'DatabaseInstanceId'),
          ).OutputValue,
          privateIp: '',
          publicIp: '',
          name: `${tenant.slug}-${role}-${tenant.environment}`,
        }));
      } else
        throw new Error(
          'Selecciona Terraform o CloudFormation para el aprovisionamiento.',
        );
      resources = await this.describe(resources);
      const frontend = resources.find(
        (resource) => resource.role === 'frontend',
      )!;
      const backend = resources.find(
        (resource) => resource.role === 'backend',
      )!;
      const database = resources.find(
        (resource) => resource.role === 'database',
      )!;
      const publicUrl = `http://${tenantHostname(tenant.slug, frontend.publicIp)}`;
      await this.prisma.platformTenant.update({
        where: { id: tenant.id },
        data: { instanceId: frontend.instanceId, resources, publicUrl },
      });
      const common = {
        CONFIG_READY: 'true',
        ARTIFACT_KEY: artifactKey,
        ARTIFACT_BUCKET: runtime.bucket,
        AWS_REGION: runtime.region,
        TENANT_ID: tenant.id,
        TENANT_NAME: tenant.name,
        TENANT_COLOR: tenant.color,
        TENANT_SLUG: tenant.slug,
        TENANT_ENVIRONMENT: tenant.environment,
        BACKEND_HOST: backend.privateIp,
        DATABASE_HOST: database.privateIp,
        TZ: 'America/La_Paz',
      };
      const environments: Record<TenantRole, Record<string, string>> = {
        frontend: {
          ...common,
          GRAFANA_ADMIN_PASSWORD: credentials.adminPassword,
        },
        backend: {
          ...common,
          DATABASE_URL: `postgresql://attendance:${credentials.dbPassword}@${database.privateIp}:5432/attendance?schema=public`,
          DB_PASSWORD: credentials.dbPassword,
          SESSION_SECRET: credentials.sessionSecret,
          DEFAULT_ADMIN_PASSWORD: credentials.adminPassword,
          ADMIN_EMAIL: tenant.contactEmail,
          DEFAULT_STUDENT_PASSWORD: studentPasswordFor(
            credentials.sessionSecret,
          ),
          PLATFORM_ENABLED: 'false',
          PORT: '3001',
          BIND_ADDRESS: '0.0.0.0',
          FRONTEND_URL: publicUrl,
          MAX_STUDENTS: String(tenant.plan.maxStudents),
          MAX_SESSIONS: String(tenant.plan.maxSessions),
          MIGRATION_MODE: String(migrating),
        },
        database: {
          ...common,
          DB_PASSWORD: credentials.dbPassword,
          MONITOR_PASSWORD: createHmac('sha256', credentials.dbPassword)
            .update('database-monitor')
            .digest('hex')
            .slice(0, 32),
        },
      };
      for (const role of tenantRoles)
        await this.parameter(
          directory,
          `${parameterName}/${role}`,
          environments[role],
        );
      await runtime.log(
        operation.id,
        50,
        'Tres máquinas creadas. Instalando cada servicio en su instancia y configurando la red privada.',
      );
      for (const resource of [database, backend]) {
        if (
          previousResources.some(
            (previousResource) =>
              previousResource.instanceId === resource.instanceId,
          )
        )
          await this.configure(resource, parameterName, artifactKey);
        else await this.waitRole(resource);
      }
      if (migrating && backupKey && snapshot) {
        await runtime.log(
          operation.id,
          70,
          'Restaurando el respaldo en PostgreSQL dedicado y verificando estudiantes, clases, marcas y módulos.',
        );
        const output = await runtime.remote(database.instanceId, [
          'set -eu',
          `aws s3 cp s3://${runtime.bucket}/${backupKey} /tmp/migration.dump --region ${runtime.region}`,
          'chmod 644 /tmp/migration.dump',
          'sudo -u postgres pg_restore --clean --if-exists --no-owner --role=attendance --single-transaction --exit-on-error -d attendance /tmp/migration.dump',
          countsCommand,
          'rm -f /tmp/migration.dump',
        ]);
        const restored = JSON.parse(
          output
            .trim()
            .split('\n')
            .find((line) => line.trim().startsWith('{')) || '{}',
        );
        if (
          Object.keys(snapshot).some(
            (key) => Number(restored[key]) !== Number(snapshot![key]),
          )
        )
          throw new Error(
            'La verificación de datos no coincide. Se conserva la base original y el respaldo.',
          );
        environments.backend.MIGRATION_MODE = 'false';
        await this.parameter(
          directory,
          `${parameterName}/backend`,
          environments.backend,
        );
        await this.prisma.platformTenant.update({
          where: { id: tenant.id },
          data: { architectureVersion: 2 },
        });
        promoted = true;
        await runtime.remote(backend.instanceId, [
          'set -eu',
          'cd /opt/tenantforge/backend',
          'npx prisma migrate deploy',
          'systemctl restart attendance-backend',
        ]);
      }
      if (tenant.instanceId)
        await this.configure(frontend, parameterName, artifactKey);
      else await this.waitRole(frontend);
      await runtime.waitReady(operation.id, publicUrl);
      let monitored = false;
      for (let attempt = 0; attempt < 18; attempt++) {
        try {
          const response = await fetch(
            `${publicUrl}/monitoring/api/v1/query?query=${encodeURIComponent('up{job="node",role=~"frontend|backend|database"}')}`,
            { signal: AbortSignal.timeout(5000) },
          );
          const payload = (await response.json()) as {
            data?: {
              result?: { metric: { role: string }; value: [number, string] }[];
            };
          };
          const metrics = payload.data?.result || [];
          if (
            metrics.length === 3 &&
            metrics.every((metric) => metric.value[1] === '1') &&
            new Set(metrics.map((metric) => metric.metric.role)).size === 3
          ) {
            monitored = true;
            break;
          }
        } catch {}
        await pause(5000);
      }
      if (!monitored)
        throw new Error(
          'La aplicación responde, pero no se verificaron las tres instancias en Prometheus. Reintenta la actualización para revisar el monitoreo.',
        );
      await runtime.log(
        operation.id,
        98,
        'Frontend, backend, base de datos y monitoreo de las tres instancias verificados.',
      );
      return {
        instanceId: frontend.instanceId,
        publicUrl,
        resources,
        architectureVersion: 2,
      };
    } catch (error) {
      if (migrating && !promoted) {
        await runtime
          .remote(tenant.instanceId!, [
            'set -eu',
            'if [ -f /var/lib/tenantforge/legacy-backend.env ]; then cp /var/lib/tenantforge/legacy-backend.env /opt/tenantforge/backend/.env; chown attendance:attendance /opt/tenantforge/backend/.env; fi',
            'if [ -f /var/lib/tenantforge/legacy-nginx.conf ]; then cp /var/lib/tenantforge/legacy-nginx.conf /etc/nginx/sites-available/default; fi',
            'systemctl enable --now postgresql attendance-backend',
            'systemctl restart nginx',
          ])
          .catch(() => undefined);
      }
      throw error;
    }
  }
}
