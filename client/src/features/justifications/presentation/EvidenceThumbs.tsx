import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../../shared/lib/cn'
import { Modal } from '../../../shared/ui/Modal'
import { Spinner } from '../../../shared/ui/Spinner'
import { useJustificationImage } from '../application/justifications.queries'
import type { JustificationFile } from '../domain/justification'

/** Miniaturas de las pruebas; al hacer clic se abren en grande con navegación. */
export function EvidenceThumbs({
  justificationId,
  files,
  size = 'md',
}: {
  justificationId: number
  files: JustificationFile[]
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState<number | null>(null)
  if (files.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {files.map((file, index) => (
          <button
            key={file.id}
            type="button"
            onClick={() => setOpen(index)}
            className={cn(
              'overflow-hidden rounded-lg ring-1 ring-line transition hover:ring-2 hover:ring-brand',
              size === 'sm' ? 'size-12' : 'size-20',
            )}
            title="Ver imagen"
          >
            <Thumb justificationId={justificationId} fileId={file.id} />
          </button>
        ))}
      </div>
      <Modal open={open !== null} onClose={() => setOpen(null)} title={`Prueba ${(open ?? 0) + 1} de ${files.length}`} size="lg">
        {open !== null && (
          <div className="space-y-3">
            <div className="grid min-h-64 place-items-center overflow-hidden rounded-xl bg-canvas">
              <Thumb justificationId={justificationId} fileId={files[open].id} contain />
            </div>
            {files.length > 1 && (
              <div className="flex justify-between">
                <button
                  type="button"
                  disabled={open === 0}
                  onClick={() => setOpen(open - 1)}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-canvas disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" /> Anterior
                </button>
                <button
                  type="button"
                  disabled={open === files.length - 1}
                  onClick={() => setOpen(open + 1)}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-canvas disabled:opacity-40"
                >
                  Siguiente <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

function Thumb({ justificationId, fileId, contain = false }: { justificationId: number; fileId: number; contain?: boolean }) {
  const { data, isLoading, isError } = useJustificationImage(justificationId, fileId)
  if (isLoading) return <Spinner className="m-auto size-4 text-brand" />
  if (isError || !data) return <ImageOff className="m-auto size-5 text-muted" />
  return (
    <img
      src={data}
      alt="Prueba de la justificación"
      className={contain ? 'max-h-[70vh] w-full object-contain' : 'size-full object-cover'}
    />
  )
}
