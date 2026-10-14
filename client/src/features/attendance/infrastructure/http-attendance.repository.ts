import { http } from '../../../core/http/http-client'
import type {
  AttendanceOverview,
  AttendanceRecord,
  ClassSession,
  MyAttendance,
  OverviewFilters,
  UpdateAttendanceInput,
} from '../domain/attendance'
import type { AttendanceRepository } from '../domain/attendance.repository'

export class HttpAttendanceRepository implements AttendanceRepository {
  async getMine() {
    const { data } = await http.get<MyAttendance>('/attendance/me')
    return data
  }

  async getStudent(studentId: number, moduleId?: number) {
    const { data } = await http.get<MyAttendance>(`/attendance/students/${studentId}`, { params: { moduleId } })
    return data
  }

  async mark() {
    const { data } = await http.post<AttendanceRecord>('/attendance/mark')
    return data
  }

  async getOverview(filters: OverviewFilters) {
    const { data } = await http.get<AttendanceOverview>('/attendance', { params: filters })
    return data
  }

  async getSessions(moduleId?: number) {
    const { data } = await http.get<ClassSession[]>('/sessions', { params: { moduleId } })
    return data
  }

  async update(input: UpdateAttendanceInput) {
    const { data } = await http.patch<AttendanceRecord>('/attendance', input)
    return data
  }

  async export(moduleId?: number) {
    const response = await http.get<Blob>('/attendance/export', { responseType: 'blob', params: { moduleId } })
    const disposition = String(response.headers['content-disposition'] ?? '')
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'asistencias.xlsx'
    return { blob: response.data, fileName }
  }
}
