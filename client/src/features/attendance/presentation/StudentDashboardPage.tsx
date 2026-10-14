import { AlarmClock, CalendarDays, CheckCircle2, FileCheck2, Fingerprint, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../../shared/lib/cn'
import { getErrorMessage } from '../../../core/http/api-error'
import { formatLongDate, formatTime } from '../../../shared/lib/format'
import { Button } from '../../../shared/ui/Button'
import { Card, CardHeader } from '../../../shared/ui/Card'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { PageLoader } from '../../../shared/ui/Spinner'
import { useToast } from '../../../shared/ui/toast'
import { useMarkAttendance, useMyAttendance } from '../application/attendance.queries'
import { isAttended, type MyAttendance } from '../domain/attendance'
import { AttendanceHistoryTable } from './AttendanceHistoryTable'
import { AttendanceStats, RiskBanner } from './AttendanceStats'
import { MarkCountdownNotice } from './MarkCountdownNotice'

export function StudentDashboardPage() {
  const { data, isLoading, error, dataUpdatedAt } = useMyAttendance()

  if (isLoading) return <PageLoader />
  if (error || !data) {
    return (
      <Card>
        <EmptyState
          icon={<CalendarDays className="size-6" />}
          title="No pudimos cargar tu asistencia"
          description={getErrorMessage(error)}
        />
      </Card>
    )
  }

  const firstName = data.student.fullName.split(' ')[0]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-brand">{data.module.name}</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Hola, {firstName}</h1>
      </div>

      <TodayCard data={data} fetchedAt={dataUpdatedAt} />

      <RiskBanner data={data} audience="student" />

      <AttendanceStats data={data} />

      <Card>
        <CardHeader title="Mi historial" description={`${data.summary.total} sesiones de clase en este módulo`} />
        <AttendanceHistoryTable records={data.records} today={data.today} />
      </Card>
    </div>
  )
}

function TodayCard({ data, fetchedAt }: { data: MyAttendance; fetchedAt: number }) {
  const mark = useMarkAttendance()
  const toast = useToast()
  const record = data.todayRecord
  const nextClass = data.records.find((r) => r.date > data.today)

  const markWindow = data.markWindow

  const onMark = () =>
    mark.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(
          result.status === 'ATRASO'
            ? `Asistencia registrada con atraso a las ${formatTime(result.markedAt!)}`
            : `¡Listo! Asistencia registrada a las ${formatTime(result.markedAt!)}`,
        ),
      onError: (err) => toast.error(getErrorMessage(err)),
    })

  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-16 -right-16 size-56 rounded-full bg-brand-soft" />
      <div aria-hidden className="absolute -right-6 -bottom-10 size-24 rounded-full bg-teal-soft" />
      <div className="relative flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-muted">Hoy</p>
          <p className="text-xl font-extrabold sm:text-2xl">{formatLongDate(data.today)}</p>
          {record ? (
            <>
              <p className="mt-1 text-muted">
                Clase de {record.startTime} a {record.endTime}
              </p>
              {markWindow && record.status === 'PENDIENTE' && (
                <p className="mt-3 max-w-md text-sm text-muted">
                  Marca entre <strong className="text-ink">{markWindow.opensAt}</strong> y{' '}
                  <strong className="text-ink">{markWindow.onTimeUntil}</strong> para quedar como Presente. Hasta las{' '}
                  <strong className="text-ink">{markWindow.lateUntil}</strong> se registra como Atraso; después, Falta.
                </p>
              )}
              {data.countdown && <MarkCountdownNotice countdown={data.countdown} fetchedAt={fetchedAt} />}
            </>
          ) : (
            <p className="mt-1 text-muted">
              Hoy no tienes clase programada.
              {nextClass && <> Próxima clase: <strong className="text-ink">{formatLongDate(nextClass.date)}</strong>.</>}
            </p>
          )}
        </div>

        <div className="md:text-right">
          {record && isAttended(record.status) ? (
            <TodayResult
              className={record.status === 'ATRASO' ? 'bg-warning-soft text-warning-ink' : 'bg-brand-soft text-brand-ink'}
              icon={record.status === 'ATRASO' ? <AlarmClock className="size-7" /> : <CheckCircle2 className="size-7" />}
              title={record.status === 'ATRASO' ? 'Asistencia registrada con atraso' : 'Asistencia registrada'}
              detail={record.markedAt ? `Marcada a las ${formatTime(record.markedAt)}` : 'Registrada por el administrador'}
            />
          ) : record?.status === 'JUSTIFICADO' ? (
            <TodayResult
              className="bg-info-soft text-info-ink"
              icon={<FileCheck2 className="size-7" />}
              title="Falta justificada"
              detail="El administrador justificó tu inasistencia de hoy"
            />
          ) : record?.status === 'FALTA' ? (
            <TodayResult
              className="bg-alert-soft text-alert-ink"
              icon={<ShieldCheck className="size-7" />}
              title="Registrado como falta"
              detail={
                record.source === 'ADMIN'
                  ? 'El administrador actualizó tu registro de hoy'
                  : `El tiempo para marcar terminó a las ${markWindow?.lateUntil}`
              }
            />
          ) : (
            <Button
              size="lg"
              onClick={onMark}
              loading={mark.isPending}
              disabled={!data.canMarkToday}
              icon={<Fingerprint className="size-5" />}
              className="w-full md:w-auto"
              title={data.canMarkToday ? undefined : 'Solo puedes marcar en una fecha de clase'}
            >
              {record && markWindow && !data.canMarkToday ? `Se habilita a las ${markWindow.opensAt}` : 'Marcar asistencia'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function TodayResult({
  className,
  icon,
  title,
  detail,
}: {
  className: string
  icon: ReactNode
  title: string
  detail: string
}) {
  return (
    <div className={cn('inline-flex items-center gap-3 rounded-2xl px-5 py-4', className)}>
      {icon}
      <div className="text-left">
        <p className="font-bold">{title}</p>
        <p className="text-sm">{detail}</p>
      </div>
    </div>
  )
}
