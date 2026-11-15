import { Controller, ForbiddenException, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiAuthGuard, AuthRoleGuard, RequireRoles, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { StudentService } from './student.service.js';

@Controller('student')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get(':studentId')
  @UseGuards(ApiAuthGuard, AuthRoleGuard)
  @RequireRoles('student')
  getStudent(@Param('studentId') studentId: string, @Req() request: AuthenticatedRequest) {
    if (studentId !== request.authUser!.id && studentId.toLowerCase() !== request.authUser!.username.toLowerCase()) {
      throw new ForbiddenException('Solo puedes consultar tu propio historial.');
    }
    return this.studentService.getStudentSummary(request.authUser!.id);
  }
}
