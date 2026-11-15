import { Body, Controller, Get, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiAuthGuard, AuthRoleGuard, RequireRoles } from '../auth/auth.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivateModuleDto, RestartModuleDto } from './dto/module.dto.js';

@Controller('modules')
export class AcademicModuleController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('active')
  getActiveModule() {
    return this.prisma.academicModule.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('activate')
  @UseGuards(ApiAuthGuard, AuthRoleGuard)
  @RequireRoles('admin')
  async activate(@Body() dto: ActivateModuleDto) {
    const module = await this.prisma.academicModule.findUnique({ where: { id: dto.moduleId } });
    if (!module) {
      throw new NotFoundException('No se encontró el módulo solicitado.');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(674301)`;
      await transaction.academicModule.updateMany({ where: { active: true }, data: { active: false } });
      await transaction.academicModule.update({ where: { id: dto.moduleId }, data: { active: true } });
      await transaction.auditLog.create({
        data: { entity: 'AcademicModule', entityId: dto.moduleId, action: 'ACTIVATE_MODULE', actor: 'admin' },
      });
    });

    return this.prisma.academicModule.findUnique({ where: { id: dto.moduleId } });
  }

  @Post('restart')
  @UseGuards(ApiAuthGuard, AuthRoleGuard)
  @RequireRoles('admin')
  async restart(@Body() dto: RestartModuleDto) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const name = dto.name?.trim() || `Módulo ${year}-${month}`;

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(674301)`;
      const previousModule = await transaction.academicModule.findFirst({ where: { active: true } });
      await transaction.academicModule.updateMany({ where: { active: true }, data: { active: false } });
      const module = await transaction.academicModule.create({
        data: {
          code: `MOD-${year}${month}-${randomUUID().slice(0, 8).toUpperCase()}`,
          name,
          active: true,
        },
      });
      await transaction.auditLog.create({
        data: {
          entity: 'AcademicModule',
          entityId: module.id,
          action: 'ACTIVATE_NEW_MODULE',
          actor: 'admin',
          payload: { previousModuleId: previousModule?.id ?? null, name },
        },
      });
      return module;
    });
  }
}
