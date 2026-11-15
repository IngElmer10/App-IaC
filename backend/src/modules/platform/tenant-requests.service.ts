import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateTenantRequestDto,
  ReviewTenantRequestDto,
} from './dto/platform.dto.js';
import { openSecret, sealSecret } from './platform-secrets.js';

const requestSelect = {
  id: true,
  name: true,
  slug: true,
  contactEmail: true,
  contactPhone: true,
  color: true,
  environment: true,
  engine: true,
  planId: true,
  status: true,
  rejectionReason: true,
  reviewedBy: true,
  reviewedAt: true,
  tenantId: true,
  createdAt: true,
  plan: true,
} satisfies Prisma.TenantRequestSelect;

@Injectable()
export class TenantRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  private enabled() {
    if (process.env.PLATFORM_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'Las solicitudes se reciben en la plataforma principal.',
      );
  }

  async plans() {
    this.enabled();
    return this.prisma.platformPlan.findMany({
      where: { active: true },
      orderBy: { maxStudents: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        instanceType: true,
        vcpu: true,
        memoryMb: true,
        storageGb: true,
        maxStudents: true,
        maxSessions: true,
      },
    });
  }

  async submit(dto: CreateTenantRequestDto) {
    this.enabled();
    if (!['terraform', 'cloudformation'].includes(dto.engine))
      throw new BadRequestException(
        'Selecciona Terraform o CloudFormation para solicitar un despliegue disponible.',
      );
    try {
      const request = await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.slug}))`;
        const existing = await transaction.platformTenant.findUnique({
          where: { slug: dto.slug },
          select: { id: true },
        });
        if (existing)
          throw new ConflictException(
            'Ese identificador ya pertenece a una institución.',
          );
        const plan = await transaction.platformPlan.findFirst({
          where: { id: dto.planId, active: true },
        });
        if (!plan) throw new BadRequestException('Selecciona un plan vigente.');
        const created = await transaction.tenantRequest.create({
          data: {
            name: dto.name.trim(),
            slug: dto.slug,
            contactEmail: dto.contactEmail.toLowerCase(),
            contactPhone: dto.phone.trim(),
            color: dto.color || '#059669',
            environment: dto.environment,
            engine: dto.engine,
            planId: dto.planId,
            credentials: sealSecret(dto.adminPassword),
          },
          select: { id: true, name: true, status: true },
        });
        await transaction.auditLog.create({
          data: {
            entity: 'TenantRequest',
            entityId: created.id,
            action: 'TENANT_REQUEST_SUBMITTED',
            actor: 'public',
            payload: { slug: dto.slug, planId: dto.planId },
          },
        });
        return created;
      });
      return {
        ...request,
        message:
          'Recibimos tu solicitud. La institución se desplegará después de la revisión y aprobación del administrador.',
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Ya hay una solicitud pendiente con ese identificador.',
        );
      throw error;
    }
  }

  list(status?: string, search?: string) {
    return this.prisma.tenantRequest.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
                { contactEmail: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: requestSelect,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async review(id: string, dto: ReviewTenantRequestDto, actor: string) {
    if (
      dto.decision === 'REJECT' &&
      (!dto.reason || dto.reason.trim().length < 3)
    )
      throw new BadRequestException('Indica el motivo del rechazo.');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const request = await transaction.tenantRequest.findUnique({
          where: { id },
        });
        if (!request) throw new NotFoundException('Solicitud no encontrada.');
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${request.slug}))`;
        const claimed = await transaction.tenantRequest.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            credentials: null,
            reviewedBy: actor,
            reviewedAt: new Date(),
          },
        });
        if (!claimed.count)
          throw new ConflictException('Esta solicitud ya fue revisada.');
        let tenantId: string | null = null;
        if (dto.decision === 'APPROVE') {
          const plan = await transaction.platformPlan.findFirst({
            where: { id: request.planId, active: true },
          });
          if (!plan)
            throw new BadRequestException(
              'El plan solicitado ya no está disponible.',
            );
          const tenant = await transaction.platformTenant.create({
            data: {
              name: request.name,
              slug: request.slug,
              contactEmail: request.contactEmail,
              contactPhone: request.contactPhone,
              color: request.color,
              environment: request.environment,
              engine: request.engine,
              planId: request.planId,
              architectureVersion: 2,
              credentials: sealSecret(
                JSON.stringify({
                  adminPassword: openSecret(request.credentials!),
                  dbPassword: randomBytes(24).toString('hex'),
                  sessionSecret: randomBytes(32).toString('hex'),
                }),
              ),
            },
          });
          tenantId = tenant.id;
          await transaction.platformOperation.create({
            data: {
              tenantId,
              action: 'DEPLOY',
              actor,
              templateVersion: '2.0.0',
              payload: { requestId: request.id },
              logs: [
                'Solicitud aprobada. Se crearán tres instancias: frontend, backend y base de datos.',
              ],
            },
          });
        }
        const updated = await transaction.tenantRequest.update({
          where: { id },
          data: {
            tenantId,
            rejectionReason:
              dto.decision === 'REJECT' ? dto.reason!.trim() : null,
          },
          select: requestSelect,
        });
        await transaction.auditLog.create({
          data: {
            entity: 'TenantRequest',
            entityId: id,
            action:
              dto.decision === 'APPROVE'
                ? 'TENANT_REQUEST_APPROVED'
                : 'TENANT_REQUEST_REJECTED',
            actor,
            payload: {
              tenantId,
              reason: dto.decision === 'REJECT' ? dto.reason!.trim() : null,
            },
          },
        });
        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'El identificador ya está registrado; no se creó otra institución.',
        );
      throw error;
    }
  }
}
