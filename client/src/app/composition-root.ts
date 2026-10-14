import type { Dependencies } from '../core/di/dependencies'
import { HttpAcademicModuleRepository } from '../features/academic-modules/infrastructure/http-academic-module.repository'
import { HttpActivityRepository } from '../features/activity/infrastructure/http-activity.repository'
import { HttpAttendanceRepository } from '../features/attendance/infrastructure/http-attendance.repository'
import { HttpAuthRepository } from '../features/auth/infrastructure/http-auth.repository'
import { HttpProfileRepository } from '../features/profile/infrastructure/http-profile.repository'
import { HttpStudentRepository } from '../features/students/infrastructure/http-student.repository'

/** Único lugar donde se eligen las implementaciones concretas (adaptadores HTTP). */
export const dependencies: Dependencies = {
  auth: new HttpAuthRepository(),
  attendance: new HttpAttendanceRepository(),
  students: new HttpStudentRepository(),
  activity: new HttpActivityRepository(),
  modules: new HttpAcademicModuleRepository(),
  profile: new HttpProfileRepository(),
}
