import { Controller, Get, Injectable, Res } from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class MetricsService {
  requests = 0;
  errors = 0;
  durationSeconds = 0;
}

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  async metricsText(@Res() response: Response) {
    let database = 0;
    let students = 0;
    let sessions = 0;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 1;
      [students, sessions] = await Promise.all([
        this.prisma.student.count({
          where: { active: true, module: { active: true } },
        }),
        this.prisma.classSession.count({ where: { module: { active: true } } }),
      ]);
    } catch {}
    const lines = [
      `attendance_database_up ${database}`,
      `attendance_students ${students}`,
      `attendance_sessions ${sessions}`,
      `attendance_http_requests_total ${this.metrics.requests}`,
      `attendance_http_errors_total ${this.metrics.errors}`,
      `attendance_http_duration_seconds_sum ${this.metrics.durationSeconds}`,
      `attendance_http_duration_seconds_count ${this.metrics.requests}`,
      `attendance_process_memory_bytes ${process.memoryUsage().rss}`,
      `attendance_uptime_seconds ${process.uptime()}`,
      `attendance_demo_alert ${existsSync('/opt/tenantforge/demo-alert') ? 1 : 0}`,
    ];
    response.type('text/plain; version=0.0.4').send(`${lines.join('\n')}\n`);
  }
}
