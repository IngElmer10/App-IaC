import type { Role } from '../../auth/domain/auth-user'

export type ActivityAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'MARK_ATTENDANCE'
  | 'EDIT_ATTENDANCE'
  | 'ACTIVATE_MODULE'
  | 'EXPORT_ATTENDANCE'
  | 'UPDATE_RULES'
  | 'SCHEDULE_MODULE'
  | 'CANCEL_SCHEDULE'

export interface ActivityLog {
  id: number
  actorType: Role
  actorId: number
  actorName: string
  action: ActivityAction
  studentId: number | null
  description: string
  details: Record<string, unknown> | null
  createdAt: string
}

export interface ActivityFilters {
  moduleId?: number
  studentId?: number
  date?: string
  page?: number
  pageSize?: number
}

export interface ActivityPage {
  items: ActivityLog[]
  total: number
  page: number
  pageSize: number
}

export const ACTION_LABELS: Record<ActivityAction, string> = {
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  MARK_ATTENDANCE: 'Marcó asistencia',
  EDIT_ATTENDANCE: 'Modificó asistencia',
  ACTIVATE_MODULE: 'Activó módulo',
  EXPORT_ATTENDANCE: 'Exportó asistencias',
  UPDATE_RULES: 'Cambió reglas de asistencia',
  SCHEDULE_MODULE: 'Programó módulo',
  CANCEL_SCHEDULE: 'Canceló programación',
}
