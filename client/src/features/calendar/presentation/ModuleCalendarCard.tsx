import { CalendarRange, Clock3, Download, Flag, FlagTriangleRight, Mail, Phone, Share2 } from 'lucide-react'
import { useState, type ReactNode, type RefObject } from 'react'
import { getErrorMessage } from '../../../core/http/api-error'
import { cn } from '../../../shared/lib/cn'
import { formatLongDate } from '../../../shared/lib/format'
import { Button } from '../../../shared/ui/Button'
import { Card } from '../../../shared/ui/Card'
import { useToast } from '../../../shared/ui/toast'
import { teacherDisplayName, type TeacherProfile } from '../../profile/domain/profile'
import { Avatar } from '../../profile/presentation/Avatar'
import type { CalendarImageSource } from '../application/use-calendar-image'
import {
  monthsBetween,
  scheduleOf,
  todayIso,
  WEEKDAYS_SHORT,
  type CalendarSession,
} from '../domain/calendar'
import { ShareCalendarDialog } from './ShareCalendarDialog'

/** Botón "Compartir" (abre las opciones) y descarga directa de la imagen. */
export function CalendarShareActions({ source, text }: { source: CalendarImageSource; text: string }) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const toast = useToast()

  const download = async () => {
    setDownloading(true)
    try {
      const image = await source.render()
      const link = document.createElement('a')
      link.href = image.url
      link.download = image.file.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(image.url), 1000)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <Button icon={<Share2 className="size-4" />} onClick={() => setOpen(true)}>
        Compartir
      </Button>
      <Button variant="secondary" icon={<Download className="size-4" />} onClick={download} loading={downloading}>
        Descargar imagen
      </Button>
      <ShareCalendarDialog open={open} onClose={() => setOpen(false)} source={source} text={text} />
    </>
  )
}

/**
 * Tarjeta del calendario de clases del módulo: meses con los días de clase, inicio y fin,
 * horario de clases sincrónicas y docente. La usan el administrador y el estudiante.
 */
