import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { ProvisionerService } from './provisioner.service.js';
import { MetricsController, MetricsService } from './metrics.controller.js';
import { PublicPlatformController } from './public-platform.controller.js';
import { TenantRequestsService } from './tenant-requests.service.js';

@Module({
  controllers: [PlatformController, MetricsController, PublicPlatformController],
  providers: [PlatformService, ProvisionerService, MetricsService, TenantRequestsService],
  exports: [MetricsService],
})
export class PlatformModule {}
