import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CreateTenantRequestDto } from './dto/platform.dto.js';
import { TenantRequestsService } from './tenant-requests.service.js';

@Controller('public')
export class PublicPlatformController {
  private readonly submissions = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(private readonly requests: TenantRequestsService) {}

  @Get('plans') plans() {
    return this.requests.plans();
  }

  @Post('tenant-requests')
  @HttpCode(202)
  submit(@Body() dto: CreateTenantRequestDto, @Req() request: Request) {
    const now = Date.now();
    for (const [key, entry] of this.submissions)
      if (entry.until < now) this.submissions.delete(key);
    const key = request.ip || 'unknown';
    const entry = this.submissions.get(key) || {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    if (entry.count >= 20)
      throw new HttpException(
        'Se alcanzó el límite de solicitudes. Intenta más tarde.',
        429,
      );
    entry.count++;
    this.submissions.set(key, entry);
    return this.requests.submit(dto);
  }
}
