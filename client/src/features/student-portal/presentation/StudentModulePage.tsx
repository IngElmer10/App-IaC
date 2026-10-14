import { CalendarDays } from 'lucide-react'
import { getErrorMessage } from '../../../core/http/api-error'
import { Card } from '../../../shared/ui/Card'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { PageLoader } from '../../../shared/ui/Spinner'
import { useMyAttendance } from '../../attendance/application/attendance.queries'
import { calendarFileName, useCalendarImage } from '../../calendar/application/use-calendar-image'
import { calendarSummaryText } from '../../calendar/domain/calendar'
import { CalendarShareActions, ModuleCalendarCard } from '../../calendar/presentation/ModuleCalendarCard'
import { useTeacher, useTeacherPhotoUrl } from '../../profile/application/profile.queries'
import { teacherDisplayName } from '../../profile/domain/profile'
import { AttendanceRulesInfo } from './AttendanceRulesInfo'
import { TeacherCard } from './TeacherCard'

/** El módulo visto por el estudiante: calendario, horario, docente y reglas de asistencia. */
export function StudentModulePage() {
  const { data, isLoading, error } = useMyAttendance()
  const teacher = useTeacher()
  const teacherPhotoUrl = useTeacherPhotoUrl()
  const image = useCalendarImage(calendarFileName(data?.module.name ?? 'modulo'))

  if (isLoading) return <PageLoader />
  if (error || !data || data.records.length === 0) {
    return (
      <Card>
        <EmptyState icon={<CalendarDays className="size-6" />} title="No pudimos cargar el módulo" description={getErrorMessage(error)} />
      </Card>
    )
  }

  const sessions = data.records.map((r) => ({ classDate: r.date, startTime: r.startTime, endTime: r.endTime }))
  const teacherData = teacher.data ?? null

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Mi módulo"
          description="Fechas de clase, horario, docente y cómo se registra tu asistencia."
          actions={
            <CalendarShareActions
              source={image}
              text={calendarSummaryText({
                moduleName: data.module.name,
                sessions,
                teacherName: teacherData ? teacherDisplayName(teacherData) : null,
              })}
            />
          }
        />
      </div>

      <ModuleCalendarCard
        moduleName={data.module.name}
        sessions={sessions}
        teacher={teacherData}
        teacherPhotoUrl={teacherPhotoUrl}
        cardRef={image.ref}
      />

      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        <TeacherCard teacher={teacherData} photoUrl={teacherPhotoUrl} />
        <AttendanceRulesInfo rules={data.rules} sampleClass={sessions[0]} />
      </div>
    </div>
  )
}
