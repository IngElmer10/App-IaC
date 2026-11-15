import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AcademicModuleModule } from './modules/academic/academic.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { StudentModule } from './modules/student/student.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';

@Module({
  imports: [PrismaModule, AuthModule, AcademicModuleModule, AttendanceModule, StudentModule, AdminModule, PlatformModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
