export const demoModules = [
  {
    id: 'mod-2025-1',
    code: '2025-1',
    name: 'Módulo 2025 - 1',
    description: 'Primer bloque académico',
    active: false,
  },
  {
    id: 'mod-2025-2',
    code: '2025-2',
    name: 'Módulo 2025 - 2',
    description: 'Segundo bloque académico activo',
    active: true,
  },
];

export const demoStudents = [
  {
    id: 'student-1',
    registrationCode: '2024001',
    fullName: 'Ana Gómez',
    email: 'ana@demo.com',
    phone: '70000001',
    active: true,
    moduleId: 'mod-2025-2',
  },
  {
    id: 'student-2',
    registrationCode: '2024002',
    fullName: 'Bruno Ruiz',
    email: 'bruno@demo.com',
    phone: '70000002',
    active: true,
    moduleId: 'mod-2025-2',
  },
  {
    id: 'student-3',
    registrationCode: '2024003',
    fullName: 'Carla Vega',
    email: 'carla@demo.com',
    phone: '70000003',
    active: true,
    moduleId: 'mod-2025-2',
  },
];

export const demoSessions = [
  {
    id: 'session-1',
    moduleId: 'mod-2025-2',
    title: 'Algoritmos y programación',
    date: '2026-10-13',
    startTime: '08:00',
    endTime: '10:00',
  },
  {
    id: 'session-2',
    moduleId: 'mod-2025-2',
    title: 'Redes y seguridad',
    date: '2026-10-14',
    startTime: '08:00',
    endTime: '10:00',
  },
];

export const demoAttendances = [
  { id: 'attendance-1', studentId: 'student-1', sessionId: 'session-1', status: 'PRESENT' },
  { id: 'attendance-2', studentId: 'student-2', sessionId: 'session-1', status: 'LATE' },
  { id: 'attendance-3', studentId: 'student-3', sessionId: 'session-1', status: 'ABSENT' },
];
