import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { ApiAuthGuard, AuthRoleGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, ApiAuthGuard, AuthRoleGuard],
  exports: [AuthService, ApiAuthGuard, AuthRoleGuard],
})
export class AuthModule {}
