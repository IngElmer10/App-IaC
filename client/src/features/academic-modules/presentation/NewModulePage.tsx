import { AlarmClock, AlertTriangle, CalendarClock, CheckCircle2, FileWarning, Rocket, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { getErrorDetails, getErrorMessage } from '../../../core/http/api-error'
import { cn } from '../../../shared/lib/cn'
import { Button } from '../../../shared/ui/Button'
import { Card, CardHeader } from '../../../shared/ui/Card'
import { Field, Input } from '../../../shared/ui/Field'
import { FileDrop } from '../../../shared/ui/FileDrop'
import { Modal } from '../../../shared/ui/Modal'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { useToast } from '../../../shared/ui/toast'
import { formatScheduled, toLocalInput } from '../../module-history/presentation/schedule-format'
import { Spinner } from '../../../shared/ui/Spinner'
import {
  useActivateModule,
  useActiveModule,
  useModules,
  usePreviewImport,
  useValidateDraft,
} from '../application/academic-modules.queries'
import type { ImportDraft, ImportErrors } from '../domain/academic-module'
import { ImportDraftEditor, type ExtraSelection } from './ImportDraftEditor'

/** RF-11, RF-12, RF-13 y RF-16: importar, revisar y activar un nuevo módulo. */
export function NewModulePage() {
  const [name, setName] = useState('')
  const [studentsFile, setStudentsFile] = useState<File | null>(null)
  const [sessionsFile, setSessionsFile] = useState<File | null>(null)
  // Borrador editable: lo leído de los Excel más las correcciones hechas a mano.
  const [draft, setDraft] = useState<ImportDraft | null>(null)
  const [errors, setErrors] = useState<ImportErrors>({ students: [], sessions: [] })
  const [valid, setValid] = useState(false)
  const [extras, setExtras] = useState<ExtraSelection[]>([])
  const [manualChanges, setManualChanges] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')

  const active = useActiveModule()
  const existingScheduled = useModules().data?.find((m) => m.status === 'SCHEDULED')
  const scheduling = mode === 'schedule'
  const scheduledIso = scheduling && scheduledAt ? new Date(scheduledAt).toISOString() : undefined
  const previewImport = usePreviewImport()
  const validateDraft = useValidateDraft()
  const activate = useActivateModule()
  const toast = useToast()
  const navigate = useNavigate()

  const files = studentsFile && sessionsFile ? { students: studentsFile, sessions: sessionsFile } : null

  const resetPreview = () => setDraft(null)

  const validate = () => {
    if (!files) return
    previewImport.mutate(files, {
      onSuccess: (result) => {
        setDraft(result.draft)
        setErrors(result.errors)
        setValid(result.valid)
        setManualChanges(0)
        // Por privacidad, las columnas extra empiezan visibles solo para el administrador.
        setExtras(
          result.extraColumns.map((c) => ({ ...c, label: c.header, enabled: true, visibleToStudent: false })),
        )
        if (result.valid) toast.success('Los archivos son válidos. Revisa la vista previa.')
        else toast.error('Hay filas con errores: corrígelas en la vista previa o en el Excel')
      },
      onError: (err) => {
        setDraft(null)
        toast.error(getErrorMessage(err))
      },
    })
  }

  // Cada corrección manual se revalida en el servidor (con una pequeña espera para agrupar cambios).
  const requestId = useRef(0)
  const [pendingValidation, setPendingValidation] = useState(false)
  const { mutate: revalidate } = validateDraft
  useEffect(() => {
    if (!draft || manualChanges === 0) return
    const id = ++requestId.current
    const timer = setTimeout(() => {
      revalidate(draft, {
        onSuccess: (result) => {
          if (id !== requestId.current) return
          setErrors(result.errors)
          setValid(result.valid)
        },
        onSettled: () => id === requestId.current && setPendingValidation(false),
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [draft, manualChanges, revalidate])

  const onDraftChange = (next: ImportDraft) => {
    setDraft(next)
    setManualChanges((n) => n + 1)
    setPendingValidation(true)
  }

  const selectedFields = extras
    .filter((e) => e.enabled)
    .map(({ key, label, visibleToStudent }) => ({ key, label: label.trim() || key, visibleToStudent }))

  const confirmActivation = () => {
    if (!draft) return
    activate.mutate(
      { name: name.trim(), draft, extraFields: selectedFields, scheduledFor: scheduledIso },
      {
        onSuccess: (module) => {
          if (module.status === 'SCHEDULED') {
            toast.success(`Módulo "${module.name}" programado para el ${formatScheduled(module.scheduledFor!)}`)
            navigate('/admin/modulos')
          } else {
            toast.success(`Módulo "${module.name}" activado con ${module.studentCount} estudiantes`)
            navigate('/admin')
          }
        },
        onError: (err) => {
          setConfirming(false)
          const details = getErrorDetails<ImportErrors>(err)
          if (details) {
            setErrors(details)
            setValid(false)
          }
          toast.error(getErrorMessage(err))
        },
      },
    )
  }

  const errorCount = errors.students.length + errors.sessions.length
  const canActivate =
    !!draft &&
    valid &&
    !pendingValidation &&
    name.trim().length > 0 &&
    (!scheduling || (!!scheduledAt && !existingScheduled))

  return (
    <>
      <PageHeader
        title="Nuevo módulo"
        description="Carga los estudiantes y las fechas de clase. El módulo actual se archivará sin borrar sus datos."
      />

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit">
          <CardHeader title="1. Datos del módulo" />
          <div className="space-y-5 p-5">
            <Field label="Nombre del módulo" htmlFor="module-name">
              <Input
                id="module-name"
                placeholder="Ej.: Módulo 3 – Noviembre 2026"
                maxLength={150}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <FileDrop
              label="Excel de estudiantes"
              hint="Columnas: Número de registro · Nombre completo · Correo electrónico"
              file={studentsFile}
              tone="teal"
              onChange={(file) => {
                setStudentsFile(file)
                resetPreview()
              }}
            />
            <FileDrop
              label="Excel de fechas de clase"
              hint="Columnas: Fecha (DD/MM/AAAA) · Hora inicio · Hora fin"
              file={sessionsFile}
              onChange={(file) => {
                setSessionsFile(file)
                resetPreview()
              }}
            />
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">¿Cuándo se activa?</legend>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
                <TabButton active={!scheduling} onClick={() => setMode('now')}>
                  <Rocket className="size-4" /> Ahora
                </TabButton>
                <TabButton active={scheduling} onClick={() => setMode('schedule')}>
                  <CalendarClock className="size-4" /> Programar
                </TabButton>
              </div>
            </fieldset>
            {scheduling &&
              (existingScheduled ? (
                <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-ink">
                  Ya hay un módulo programado (<strong>{existingScheduled.name}</strong>). Cancélalo o actívalo desde{' '}
                  <Link to="/admin/modulos" className="font-bold underline">
                    Módulos
                  </Link>{' '}
                  antes de programar otro.
                </p>
              ) : (
                <Field
                  label="Fecha y hora de activación"
                  htmlFor="scheduled-at"
                  hint="El módulo actual sigue funcionando hasta ese momento; luego se cambia automáticamente."
                >
                  <Input
                    id="scheduled-at"
                    type="datetime-local"
                    min={toLocalInput(new Date())}
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </Field>
              ))}
            <Button className="w-full" variant="secondary" disabled={!files} loading={previewImport.isPending} onClick={validate}>
              Validar y ver vista previa
            </Button>
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader
            title="2. Vista previa"
            description={draft ? 'Corrige, quita o agrega filas antes de activar' : 'Valida los archivos para revisar lo que se importará'}
            actions={
              draft && (
                <Button
                  icon={scheduling ? <CalendarClock className="size-4" /> : <Rocket className="size-4" />}
                  disabled={!canActivate}
                  onClick={() => setConfirming(true)}
                >
                  {scheduling ? 'Programar módulo' : 'Activar módulo'}
                </Button>
              )
            }
          />
          {!draft ? (
            <div className="flex flex-col items-center px-6 py-16 text-center text-muted">
              <FileWarning className="mb-3 size-10 text-line" />
              <p className="text-sm">Aún no hay archivos validados.</p>
            </div>
          ) : (
            <div className="space-y-4 p-5">
              <DraftStatus
                validating={pendingValidation}
                errorCount={errorCount}
                manualChanges={manualChanges}
                missingName={!name.trim()}
              />
              <ImportDraftEditor
                draft={draft}
                errors={errors}
                extras={extras}
                onDraftChange={onDraftChange}
                onExtrasChange={setExtras}
              />
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={confirming}
        onClose={() => !activate.isPending && setConfirming(false)}
        title={scheduling ? '¿Programar el nuevo módulo?' : '¿Activar el nuevo módulo?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={activate.isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmActivation} loading={activate.isPending}>
              {scheduling ? 'Sí, programar' : 'Sí, activar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          {scheduling && scheduledIso && (
            <div className="flex gap-3 rounded-xl bg-info-soft p-4 text-info-ink">
              <AlarmClock className="size-5 shrink-0" />
              <p>
                Se activará automáticamente el <strong>{formatScheduled(scheduledIso)}</strong>. Hasta entonces todo sigue
                igual y puedes cambiar la fecha, activarlo antes o cancelarlo desde Módulos.
              </p>
            </div>
          )}
          <div className="flex gap-3 rounded-xl bg-alert-soft p-4 text-alert-ink">
            <ShieldAlert className="size-5 shrink-0" />
            <p>
              {active.data ? (
                <>
                  {scheduling ? 'En ese momento, el' : 'El'} módulo <strong>{active.data.name}</strong> dejará de estar
                  activo. Sus estudiantes ya no podrán ingresar, pero toda su información se conservará y podrás verla en{' '}
                  <strong>Módulos</strong>.
                </>
              ) : (
                'Este será el primer módulo activo del sistema.'
              )}
            </p>
          </div>
          <p>
            {scheduling ? 'Se programará' : 'Se activará'} <strong>{name.trim()}</strong> con <strong>{draft?.students.length}</strong>{' '}
            estudiantes y <strong>{draft?.sessions.length}</strong> fechas de clase, sin registros de asistencia.
          </p>
          {manualChanges > 0 && <p className="text-muted">Incluye las correcciones que hiciste en la vista previa.</p>}
          {selectedFields.length > 0 && (
            <p className="text-muted">
              Campos adicionales: <strong className="text-ink">{selectedFields.map((f) => f.label).join(', ')}</strong>.
            </p>
          )}
        </div>
      </Modal>
    </>
  )
}

function DraftStatus({
  validating,
  errorCount,
  manualChanges,
  missingName,
}: {
  validating: boolean
  errorCount: number
  manualChanges: number
  missingName: boolean
}) {
  return (
    <div className="space-y-2">
      {validating ? (
        <p className="flex items-center gap-2 rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
          <Spinner className="size-4 text-brand" /> Validando cambios…
        </p>
      ) : errorCount > 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-alert-soft px-4 py-3 text-sm font-medium text-alert-ink">
          <AlertTriangle className="size-4 shrink-0" />
          {errorCount} {errorCount === 1 ? 'error' : 'errores'} por corregir. Las filas en rojo indican qué falta; usa ✏️ para
          arreglarlas aquí mismo.
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-teal-soft px-4 py-3 text-sm font-medium text-teal-ink">
          <CheckCircle2 className="size-4 shrink-0" /> Todo correcto
          {manualChanges > 0 && ` · ${manualChanges} ${manualChanges === 1 ? 'cambio manual' : 'cambios manuales'}`}
        </p>
      )}
      {missingName && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning-ink">
          Escribe un nombre para el módulo antes de activarlo.
        </p>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition',
        active ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
