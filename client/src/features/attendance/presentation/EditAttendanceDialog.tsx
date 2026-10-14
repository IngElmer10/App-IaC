import { AlarmClock, Check, FileCheck2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { getErrorMessage } from '../../../core/http/api-error'
import { cn } from '../../../shared/lib/cn'
import { formatLongDate, formatTime } from '../../../shared/lib/format'
import { Button } from '../../../shared/ui/Button'
import { Modal } from '../../../shared/ui/Modal'
import { useToast } from '../../../shared/ui/toast'
import { useActiveModule } from '../../academic-modules/application/academic-modules.queries'
import { useUpdateAttendance } from '../application/attendance.queries'
import {
  ALL_STATUSES,
  BASIC_STATUSES,
  isAttended,
  STATUS_LABELS,
  type AttendanceRecord,
  type EditableStatus,
  type StudentRef,
} from '../domain/attendance'
import { StatusChip } from './StatusChip'

export interface EditTarget {
  student: StudentRef
  record: AttendanceRecord
}

/** RF-07: el administrador cambia el estado en cualquier fecha; el cambio queda auditado. */
export function EditAttendanceDialog({ target, onClose }: { target: EditTarget | null; onClose: () => void }) {
  return (
    <Modal open={target !== null} onClose={onClose} title="Modificar asistencia">
      {target && <EditForm key={`${target.student.id}-${target.record.sessionId}`} target={target} onClose={onClose} />}
    </Modal>
  )
}

function EditForm({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const { student, record } = target
  const update = useUpdateAttendance()
  const rulesEnabled = useActiveModule().data?.rules.enabled ?? false
  const options = rulesEnabled ? ALL_STATUSES : BASIC_STATUSES
  const toast = useToast()
  const [status, setStatus] = useState<EditableStatus>(record.status === 'PRESENTE' ? 'FALTA' : 'PRESENTE')
  const [reason, setReason] = useState('')

  const save = () =>
    update.mutate(
      { studentId: student.id, sessionId: record.sessionId, status, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`${student.fullName}: ${STATUS_LABELS[record.status]} → ${STATUS_LABELS[status]}`)
          onClose()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-canvas p-4">
        <p className="font-bold">{student.fullName}</p>
        <p className="text-sm text-muted">
          Reg. {student.registrationNumber} · {formatLongDate(record.date)}
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted">Estado actual:</span>
          <StatusChip status={record.status} />
          {record.markedAt && isAttended(record.status) && (
            <span className="text-muted">({formatTime(record.markedAt)})</span>
          )}
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Nuevo estado</legend>
        <div className="grid grid-cols-2 gap-3">
          {options.map((option) => (
            <StatusOption
              key={option}
              active={status === option}
              onClick={() => setStatus(option)}
              status={option}
            />
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="reason" className="text-sm font-semibold">
          Motivo <span className="font-normal text-muted">(opcional)</span>
        </label>
        <textarea
          id="reason"
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej.: presentó justificativo"
          className="w-full rounded-xl border border-line px-3 py-2 text-sm focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none"
        />
      </div>

      <p className="text-xs text-muted">El cambio quedará registrado con tu usuario, la fecha, la hora y los valores anterior y nuevo.</p>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save} loading={update.isPending} disabled={status === record.status}>
          Guardar cambio
        </Button>
      </div>
    </div>
  )
}

const OPTION_META: Record<EditableStatus, { icon: ReactNode; active: string; hover: string }> = {
  PRESENTE: {
    icon: <Check className="size-5" strokeWidth={3} />,
    active: 'border-brand bg-brand-soft text-brand-ink',
    hover: 'hover:border-brand/40',
  },
  ATRASO: {
    icon: <AlarmClock className="size-5" />,
    active: 'border-warning bg-warning-soft text-warning-ink',
    hover: 'hover:border-warning/40',
  },
  FALTA: {
    icon: <X className="size-5" strokeWidth={3} />,
    active: 'border-alert bg-alert-soft text-alert-ink',
    hover: 'hover:border-alert/40',
  },
  JUSTIFICADO: {
    icon: <FileCheck2 className="size-5" />,
    active: 'border-info bg-info-soft text-info-ink',
    hover: 'hover:border-info/40',
  },
}

function StatusOption({ active, onClick, status }: { active: boolean; onClick: () => void; status: EditableStatus }) {
  const meta = OPTION_META[status]
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl border-2 border-line py-3 font-semibold transition',
        active ? meta.active : meta.hover,
      )}
    >
      {meta.icon}
      {STATUS_LABELS[status]}
    </button>
  )
}
