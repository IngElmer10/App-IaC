import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateTenantDto,
  TenantActionDto,
  UpdatePlanDto,
} from './dto/platform.dto.js';
import { sealSecret } from './platform-secrets.js';
import { ProvisionerService } from './provisioner.service.js';

const tenantSelect = {
  id: true,
  slug: true,
  name: true,
  contactEmail: true,
  contactPhone: true,
  color: true,
  environment: true,
  engine: true,
  status: true,
  planId: true,
  instanceId: true,
  architectureVersion: true,
  resources: true,
  publicUrl: true,
  deployedVersion: true,
  health: true,
  createdAt: true,
  updatedAt: true,
  plan: true,
} satisfies Prisma.PlatformTenantSelect;

@Injectable()
export class PlatformService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private running = 0;
  private lastMonitor = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioner: ProvisionerService,
  ) {}

  async onModuleInit() {
    if (process.env.PLATFORM_ENABLED !== 'true') return;
    for (const plan of [
      {
        code: 'basic',
        name: 'Básico',
        description: 'Instituciones pequeñas y pruebas académicas',
        instanceType: 't3.small',
        vcpu: 2,
        memoryMb: 2048,
        storageGb: 20,
        maxStudents: 50,
        maxSessions: 50,
      },
      {
        code: 'standard',
        name: 'Estándar',
        description: 'Instituciones en crecimiento',
        instanceType: 'c7i-flex.large',
        vcpu: 2,
        memoryMb: 4096,
        storageGb: 30,
        maxStudents: 200,
        maxSessions: 200,
      },
      {
        code: 'advanced',
        name: 'Avanzado',
        description: 'Mayor capacidad para instituciones grandes',
        instanceType: 'm7i-flex.large',
        vcpu: 2,
        memoryMb: 8192,
        storageGb: 50,
        maxStudents: 1000,
        maxSessions: 500,
      },
    ]) {
      await this.prisma.platformPlan.upsert({
        where: { code: plan.code },
        create: plan,
        update: {
          instanceType: plan.instanceType,
          vcpu: plan.vcpu,
          memoryMb: plan.memoryMb,
        },
      });
    }
    await this.prisma.platformOperation.updateMany({
      where: { state: 'RUNNING' },
      data: {
        state: 'FAILED',
        error:
          'La plataforma se reinició durante la operación. Puedes reintentar con el mismo estado de infraestructura.',
        finishedAt: new Date(),
      },
    });
    this.timer = setInterval(() => {
      void this.tick();
    }, 3000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getPlans() {
    return this.prisma.platformPlan.findMany({
      where: { active: true },
      orderBy: { maxStudents: 'asc' },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto, actor: string) {
    const plan = await this.prisma.platformPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado.');
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.platformPlan.update({
        where: { id },
        data: dto,
      });
      await transaction.auditLog.create({
        data: {
          entity: 'PlatformPlan',
          entityId: id,
          action: 'UPDATE_PLAN',
          actor,
          payload: {
            previous: {
              name: plan.name,
              maxStudents: plan.maxStudents,
              maxSessions: plan.maxSessions,
            },
            next: {
              name: dto.name,
              maxStudents: dto.maxStudents,
              maxSessions: dto.maxSessions,
            },
          },
        },
      });
      return updated;
    });
  }

  async getTenants(filters: {
    search?: string;
    status?: string;
    planId?: string;
    environment?: string;
  }) {
    return this.prisma.platformTenant.findMany({
      where: {
        ...(filters.search
          ? {
              OR: [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { slug: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(filters.status
          ? { status: filters.status }
          : { status: { not: 'DELETED' } }),
        ...(filters.planId ? { planId: filters.planId } : {}),
        ...(filters.environment ? { environment: filters.environment } : {}),
      },
      select: tenantSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.platformTenant.findUnique({
      where: { id },
      select: {
        ...tenantSelect,
        operations: { orderBy: { createdAt: 'desc' }, take: 30 },
        backups: { orderBy: { createdAt: 'desc' } },
        alerts: { orderBy: { detectedAt: 'desc' }, take: 20 },
      },
    });
    if (!tenant) throw new NotFoundException('Institución no encontrada.');
    return tenant;
  }

  async createTenant(dto: CreateTenantDto, actor: string) {
    const plan = await this.prisma.platformPlan.findFirst({
      where: { id: dto.planId, active: true },
    });
    if (!plan) throw new BadRequestException('Selecciona un plan vigente.');
    const { adminPassword, ...data } = dto;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.slug}))`;
        const pending = await transaction.tenantRequest.findFirst({
          where: { slug: dto.slug, status: 'PENDING' },
          select: { id: true },
        });
        if (pending)
          throw new ConflictException(
            'Ese identificador está reservado por una solicitud pendiente. Apruébala desde Solicitudes.',
          );
        const tenant = await transaction.platformTenant.create({
          data: {
            ...data,
            contactEmail: dto.contactEmail.toLowerCase(),
            color: dto.color || '#059669',
            architectureVersion: 2,
            credentials: sealSecret(
              JSON.stringify({
                adminPassword,
                dbPassword: randomBytes(24).toString('hex'),
                sessionSecret: randomBytes(32).toString('hex'),
              }),
            ),
          },
          select: tenantSelect,
        });
        await transaction.platformOperation.create({
          data: {
            tenantId: tenant.id,
            action: 'DEPLOY',
            templateVersion: '2.0.0',
            actor,
            logs: [
              'Creación registrada. Se aprovisionarán tres instancias independientes.',
            ],
          },
        });
        return tenant;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Ese identificador de institución ya está registrado.',
        );
      throw error;
    }
  }

  async preview(id: string, planId?: string) {
    const tenant = await this.getTenant(id);
    const next = planId
      ? await this.prisma.platformPlan.findUnique({ where: { id: planId } })
      : null;
    if (planId && !next) throw new BadRequestException('Plan no encontrado.');
    return {
      tenantId: id,
      current: tenant.plan,
      proposed: next,
      changes: next
        ? [
            'Instancias: 3 independientes (frontend, backend y base de datos).',
            `Cómputo: ${tenant.plan.instanceType} → ${next.instanceType}`,
            `Memoria: ${tenant.plan.memoryMb} → ${next.memoryMb} MB`,
            `Estudiantes: ${tenant.plan.maxStudents} → ${next.maxStudents}`,
            `Clases: ${tenant.plan.maxSessions} → ${next.maxSessions}`,
            `Disco: ${tenant.plan.storageGb} → ${Math.max(tenant.plan.storageGb, next.storageGb)} GB; no se reduce un volumen existente.`,
          ]
        : [
            'Se eliminarán las tres instancias, sus discos y las reglas de red de esta institución.',
            'Los respaldos ya creados en S3 y el historial de operaciones se conservarán.',
            'Los recursos de otras instituciones no se modificarán.',
          ],
    };
  }

  async enqueue(id: string, dto: TenantActionDto, actor: string) {
    const tenant = await this.getTenant(id);
    if (tenant.status === 'DELETED')
      throw new BadRequestException('La institución ya fue eliminada.');
    if (dto.action === 'MIGRATE' && tenant.architectureVersion >= 2)
      throw new BadRequestException(
        'La institución ya tiene tres instancias independientes.',
      );
    if (
      ['DELETE', 'RESTORE', 'MIGRATE'].includes(dto.action) &&
      dto.confirmation !== tenant.slug
    )
      throw new BadRequestException(
        'Escribe el identificador de la institución para confirmar.',
      );
    if (
      dto.action === 'DELETE' &&
      tenant.backups.length === 0 &&
      tenant.instanceId
    )
      throw new BadRequestException(
        'Crea un respaldo antes de eliminar la institución.',
      );
    if (
      dto.action === 'RESTORE' &&
      !tenant.backups.some((backup) => backup.id === dto.backupId)
    )
      throw new BadRequestException(
        'Selecciona un respaldo de esta institución.',
      );
    if (dto.action === 'CHANGE_PLAN') {
      if (!dto.planId)
        throw new BadRequestException('Selecciona el nuevo plan.');
      const plan = await this.prisma.platformPlan.findUnique({
        where: { id: dto.planId },
      });
      if (!plan) throw new BadRequestException('Plan no encontrado.');
      if (tenant.engine === 'cloudformation') {
        throw new BadRequestException(
          'El cambio de infraestructura de un tenant CloudFormation queda pendiente en este MVP. Usa una institución Terraform para cambiar el plan; CloudFormation permite actualizar la aplicación conservando su VM.',
        );
      }
      const health = tenant.health as {
        students?: number;
        sessions?: number;
      } | null;
      if (
        (health?.students ?? 0) > plan.maxStudents ||
        (health?.sessions ?? 0) > plan.maxSessions
      )
        throw new BadRequestException(
          'El uso actual supera los límites del nuevo plan.',
        );
    }
    if (!tenant.instanceId && !['DEPLOY', 'DELETE'].includes(dto.action))
      throw new BadRequestException('Primero despliega la institución.');
    if (
      tenant.status === 'SUSPENDED' &&
      !['RESUME', 'DELETE'].includes(dto.action)
    )
      throw new BadRequestException(
        'Reanuda la institución antes de realizar esta operación.',
      );
    try {
      return await this.prisma.platformOperation.create({
        data: {
          tenantId: id,
          action: dto.action,
          templateVersion: '2.0.0',
          actor,
          payload: {
            planId: dto.planId ?? null,
            backupId: dto.backupId ?? null,
          },
          logs: ['Operación en cola.'],
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Esta institución ya tiene una operación en curso.',
        );
      throw error;
    }
  }

  async retry(id: string, actor: string) {
    const operation = await this.prisma.platformOperation.findUnique({
      where: { id },
    });
    if (!operation || operation.state !== 'FAILED')
      throw new BadRequestException(
        'Solo se pueden reintentar operaciones fallidas.',
      );
    const payload = operation.payload as {
      planId?: string;
      backupId?: string;
    } | null;
    const tenant = await this.getTenant(operation.tenantId);
    return this.enqueue(
      operation.tenantId,
      {
        action: operation.action === 'MIGRATE' && tenant.architectureVersion >= 2 ? 'UPDATE' : operation.action,
        planId: payload?.planId ?? undefined,
        backupId: payload?.backupId ?? undefined,
        confirmation: tenant.slug,
      },
      actor,
    );
  }

  async overview() {
    const [tenants, operations, alerts, plans, pendingRequests] =
      await Promise.all([
        this.getTenants({}),
        this.prisma.platformOperation.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { tenant: { select: { name: true, slug: true } } },
        }),
        this.prisma.platformAlert.findMany({
          where: { state: 'FIRING' },
          include: { tenant: { select: { name: true } } },
          orderBy: { detectedAt: 'desc' },
        }),
        this.getPlans(),
        this.prisma.tenantRequest.count({ where: { status: 'PENDING' } }),
      ]);
    return {
      tenants,
      operations,
      alerts,
      plans,
      pendingRequests,
      region: process.env.AWS_REGION ?? 'us-east-1',
      cloudConfigured: Boolean(
        process.env.PLATFORM_ARTIFACT_BUCKET &&
        process.env.PLATFORM_STATE_BUCKET,
      ),
    };
  }

  private async tick() {
    if (this.busy || this.running >= 2) return;
    this.busy = true;
    try {
      const operation = await this.prisma.platformOperation.findFirst({
        where: { state: 'QUEUED' },
        orderBy: { createdAt: 'asc' },
      });
      if (operation) {
        const claimed = await this.prisma.platformOperation.updateMany({
          where: { id: operation.id, state: 'QUEUED' },
          data: { state: 'RUNNING', progress: 5 },
        });
        if (claimed.count) {
          this.running++;
          void this.provisioner
            .execute(operation)
            .catch((error: unknown) => {
              console.error(
                'No se pudo persistir el resultado de la operación.',
                error instanceof Error ? error.name : 'Error',
              );
            })
            .finally(() => {
              this.running--;
            });
        }
      } else if (Date.now() - this.lastMonitor > 30000) {
        this.lastMonitor = Date.now();
        await this.provisioner.monitor();
      }
    } catch (error) {
      console.error(
        'No se pudo consultar la cola de operaciones.',
        error instanceof Error ? error.name : 'Error',
      );
    } finally {
      this.busy = false;
    }
  }
}
