import { Check, Copy, Download, Mail, Share2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { getErrorMessage } from '../../../core/http/api-error'
import { cn } from '../../../shared/lib/cn'
import { Modal } from '../../../shared/ui/Modal'
import { Spinner } from '../../../shared/ui/Spinner'
import type { CalendarImage, CalendarImageSource } from '../application/use-calendar-image'

const canCopyImages = () => typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

/**
 * Compartir el calendario. Las páginas web no pueden adjuntar archivos a WhatsApp, Facebook
 * o al correo; por eso cada opción copia la imagen al portapapeles y abre el destino con el
 * texto listo para pegarla. En celulares, "Más opciones" abre el menú nativo, que sí adjunta la imagen.
 */
export function ShareCalendarDialog({
  open,
  onClose,
  source,
  text,
}: {
  open: boolean
  onClose: () => void
  source: CalendarImageSource
  text: string
}) {
  return (
    <Modal open={open} onClose={onClose} title="Compartir calendario" size="lg">
      {open && <ShareContent source={source} text={text} />}
    </Modal>
  )
}

function ShareContent({ source, text }: { source: CalendarImageSource; text: string }) {
  const [image, setImage] = useState<CalendarImage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Se fija la fuente del primer render: el hook devuelve un objeto nuevo en cada render.
  const [initialSource] = useState(source)

  // La imagen se genera al abrir, para que cada botón actúe dentro del mismo clic
  // (los navegadores solo permiten copiar al portapapeles en respuesta directa al usuario).
  useEffect(() => {
    let current: CalendarImage | null = null
    let cancelled = false
    initialSource
      .render()
      .then((result) => {
        current = result
        if (cancelled) URL.revokeObjectURL(result.url)
        else setImage(result)
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err)))
    return () => {
      cancelled = true
      if (current) URL.revokeObjectURL(current.url)
    }
  }, [initialSource])

  const download = () => {
    if (!image) return
    const link = document.createElement('a')
    link.href = image.url
    link.download = image.file.name
    link.click()
  }

  /** Copia la imagen; si el navegador no lo permite, la descarga para adjuntarla a mano. */
  const copyImage = async (destination: string) => {
    if (!image) return
    try {
      if (!canCopyImages()) throw new Error('sin soporte')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image.blob })])
      setNotice(`Imagen copiada. En ${destination}, pégala con Ctrl+V (o mantén presionado y "Pegar" en el celular).`)
    } catch {
      download()
      setNotice(`Tu navegador no permite copiar imágenes: se descargó el archivo para que lo adjuntes en ${destination}.`)
    }
  }

  const openUrl = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

  const options: { label: string; icon: ReactNode; className: string; onClick: () => void; hidden?: boolean }[] = [
    {
      label: 'Más opciones',
      icon: <Share2 className="size-5" />,
      className: 'bg-brand text-white',
      hidden: !image || !navigator.canShare?.({ files: [image.file] }),
      onClick: () =>
        void navigator.share({ files: [image!.file], text, title: 'Calendario de clases' }).catch(() => undefined),
    },
    {
      label: 'WhatsApp',
      icon: <WhatsAppIcon />,
      className: 'bg-[#25D366] text-white',
      onClick: () => {
        void copyImage('WhatsApp')
        openUrl(`https://wa.me/?text=${encodeURIComponent(text)}`)
      },
    },
    {
      label: 'Correo',
      icon: <Mail className="size-5" />,
      className: 'bg-alert text-white',
      onClick: () => {
        void copyImage('el correo')
        window.location.assign(
          `mailto:?subject=${encodeURIComponent('Calendario de clases del módulo')}&body=${encodeURIComponent(text)}`,
        )
      },
    },
    {
      label: 'Facebook',
      icon: <FacebookIcon />,
      className: 'bg-[#1877F2] text-white',
      onClick: () => {
        void copyImage('Facebook')
        openUrl('https://www.facebook.com/')
      },
    },
    {
      label: 'Copiar imagen',
      icon: <Copy className="size-5" />,
      className: 'bg-canvas text-ink ring-1 ring-line',
      onClick: () => void copyImage('donde quieras'),
    },
    {
      label: 'Descargar',
      icon: <Download className="size-5" />,
      className: 'bg-canvas text-ink ring-1 ring-line',
      onClick: download,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="grid min-h-40 place-items-center overflow-hidden rounded-xl border border-line bg-canvas">
        {image ? (
          <img src={image.url} alt="Vista previa del calendario" className="max-h-72 w-full object-contain" />
        ) : error ? (
          <p className="p-6 text-center text-sm text-alert-ink">{error}</p>
        ) : (
          <div className="flex items-center gap-3 p-6 text-sm text-muted">
            <Spinner className="size-5 text-brand" /> Preparando imagen…
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {options
          .filter((option) => !option.hidden)
          .map((option) => (
            <button
              key={option.label}
              type="button"
              disabled={!image}
              onClick={option.onClick}
              className="group flex flex-col items-center gap-2 rounded-xl p-2 text-xs font-semibold text-ink transition hover:bg-canvas disabled:opacity-40"
            >
              <span
                className={cn(
                  'grid size-12 place-items-center rounded-full shadow-sm transition group-hover:scale-105',
                  option.className,
                )}
              >
                {option.icon}
              </span>
              {option.label}
            </button>
          ))}
      </div>

      {notice && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-teal-soft px-4 py-3 text-sm text-teal-ink">
          <Check className="mt-0.5 size-4 shrink-0" /> {notice}
        </p>
      )}

      <details className="rounded-xl border border-line px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">Texto que se comparte</summary>
        <pre className="mt-3 font-sans whitespace-pre-wrap text-muted">{text}</pre>
      </details>
    </div>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.43 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.42" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" />
    </svg>
  )
}
