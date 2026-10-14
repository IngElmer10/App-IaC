import { AlarmClock, Bell, CalendarClock, CalendarPlus, FileClock, Layers, TriangleAlert, UserX } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../../../shared/lib/cn'
import { formatTime } from '../../../shared/lib/format'
import { useActiveModule, useModules } from '../../academic-modules/application/academic-modules.queries'
import { formatScheduled, relativeFromNow } from '../../module-history/presentation/schedule-format'
import { useDayActivity } from '../../activity/application/activity.queries'
import { useJustifications } from '../../justifications/application/justifications.queries'
import { useAttendanceOverview } from '../../attendance/application/attendance.queries'
import type { AttendanceStatus } from '../../attendance/domain/attendance'
import { StatusChip } from '../../attendance/presentation/StatusChip'
import { todayIso } from '../../calendar/domain/calendar'

const LAST_SEEN_KEY = 'admin.notificationsLastSeen'

interface Notice {
  key: string
  icon: ReactNode
  tone: string
  title: string
  detail: string
  to: string
  important: boolean
}

interface MarkNotice {
  id: number
  studentName: string
  status: AttendanceStatus
  at: string
  to: string
}

function readLastSeen() {
  try {
    return localStorage.getItem(LAST_SEEN_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Avisos del estado actual y marcas de asistencia de hoy; se refrescan cada 30 s. */
function useNotifications() {
  const today = todayIso()
  const module = useActiveModule()
  const hasModule = !!module.data
  const overview = useAttendanceOverview({}, { refetchInterval: 30_000, enabled: hasModule })
  const activity = useDayActivity(today, hasModule)
  const scheduled = useModules().data?.find((m) => m.status === 'SCHEDULED')
  const pendingJustifications = useJustifications({ status: 'PENDING' }, hasModule).data?.pending ?? 0

  const notices: Notice[] = []
  if (!module.isLoading && !hasModule) {
    notices.push({
      key: 'no-module',
      icon: <Layers className="size-4" />,
      tone: 'bg-brand-soft text-brand-ink',
      title: 'No hay un módulo activo',
      detail: 'Importa estudiantes y fechas para empezar.',
      to: '/admin/nuevo-modulo',
      important: true,
    })
  }

  if (pendingJustifications > 0) {
    notices.push({
      key: 'justifications',
      icon: <FileClock className="size-4" />,
      tone: 'bg-info-soft text-info-ink',
      title: `${pendingJustifications} ${pendingJustifications === 1 ? 'justificación por revisar' : 'justificaciones por revisar'}`,
      detail: 'Estudiantes que enviaron pruebas de una falta o un atraso.',
      to: '/admin/justificaciones',
      important: true,
    })
  }

  if (scheduled?.scheduledFor) {
    notices.push({
      key: 'scheduled',
      icon: <CalendarPlus className="size-4" />,
      tone: 'bg-info-soft text-info-ink',
      title: `"${scheduled.name}" se activará ${relativeFromNow(scheduled.scheduledFor)}`,
      detail: formatScheduled(scheduled.scheduledFor),
      to: `/admin/modulos/${scheduled.id}`,
      important: false,
    })
  }

  const data = hasModule ? overview.data : undefined
  if (data) {
    const todayIndex = data.sessions.findIndex((s) => s.classDate === data.today)
    if (todayIndex >= 0) {
      const session = data.sessions[todayIndex]
      const totals = data.sessionTotals[todayIndex]
      notices.push({
        key: 'today',
        icon: <CalendarClock className="size-4" />,
        tone: 'bg-teal-soft text-teal-ink',
        title: `Hoy hay clase de ${session.startTime} a ${session.endTime}`,
        detail: `${totals.presentes + totals.atrasos} de ${totals.total} estudiantes marcaron asistencia.`,
        to: '/admin/asistencias',
        important: false,
      })
      // Solo hay faltas de hoy cuando se cerró el plazo para marcar.
      if (totals.faltas > 0) {
        notices.push({
          key: 'absent-today',
          icon: <UserX className="size-4" />,
          tone: 'bg-alert-soft text-alert-ink',
          title: `${totals.faltas} ${totals.faltas === 1 ? 'estudiante faltó' : 'estudiantes faltaron'} hoy`,
          detail: 'Se cerró el registro de la clase sin su marca.',
          to: '/admin/asistencias',
          important: true,
        })
      }
    }
    if (data.atRiskCount > 0) {
      notices.push({
        key: 'risk',
        icon: <TriangleAlert className="size-4" />,
        tone: 'bg-alert-soft text-alert-ink',
        title: `${data.atRiskCount} ${data.atRiskCount === 1 ? 'estudiante en riesgo' : 'estudiantes en riesgo'}`,
        detail: `Por debajo del ${data.rules.minAttendancePercentage}% de asistencia.`,
        to: '/admin/asistencias',
        important: true,
      })
    }
    if (!data.rules.enabled) {
      notices.push({
        key: 'rules',
        icon: <AlarmClock className="size-4" />,
        tone: 'bg-warning-soft text-warning-ink',
        title: 'Puntualidad desactivada',
        detail: 'Los estudiantes pueden marcar todo el día de clase.',
        to: '/admin/calendario',
        important: false,
      })
    }
  }

  const marks: MarkNotice[] = (activity.data?.items ?? [])
    .filter((log) => log.action === 'MARK_ATTENDANCE')
    .map((log) => ({
      id: log.id,
      studentName: log.actorName,
      // Las marcas anteriores a las reglas de puntualidad no guardaban el estado: eran Presente.
      status: (log.details?.status as AttendanceStatus | undefined) ?? 'PRESENTE',
      at: log.createdAt,
      to: log.studentId ? `/admin/estudiantes/${log.studentId}` : '/admin/asistencias',
    }))

  return { notices, marks }
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState(readLastSeen)
  // Marca de "nuevo" que se conserva mientras el menú está abierto.
  const [seenWhenOpened, setSeenWhenOpened] = useState(lastSeen)
  const ref = useRef<HTMLDivElement>(null)
  const { notices, marks } = useNotifications()
  const unread = marks.filter((m) => m.at > lastSeen).length
  const hasImportant = notices.some((n) => n.important)

  const toggle = () => {
    if (!open) {
      const now = new Date().toISOString()
      setSeenWhenOpened(lastSeen)
      setLastSeen(now)
      try {
        localStorage.setItem(LAST_SEEN_KEY, now)
      } catch {
        // Sin almacenamiento las marcas vuelven a figurar como nuevas al recargar.
      }
    }
    setOpen(!open)
  }

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Notificaciones${unread ? ` (${unread} nuevas)` : ''}`}
        className="relative grid size-11 place-items-center rounded-full bg-surface text-ink shadow-sm ring-1 ring-line transition hover:ring-brand/30"
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-alert px-1 text-[11px] font-bold text-white ring-2 ring-surface">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : (
          notices.length > 0 && (
            <span
              className={cn(
                'absolute top-2 right-2.5 size-2.5 rounded-full ring-2 ring-surface',
                hasImportant ? 'bg-alert' : 'bg-brand',
              )}
            />
          )
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 flex max-h-[min(36rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line">
          <p className="border-b border-line px-4 py-3 font-bold">Notificaciones</p>
          <div className="overflow-y-auto">
            {notices.length > 0 && (
              <ul className="divide-y divide-line">
                {notices.map((notice) => (
                  <li key={notice.key}>
                    <Link to={notice.to} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-canvas">
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', notice.tone)}>{notice.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{notice.title}</span>
                        <span className="block text-xs text-muted">{notice.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="border-y border-line bg-canvas/70 px-4 py-2 text-xs font-bold tracking-wide text-muted uppercase">
              Marcas de hoy {marks.length > 0 && `(${marks.length})`}
            </p>
            {marks.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Nadie marcó asistencia hoy todavía.</p>
            ) : (
              <ul className="divide-y divide-line">
                {marks.map((mark) => (
                  <li key={mark.id}>
                    <Link to={mark.to} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-ink">
                        {mark.studentName.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <span className="truncate">{mark.studentName}</span>
                          {mark.at > seenWhenOpened && <span className="size-2 shrink-0 rounded-full bg-alert" title="Nueva" />}
                        </span>
                        <span className="block text-xs text-muted">Marcó a las {formatTime(mark.at)}</span>
                      </span>
                      <StatusChip status={mark.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
