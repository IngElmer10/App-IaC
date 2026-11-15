import { Body, Controller, Get, Param, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiAuthGuard, AuthRoleGuard, RequireRoles } from '../auth/auth.guard.js';
import { AdminService, type ExcelUpload } from './admin.service.js';
import { UpdateAttendanceDto } from './dto/update-attendance.dto.js';

@UseGuards(ApiAuthGuard, AuthRoleGuard)
@RequireRoles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('access-settings')
  getAccessSettings() {
    return this.adminService.getAccessSettings();
  }

  @Post('import/students')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importStudentsFromExcel(@UploadedFile() file: ExcelUpload) {
    return this.adminService.importStudentsFromExcel(file);
  }

  @Post('import/sessions')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importSessionsFromExcel(@UploadedFile() file: ExcelUpload) {
    return this.adminService.importSessionsFromExcel(file);
  }

  @Get('students')
  getStudents(@Query('search') search = '') {
    return this.adminService.getStudents(search);
  }

  @Get('attendance')
  getAttendance(@Query('date') date?: string, @Query('search') search?: string) {
    return this.adminService.getAttendanceOverview({ date, search });
  }

  @Put('attendance/:sessionId/:studentId')
  updateAttendance(
    @Param('sessionId') sessionId: string,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.adminService.updateAttendance(sessionId, studentId, dto.status);
  }

  @Get('activities')
  getActivities(@Query('date') date?: string, @Query('search') search?: string) {
    return this.adminService.getActivities({ date, search });
  }

  @Get('templates/:kind')
  async downloadTemplate(@Param('kind') kind: string, @Res() response: Response) {
    const buffer = await this.adminService.createTemplate(kind);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="plantilla-${kind}.xlsx"`);
    response.send(buffer);
  }

  @Get('attendance/export')
  async exportAttendance(@Query('date') date: string | undefined, @Query('search') search: string | undefined, @Res() response: Response) {
    const buffer = await this.adminService.exportAttendance({ date, search });
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', 'attachment; filename="asistencias.xlsx"');
    response.send(buffer);
  }
}
