import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAuthGuard,
  AuthRoleGuard,
  RequireRoles,
  type AuthenticatedRequest,
} from '../auth/auth.guard.js';
import {
  CreateTenantDto,
  TenantActionDto,
  UpdatePlanDto,
  ReviewTenantRequestDto,
} from './dto/platform.dto.js';
import { PlatformService } from './platform.service.js';
import { TenantRequestsService } from './tenant-requests.service.js';

@Controller('platform')
@UseGuards(ApiAuthGuard, AuthRoleGuard)
@RequireRoles('platform')
export class PlatformController {
  constructor(
    private readonly service: PlatformService,
    private readonly requests: TenantRequestsService,
  ) {}

  @Get('requests') requestsList(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.requests.list(status, search);
  }
  @Post('requests/:id/review') reviewRequest(
    @Param('id') id: string,
    @Body() dto: ReviewTenantRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.requests.review(id, dto, req.authUser!.username);
  }

  @Get('overview') overview() {
    return this.service.overview();
  }
  @Get('plans') plans() {
    return this.service.getPlans();
  }
  @Patch('plans/:id') updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updatePlan(id, dto, req.authUser!.username);
  }
  @Get('tenants') tenants(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('planId') planId?: string,
    @Query('environment') environment?: string,
  ) {
    return this.service.getTenants({ search, status, planId, environment });
  }
  @Get('tenants/:id') tenant(@Param('id') id: string) {
    return this.service.getTenant(id);
  }
  @Post('tenants') create(
    @Body() dto: CreateTenantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createTenant(dto, req.authUser!.username);
  }
  @Get('tenants/:id/preview') preview(
    @Param('id') id: string,
    @Query('planId') planId?: string,
  ) {
    return this.service.preview(id, planId);
  }
  @Post('tenants/:id/actions') action(
    @Param('id') id: string,
    @Body() dto: TenantActionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.enqueue(id, dto, req.authUser!.username);
  }
  @Post('operations/:id/retry') retry(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.retry(id, req.authUser!.username);
  }
}
