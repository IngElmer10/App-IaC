import { toBlob } from 'html-to-image'
import { useRef } from 'react'

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const calendarFileName = (moduleName: string) => `calendario-${slug(moduleName)}.png`

export interface CalendarImage {
  blob: Blob
  file: File
  url: string
}

/** Referencia a la tarjeta del calendario y función para convertirla en PNG. */
export function useCalendarImage(fileName: string) {
  const ref = useRef<HTMLDivElement>(null)

  const render = async (): Promise<CalendarImage> => {
    if (!ref.current) throw new Error('El calendario todavía no está listo')
    // Fondo del tema actual, para que la imagen en modo oscuro no tenga bordes blancos.
    const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || '#ffffff'
    const blob = await toBlob(ref.current, { pixelRatio: 2, backgroundColor, cacheBust: true })
    if (!blob) throw new Error('No se pudo generar la imagen del calendario')
    return { blob, file: new File([blob], fileName, { type: 'image/png' }), url: URL.createObjectURL(blob) }
  }

  return { ref, fileName, render }
}

export type CalendarImageSource = ReturnType<typeof useCalendarImage>
