export interface ClassSession {
  id: number;
  moduleId: number;
  /** YYYY-MM-DD */
  classDate: string;
  /** HH:mm (informativo, RF-12) */
  startTime: string;
  endTime: string;
}
