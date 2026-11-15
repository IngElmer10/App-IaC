import { Injectable } from '@nestjs/common';
import type { PlatformOperation, PlatformTenant } from '@prisma/client';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { PrismaService } from '../../prisma/prisma.service.js';
import { openSecret, studentPasswordFor } from './platform-secrets.js';
import { ThreeTierProvisioner } from './three-tier.provisioner.js';
import {
  tenantHostname,
  tenantResource,
  tenantResources,
  tenantRoles,
} from './tenant-resources.js';

const pause = (milliseconds: number) =>
  new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));

@Injectable()
export class ProvisionerService {
  private readonly root = resolve('..');
  private readonly runtime = resolve('..', '.runtime');
  private readonly region = process.env.AWS_REGION || 'us-east-1';
  private readonly profile = process.env.AWS_PROFILE || 'iac';

  constructor(private readonly prisma: PrismaService) {}

  private command(
    binary: string,
    args: string[],
    cwd = this.root,
    extraEnv: Record<string, string> = {},
    timeout = 900000,
  ): Promise<string> {
    return new Promise((resolveCommand, reject) => {
      const child = spawn(binary, args, {
        cwd,
        env: {
          ...process.env,
          ...extraEnv,
          AWS_PROFILE: this.profile,
          AWS_DEFAULT_REGION: this.region,
          AWS_PAGER: '',
          PYTHONIOENCODING: 'utf-8',
          AWS_CLI_FILE_ENCODING: 'UTF-8',
          AWS_CLI_OUTPUT_ENCODING: 'UTF-8',
          TF_IN_AUTOMATION: 'true',
        },
        windowsHide: true,
        shell: false,
      });
      let output = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(
          new Error(
            'La herramienta superó el tiempo máximo. Revisa el estado y reintenta.',
          ),
        );
      }, timeout);
      const collect = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-8000000);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolveCommand(output.trim());
        else
          reject(
            new Error(output.trim() || `${binary} terminó con código ${code}.`),
          );
      });
    });
  }

  private async aws(args: string[]): Promise<string> {
    for (let attempt = 0; attempt < 36; attempt++) {
      try {
        return await this.callAws(args);
      } catch (error) {
        const restarting =
          args[0] === 'ssm' &&
          args[1] === 'send-command' &&
          error instanceof Error &&
          error.message.includes('InvalidInstanceId');
        if (!restarting || attempt === 35) throw error;
        await pause(5000);
      }
    }
    throw new Error(
      'Systems Manager no quedó disponible para ejecutar el comando.',
    );
  }

  private async callAws(args: string[]) {
    return this.command(process.platform === 'win32' ? 'aws.exe' : 'aws', [
      ...args,
      '--profile',
      this.profile,
      '--region',
      this.region,
      '--output',
      'json',
    ]);
  }

  private async log(id: string, progress: number, message: string) {
    await this.prisma.platformOperation.update({
      where: { id },
      data: {
        progress,
        logs: { push: `${new Date().toISOString()} ${message}` },
      },
    });
  }

  private cleanError(error: unknown, secrets: string[]) {
    let message =
      error instanceof Error ? error.message : 'Falló la operación.';
    for (const secret of secrets)
      if (secret) message = message.split(secret).join('[REDACTADO]');
    return stripVTControlCharacters(message)
      .replace(/(?:AKIA|ASIA)[A-Z0-9]{16}/g, '[CREDENCIAL]')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URL]')
      .slice(-4000);
  }

  async execute(operation: PlatformOperation) {
    const tenant = await this.prisma.platformTenant.findUniqueOrThrow({
      where: { id: operation.tenantId },
      include: { plan: true },
    });
    const credentials = JSON.parse(openSecret(tenant.credentials)) as {
      adminPassword: string;
      dbPassword: string;
      sessionSecret: string;
    };
    const secrets = [
      ...Object.values(credentials),
      studentPasswordFor(credentials.sessionSecret),
    ];
    const payload = operation.payload as {
      planId?: string;
      backupId?: string;
    } | null;
    try {
      await this.aws(['sts', 'get-caller-identity']);
      const version = await this.command(
        tenant.engine === 'opentofu'
          ? 'tofu'
          : tenant.engine === 'terraform'
            ? 'terraform'
            : process.platform === 'win32'
              ? 'aws.exe'
              : 'aws',
        ['--version'],
      );
      await this.prisma.platformOperation.update({
        where: { id: operation.id },
        data: { toolVersion: version.slice(0, 150) },
      });
      await this.log(
        operation.id,
        10,
        'Credenciales AWS verificadas. Ejecutando operación real.',
      );
      let resultingStatus = tenant.status;

      if (
        ['DEPLOY', 'UPDATE', 'CHANGE_PLAN', 'MIGRATE'].includes(
          operation.action,
        )
      ) {
        await this.prisma.platformTenant.update({
          where: { id: tenant.id },
          data: { status: 'PROVISIONING' },
        });
        const plan = payload?.planId
          ? await this.prisma.platformPlan.findUniqueOrThrow({
              where: { id: payload.planId },
            })
          : tenant.plan;
        const threeTier = new ThreeTierProvisioner(this.prisma, {
          root: this.root,
          region: this.region,
          bucket: this.bucket(),
          aws: this.aws.bind(this),
          command: this.command.bind(this),
          remote: this.remote.bind(this),
          log: this.log.bind(this),
          waitReady: this.waitReady.bind(this),
        });
        const endpoint = await threeTier.deploy(
          operation,
          { ...tenant, plan },
          credentials,
        );
        await this.prisma.platformTenant.update({
          where: { id: tenant.id },
          data: { ...endpoint, planId: plan.id, deployedVersion: '0.3.0' },
        });
        resultingStatus = 'ACTIVE';
      } else if (operation.action === 'SUSPEND') {
        await this.aws([
          'ec2',
          'stop-instances',
          '--instance-ids',
          ...this.instanceIds(tenant),
        ]);
        await this.log(
          operation.id,
          50,
          'Deteniendo cómputo. El disco y los respaldos se conservan.',
        );
        await this.aws([
          'ec2',
          'wait',
          'instance-stopped',
          '--instance-ids',
          ...this.instanceIds(tenant),
        ]);
        resultingStatus = 'SUSPENDED';
      } else if (operation.action === 'RESUME') {
        await this.aws([
          'ec2',
          'start-instances',
          '--instance-ids',
          ...this.instanceIds(tenant),
        ]);
        await this.aws([
          'ec2',
          'wait',
          'instance-running',
          '--instance-ids',
          ...this.instanceIds(tenant),
        ]);
        const instances = JSON.parse(
          await this.aws([
            'ec2',
            'describe-instances',
            '--instance-ids',
            ...this.instanceIds(tenant),
          ]),
        ).Reservations.flatMap((reservation: any) => reservation.Instances);
        const resources = tenantResources(tenant).map((resource) => ({
          ...resource,
          publicIp: instances.find(
            (instance: any) => instance.InstanceId === resource.instanceId,
          ).PublicIpAddress,
        }));
        const frontIp = instances.find(
          (instance: any) => instance.InstanceId === tenant.instanceId,
        ).PublicIpAddress;
        const publicUrl = `http://${tenantHostname(tenant.slug, frontIp)}`;
        await this.waitReady(operation.id, publicUrl);
        await this.prisma.platformTenant.update({
          where: { id: tenant.id },
          data: { publicUrl, ...(resources.length ? { resources } : {}) },
        });
        resultingStatus = 'ACTIVE';
      } else if (operation.action === 'BACKUP') {
        const objectKey = `mvp/backups/${tenant.id}/${operation.id}.dump`;
        await this.remote(tenantResource(tenant, 'database')!, [
          `set -eu`,
          `bash -o pipefail -c 'sudo -u postgres pg_dump -Fc attendance | aws s3 cp - s3://${this.bucket()}/${objectKey} --region ${this.region} --sse AES256'`,
        ]);
        await this.prisma.platformBackup.upsert({
          where: { objectKey },
          create: { tenantId: tenant.id, objectKey },
          update: {},
        });
        await this.log(
          operation.id,
          90,
          'Respaldo PostgreSQL guardado y cifrado en S3.',
        );
      } else if (operation.action === 'RESTORE') {
        const backup = await this.prisma.platformBackup.findFirstOrThrow({
          where: { id: payload?.backupId, tenantId: tenant.id },
        });
        const backendId = tenantResource(tenant, 'backend')!;
        await this.remote(backendId, ['systemctl stop attendance-backend']);
        try {
          await this.remote(tenantResource(tenant, 'database')!, [
            'set -eu',
            `aws s3 cp s3://${this.bucket()}/${backup.objectKey} /tmp/attendance-restore.dump --region ${this.region}`,
            'chmod 644 /tmp/attendance-restore.dump',
            'sudo -u postgres pg_restore --clean --if-exists --no-owner --role=attendance --single-transaction --exit-on-error -d attendance /tmp/attendance-restore.dump',
            'rm -f /tmp/attendance-restore.dump',
          ]);
        } finally {
          await this.remote(backendId, ['systemctl start attendance-backend']);
        }
        await this.waitReady(operation.id, tenant.publicUrl!);
        await this.log(
          operation.id,
          90,
          'Base restaurada. Servicio de asistencia reiniciado.',
        );
      } else if (
        operation.action === 'TEST_ALERT' ||
        operation.action === 'CLEAR_ALERT'
      ) {
        await this.remote(tenantResource(tenant, 'backend')!, [
          operation.action === 'TEST_ALERT'
            ? 'touch /opt/tenantforge/demo-alert'
            : 'rm -f /opt/tenantforge/demo-alert',
        ]);
        await this.log(
          operation.id,
          90,
          operation.action === 'TEST_ALERT'
            ? 'Se activó la métrica de prueba. Prometheus evaluará una alerta real en los próximos segundos.'
            : 'Se desactivó la métrica de prueba.',
        );
      } else if (operation.action === 'DELETE') {
        await this.destroy(tenant);
        resultingStatus = 'DELETED';
        await this.prisma.platformTenant.update({
          where: { id: tenant.id },
          data: { publicUrl: null, instanceId: null },
        });
      }
      await this.prisma.$transaction([
        this.prisma.platformTenant.update({
          where: { id: tenant.id },
          data: { status: resultingStatus },
        }),
        this.prisma.platformOperation.update({
          where: { id: operation.id },
          data: {
            state: 'SUCCEEDED',
            progress: 100,
            finishedAt: new Date(),
            logs: { push: 'Operación completada.' },
          },
        }),
      ]);
    } catch (error) {
      const message = this.cleanError(error, secrets);
      await this.prisma.platformOperation.update({
        where: { id: operation.id },
        data: {
          state: 'FAILED',
          error: message,
          finishedAt: new Date(),
          logs: {
            push: 'Operación fallida. El estado se conserva para un reintento seguro.',
          },
        },
      });
      await this.prisma.platformTenant.update({
        where: { id: tenant.id },
        data: {
          status: ['DEPLOY', 'UPDATE', 'CHANGE_PLAN', 'MIGRATE'].includes(
            operation.action,
          )
            ? 'FAILED'
            : tenant.status,
        },
      });
    }
  }

  private bucket() {
    if (!process.env.PLATFORM_ARTIFACT_BUCKET)
      throw new Error('Configura PLATFORM_ARTIFACT_BUCKET antes de desplegar.');
    return process.env.PLATFORM_ARTIFACT_BUCKET;
  }

  private instanceIds(tenant: PlatformTenant) {
    const resources = tenantResources(tenant);
    return resources.length
      ? resources.map((resource) => resource.instanceId)
      : [tenant.instanceId!];
  }

  private workspace(tenant: PlatformTenant) {
    if (!/^[a-z0-9]+$/.test(tenant.id))
      throw new Error('Identificador inválido.');
    return resolve(this.runtime, 'tenants', tenant.id);
  }

  private async waitReady(operationId: string, publicUrl: string) {
    for (let attempt = 0; attempt < 75; attempt++) {
      try {
        const response = await fetch(`${publicUrl}/api/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (
          response.ok &&
          ((await response.json()) as { status: string }).status === 'ok'
        ) {
          const frontend = await fetch(publicUrl, {
            signal: AbortSignal.timeout(5000),
          });
          const grafana = await fetch(`${publicUrl}/grafana/api/health`, {
            signal: AbortSignal.timeout(5000),
          });
          const monitoring = await fetch(`${publicUrl}/monitoring/-/ready`, {
            signal: AbortSignal.timeout(5000),
          });
          if (frontend.ok && grafana.ok && monitoring.ok) {
            await this.log(
              operationId,
              95,
              'Frontend y backend responden. Despliegue verificado por HTTP.',
            );
            return;
          }
        }
      } catch {}
      if (attempt % 5 === 0)
        await this.log(
          operationId,
          90,
          `Esperando servicios HTTP (${attempt * 10} segundos).`,
        );
      await pause(10000);
    }
    throw new Error(
      'La infraestructura existe, pero la aplicación no respondió a tiempo. Revisa cloud-init en Systems Manager y reintenta.',
    );
  }

  private async remote(instanceId: string, commands: string[]) {
    const response = JSON.parse(
      await this.aws([
        'ssm',
        'send-command',
        '--instance-ids',
        instanceId,
        '--document-name',
        'AWS-RunShellScript',
        '--parameters',
        JSON.stringify({ commands }),
        '--timeout-seconds',
        '900',
      ]),
    );
    const commandId = response.Command.CommandId as string;
    for (let attempt = 0; attempt < 180; attempt++) {
      await pause(5000);
      let invocation: {
        Status: string;
        StandardErrorContent?: string;
        StandardOutputContent?: string;
      };
      try {
        invocation = JSON.parse(
          await this.aws([
            'ssm',
            'get-command-invocation',
            '--command-id',
            commandId,
            '--instance-id',
            instanceId,
          ]),
        );
      } catch {
        continue;
      }
      if (invocation.Status === 'Success')
        return invocation.StandardOutputContent || '';
      if (['Failed', 'Cancelled', 'TimedOut'].includes(invocation.Status))
        throw new Error(
          invocation.StandardErrorContent ||
            `Comando remoto: ${invocation.Status}`,
        );
    }
    throw new Error('El comando de Systems Manager superó el tiempo máximo.');
  }

  private async destroy(tenant: PlatformTenant) {
    if (tenant.engine === 'cloudformation') {
      await this.aws([
        'cloudformation',
        'delete-stack',
        '--stack-name',
        `mvp-asistencia-${tenant.slug}`,
      ]);
      await this.aws([
        'cloudformation',
        'wait',
        'stack-delete-complete',
        '--stack-name',
        `mvp-asistencia-${tenant.slug}`,
      ]);
    } else {
      await this.command(
        tenant.engine === 'opentofu' ? 'tofu' : 'terraform',
        ['destroy', '-auto-approve', '-input=false', '-no-color'],
        this.workspace(tenant),
      );
    }
    await this.aws([
      'ssm',
      'delete-parameters',
      '--names',
      `/tenantforge/mvp/${tenant.id}/environment`,
      ...tenantRoles.map(
        (role) => `/tenantforge/mvp/${tenant.id}/environment/${role}`,
      ),
    ]);
  }

  async monitor() {
    const tenants = await this.prisma.platformTenant.findMany({
      where: { status: 'ACTIVE', publicUrl: { not: null } },
    });
    for (const tenant of tenants) {
      try {
        const started = Date.now();
        const response = await fetch(`${tenant.publicUrl}/api/metrics`, {
          signal: AbortSignal.timeout(5000),
        });
        const metrics = await response.text();
        const read = (name: string) =>
          Number(
            metrics.match(new RegExp(`^${name} ([\\d.e+-]+)`, 'm'))?.[1] ?? 0,
          );
        const alertsResponse = await fetch(
          `${tenant.publicUrl}/monitoring/api/v1/alerts`,
          { signal: AbortSignal.timeout(5000) },
        );
        const alerts = alertsResponse.ok
          ? ((
              (await alertsResponse.json()) as {
                data?: {
                  alerts?: {
                    state: string;
                    labels: { alertname: string };
                    annotations: { summary?: string };
                  }[];
                };
              }
            ).data?.alerts ?? [])
          : [];
        const firing = alerts.filter((alert) => alert.state === 'firing');
        const nodeResponse = await fetch(
          `${tenant.publicUrl}/monitoring/api/v1/query?query=${encodeURIComponent('up{job="node",role=~"frontend|backend|database"}')}`,
          { signal: AbortSignal.timeout(5000) },
        );
        const nodeMetrics = nodeResponse.ok
          ? ((await nodeResponse.json()) as any).data?.result || []
          : [];
        const nodes = nodeMetrics.map((metric: any) => ({
          role: metric.metric.role || 'frontend',
          available: metric.value[1] === '1',
        }));
        const names = firing.map((alert) => alert.labels.alertname);
        await this.prisma.platformTenant.update({
          where: { id: tenant.id },
          data: {
            health: {
              available: response.ok,
              latencyMs: Date.now() - started,
              database: read('attendance_database_up') === 1,
              students: read('attendance_students'),
              sessions: read('attendance_sessions'),
              nodes,
              checkedAt: new Date().toISOString(),
            },
          },
        });
        await this.prisma.platformAlert.updateMany({
          where: {
            tenantId: tenant.id,
            state: 'FIRING',
            name: { notIn: names },
          },
          data: { state: 'RESOLVED', resolvedAt: new Date() },
        });
        for (const alert of firing) {
          const existing = await this.prisma.platformAlert.findFirst({
            where: {
              tenantId: tenant.id,
              name: alert.labels.alertname,
              state: 'FIRING',
            },
          });
          if (!existing)
            await this.prisma.platformAlert.create({
              data: {
                tenantId: tenant.id,
                name: alert.labels.alertname,
                state: 'FIRING',
                message: alert.annotations.summary || alert.labels.alertname,
              },
            });
        }
      } catch {
        await this.prisma.platformTenant.update({
          where: { id: tenant.id },
          data: {
            health: { available: false, checkedAt: new Date().toISOString() },
          },
        });
        const existing = await this.prisma.platformAlert.findFirst({
          where: {
            tenantId: tenant.id,
            name: 'ServicioNoDisponible',
            state: 'FIRING',
          },
        });
        if (!existing)
          await this.prisma.platformAlert.create({
            data: {
              tenantId: tenant.id,
              name: 'ServicioNoDisponible',
              state: 'FIRING',
              message:
                'La plataforma no pudo contactar los servicios de esta institución.',
            },
          });
      }
    }
  }
}
