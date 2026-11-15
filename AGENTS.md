# AGENTS.md — Sistema Web de Control de Asistencia

## Descripción del proyecto

Sistema web para registrar y consultar la asistencia de estudiantes a clases en módulos académicos sucesivos. Solo existe un módulo activo a la vez. Al activar un nuevo módulo, los datos anteriores se conservan pero dejan de estar visibles en la operación cotidiana.

## Arquitectura

- **Frontend**: Next.js 14 (App Router) en `frontend/`
- **Backend**: NestJS 10 (API REST) en `backend/`
- **Base de datos**: PostgreSQL 17 con Prisma ORM
- Las dos aplicaciones son independientes y se comunican vía API REST
- El frontend corre en puerto 3000, el backend en puerto 3001

## Roles del sistema

- **Administrador**: Gestiona estudiantes, asistencias, importaciones, módulos y actividades
- **Estudiante**: Marca su asistencia, consulta su historial

## Reglas de negocio críticas

1. Solo puede existir un módulo académico activo (RN-01)
2. Número de registro único dentro del módulo activo (RN-02)
3. Una sola marca de asistencia por estudiante y fecha de clase (RN-03)
4. El estudiante solo puede marcar durante el día de clase programado (RN-04)
5. Al terminar el día sin marca, se considera Falta (calculado, no insertado) (RN-05)
6. Solo el administrador puede modificar asistencias fuera de fecha (RN-06)
7. Toda modificación administrativa queda auditada (RN-07)
8. Al reiniciar módulo, no se borran datos históricos (RN-08)

## Convenciones de código

### Backend (NestJS)
- Módulos en `backend/src/modules/<nombre>/`
- Cada módulo tiene: controller, service, module, dto/
- Validación con class-validator y class-transformer
- Guards para autorización por roles
- Prisma para acceso a datos
- Zona horaria: `America/La_Paz` (UTC-4)
- Todas las fechas/horas del servidor

### Frontend (Next.js)
- App Router con grupos de rutas: `(auth)`, `(student)`, `(admin)`
- Componentes UI en `src/components/ui/` (shadcn)
- Componentes de layout en `src/components/layout/`
- Validaciones con Zod
- Formularios con React Hook Form
- No colocar lógica de negocio en componentes React

### Base de datos
- Constraints de integridad en PostgreSQL (no solo en backend)
- Migraciones versionadas con Prisma
- No se eliminan datos: se desactivan lógicamente

## Variables de entorno

### Backend (`backend/.env`)
- `DATABASE_URL` — Conexión a PostgreSQL
- `SESSION_SECRET` — Secreto para cookies de sesión
- `DEFAULT_STUDENT_PASSWORD` — Contraseña por defecto de estudiantes
- `PORT` — Puerto del servidor (default: 3001)
- `FRONTEND_URL` — URL del frontend para CORS
- `TZ` — Zona horaria (America/La_Paz)

### Frontend (`frontend/.env.local`)
- `NEXT_PUBLIC_API_URL` — URL del backend API

## Exclusiones

NO implementar en esta versión:
- Docker, Kubernetes, CI/CD
- Terraform, Ansible, IaC
- Consulta de módulos anteriores
- Notificaciones, QR, geolocalización, reconocimiento facial
- Cálculo de atrasos (los horarios son informativos)
- Múltiples módulos activos