export function ModuleCalendarCard({
  moduleName,
  sessions,
  teacher,
  teacherPhotoUrl,
  cardRef,
}: {
  moduleName: string
  /** Ordenadas por fecha; al menos una. */
  sessions: CalendarSession[]
  teacher: TeacherProfile | null
  teacherPhotoUrl: string | null
  cardRef?: RefObject<HTMLDivElement | null>
}) {
  const today = todayIso()
  const byDate = new Map(sessions.map((s) => [s.classDate, s]))
  const first = sessions[0].classDate
  const last = sessions[sessions.length - 1].classDate
  const schedule = scheduleOf(sessions)
  const done = sessions.filter((s) => s.classDate < today).length
  const months = monthsBetween(first, last)

  return (
    <div ref={cardRef} className="rounded-2xl">
      <Card className="overflow-hidden print:border-0 print:shadow-none">
        <div className="relative overflow-hidden bg-linear-to-br from-brand via-brand to-[#5b5cf0] px-5 py-6 text-white sm:px-8 sm:py-8 print:bg-brand">
          <div aria-hidden className="absolute -top-20 -right-10 size-64 rounded-full bg-deco-violet/70" />
          <div aria-hidden className="absolute -bottom-16 left-1/3 size-40 rounded-full bg-deco-teal/25 blur-2xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-white/70 uppercase">Calendario de clases del módulo</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{moduleName}</h2>
            </div>
            {teacher && (
              <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 pr-5 ring-1 ring-white/20 backdrop-blur">
                <Avatar name={teacher.fullName} photoUrl={teacherPhotoUrl} className="size-14 text-lg ring-2 ring-white/40" />
                <div>
                  <p className="text-xs font-semibold text-white/70 uppercase">Docente</p>
                  <p className="font-bold">{teacherDisplayName(teacher)}</p>
                  {teacher.specialty && <p className="text-sm text-white/75">{teacher.specialty}</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1fr_300px]">
          <div className={cn('grid content-start gap-5', months.length > 1 ? 'sm:grid-cols-2' : 'max-w-md')}>
            {months.map(({ year, month }) => (
              <MonthCalendar key={`${year}-${month}`} year={year} month={month} byDate={byDate} today={today} />
            ))}
          </div>

          <aside className="space-y-4">
            <InfoItem icon={<Flag className="size-4" />} tone="text-teal-ink bg-teal-soft" label="Inicio de módulo" value={formatLongDate(first)} />
            <InfoItem
              icon={<FlagTriangleRight className="size-4" />}
              tone="text-alert-ink bg-alert-soft"
              label="Fin de módulo"
              value={formatLongDate(last)}
            />
            <InfoItem
              icon={<Clock3 className="size-4" />}
              tone="text-brand-ink bg-brand-soft"
              label="Clases sincrónicas"
              value={
                <span className="space-y-1">
                  {schedule.map((s) => (
                    <span key={s.hours} className="block">
                      <span className="block first-letter:uppercase">{s.days}</span>
                      <span className="block font-normal text-muted">{s.hours}</span>
                    </span>
                  ))}
                </span>
              }
            />
            <InfoItem
              icon={<CalendarRange className="size-4" />}
              tone="text-accent-ink bg-accent-soft"
              label="Total de clases"
              value={
                <>
                  {sessions.length} clases
                  <span className="block font-normal text-muted">
                    {done} realizadas · {sessions.length - done} por venir
                  </span>
                </>
              }
            />

            <div className="flex flex-wrap gap-4 border-t border-line pt-4 text-xs text-muted">
              <span className="flex items-center gap-2">
                <span className="size-3.5 rounded bg-teal" /> Día de clase
              </span>
              <span className="flex items-center gap-2">
                <span className="size-3.5 rounded ring-2 ring-brand" /> Hoy
              </span>
            </div>

            {teacher && (teacher.email || teacher.phone) && (
              <div className="space-y-1.5 rounded-xl bg-canvas p-4 text-sm">
                <p className="font-semibold">Contacto del docente</p>
                <p className="flex items-center gap-2 break-all text-muted">
                  <Mail className="size-4 shrink-0" /> {teacher.email}
                </p>
                {teacher.phone && (
                  <p className="flex items-center gap-2 text-muted">
                    <Phone className="size-4 shrink-0" /> {teacher.phone}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      </Card>
    </div>
  )
}

function MonthCalendar({
  year,
  month,
  byDate,
  today,
}: {
  year: number
  month: number
  byDate: Map<string, CalendarSession>
  today: string
}) {
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells = [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const name = new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month, 1)),
  )
  const iso = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  return (
    <div className="overflow-hidden rounded-2xl border border-line break-inside-avoid">
      <p className="bg-brand-soft py-2.5 text-center font-bold text-brand-ink first-letter:uppercase">{name}</p>
      <div className="grid grid-cols-7 gap-1 p-3 text-center text-sm">
        {WEEKDAYS_SHORT.map((d) => (
          <span key={d} className="py-1 text-xs font-bold text-brand uppercase">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />
          const date = iso(day)
          const session = byDate.get(date)
          return (
            <span
              key={i}
              title={session ? `Clase de ${session.startTime} a ${session.endTime}` : undefined}
              className={cn(
                'grid aspect-square place-items-center rounded-lg tabular-nums',
                session ? 'bg-teal font-bold text-white' : 'text-ink/70',
                session && date < today && 'opacity-60',
                date === today && 'ring-2 ring-brand ring-offset-1',
              )}
            >
              {day}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function InfoItem({
  icon,
  tone,
  label,
  value,
}: {
  icon: ReactNode
  tone: string
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', tone)}>{icon}</span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-muted">{label}</p>
        <div className="font-bold text-ink">{value}</div>
      </div>
    </div>
  )
}
