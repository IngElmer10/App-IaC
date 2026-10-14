/** Estados que se guardan en la base. ATRASO y JUSTIFICADO solo existen con las reglas de puntualidad. */
export type StoredAttendanceStatus = 'PRESENTE' | 'ATRASO' | 'FALTA' | 'JUSTIFICADO';
export type AttendanceSource = 'STUDENT' | 'ADMIN';

export const STORED_STATUSES: StoredAttendanceStatus[] = ['PRESENTE', 'ATRASO', 'FALTA', 'JUSTIFICADO'];
/** Estados que existen sin las reglas de puntualidad (RF-07). */
export const BASIC_STATUSES: StoredAttendanceStatus[] = ['PRESENTE', 'FALTA'];

/** Estados que se muestran: los guardados más los derivados de la fecha. */
export type AttendanceDisplayStatus = StoredAttendanceStatus | 'PENDIENTE' | 'PROGRAMADA';

/**
 * RN-05: la falta no se guarda, se deriva. Sin marca:
 *  - fecha pasada                       → FALTA
 *  - hoy, con el plazo de marca cerrado → FALTA (solo con reglas de puntualidad)
 *  - hoy                                → PENDIENTE (aún puede marcar)
 *  - fecha futura                       → PROGRAMADA
 */
export function resolveAttendanceStatus(
  stored: StoredAttendanceStatus | null,
  classDate: string,
  today: string,
  markingClosedToday = false,
): AttendanceDisplayStatus {
  if (stored) return stored;
  if (classDate < today) return 'FALTA';
  if (classDate === today) return markingClosedToday ? 'FALTA' : 'PENDIENTE';
  return 'PROGRAMADA';
}
