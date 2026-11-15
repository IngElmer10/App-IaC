import { Module } from '@nestjs/common';
import { AcademicModuleController } from './academic.controller.js';
import { AcademicModuleService } from './academic.service.js';

@Module({
  controllers: [AcademicModuleController],
  providers: [AcademicModuleService],
  exports: [AcademicModuleService],
})
export class AcademicModuleModule {}
