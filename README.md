# Sistema de Registro y Control de Asistencia

Aplicación web para registrar y consultar la asistencia de estudiantes por módulo académico
(ver `Requerimientos_Control_Asistencia.pdf`).

- **Backend:** NestJS 12 + TypeORM + PostgreSQL — arquitectura hexagonal por feature.
- **Frontend:** React 19 + Vite + Tailwind 4 — Clean Architecture por funcionalidades.

## Puesta en marcha

Requisitos: Node 20+ y PostgreSQL con una base llamada `modulo2`.

```bash
# 1. Backend (http://localhost:3000/api)
cd server
cp .env.example .env        # ajusta DB_PASSWORD y JWT_SECRET si hace falta
npm install
npm run start:dev           # aplica las migraciones y crea el admin al iniciar

# 2. Frontend (http://localhost:5173)
cd client
npm install
npm run dev                 # /api se redirige al backend (proxy de Vite)
```

**Administrador inicial:** `admin@gmail.com` / `123456789` (configurable en `server/.env`).

Para empezar: entra como administrador → **Nuevo módulo** → sube `ejemplos/estudiantes.xlsx`
y `ejemplos/fechas.xlsx` → **Validar** → **Activar**. Después ingresa como estudiante con
`maria@gmail.com` o `1002`. Los archivos `*_con_errores.xlsx` sirven para ver las validaciones.
`node ejemplos/generar-ejemplos.cjs` regenera los ejemplos.

### Comandos útiles

| Dónde | Comando | Qué hace |
|---|---|---|
| server | `npm test` | Tests unitarios de reglas de negocio |
| server | `npm run migration:show` / `migration:run` / `migration:revert` | Migraciones con el CLI de TypeORM |
| client | `npm run build` | Typecheck y build de producción |

## Reglas clave

- **Un solo módulo activo** (RN-01): índice único parcial `modules(is_active) WHERE is_active`.
- **La falta no se guarda, se calcula** (RN-05): sin registro, una fecha pasada es *Falta*, hoy es
  *Pendiente* y una futura es *Programada*. Solo se escribe en `attendances` cuando el estudiante
  marca o el admin corrige.
- **"Hoy" lo decide el servidor** en `APP_TZ=America/La_Paz`, nunca el navegador.
- **Una marca por estudiante y fecha** (RN-03): `UNIQUE(student_id, session_id)`.
- **Activar un módulo** (RF-13, RN-08) es una sola transacción: desactiva el anterior (sin borrar
  nada), crea el nuevo e inserta estudiantes y fechas. Los tokens de estudiantes del módulo anterior
  dejan de ser válidos.
- **Auditoría** (RN-07): cada corrección del admin guarda valor anterior, nuevo, admin, fecha y motivo
  en `attendance_changes`, y además queda en `activity_logs`.

## Base de datos

```
admins ─┐
        └─< modules ─┬─< students ─────┐
                     ├─< class_sessions ┼─< attendances ─< attendance_changes
                     └─< activity_logs  ┘
```

Esquema completo en `server/src/database/migrations/1760400000000-initial-schema.ts`.

## Estructura del backend (hexagonal)

```
server/src/
├── database/               conexión, migraciones, DataSource del CLI
├── shared/                 kernel: errores de dominio, puerto Clock, guards, filtro HTTP
└── modules/<feature>/
    ├── domain/             entidades, reglas puras y puertos (repositorios abstractos)
    ├── application/        casos de uso; solo dependen de puertos
    └── infrastructure/     adaptadores: TypeORM, Excel (exceljs), HTTP (controllers + DTOs)
```

Features: `auth`, `admins`, `academic-modules`, `students`, `class-sessions`, `attendance`, `activity`.
Los puertos son clases abstractas que se usan como token de inyección de Nest
(`{ provide: AttendanceRepository, useClass: TypeormAttendanceRepository }`).

## Estructura del frontend (Clean Architecture)

```
client/src/
├── app/                    composition root (inyecta adaptadores), router, layouts
├── core/                   cliente HTTP, almacenamiento del token, contexto de dependencias
├── shared/                 UI reutilizable (Button, Card, Chip, Modal, Toast…) y utilidades
└── features/<feature>/
    ├── domain/             tipos e interfaces de repositorio
    ├── infrastructure/     implementación HTTP del repositorio
    ├── application/        hooks (React Query) y contexto de auth; usan los puertos inyectados
    └── presentation/       páginas y componentes
```

## API

| Método | Ruta | Rol | Requerimiento |
|---|---|---|---|
| POST | `/api/auth/admin/login` · `/api/auth/student/login` | público | RF-01, RF-02 |
| GET / POST | `/api/auth/me` · `/api/auth/logout` | ambos | RF-02 |
| GET | `/api/attendance/me` | estudiante | RF-05 |
| POST | `/api/attendance/mark` | estudiante | RF-03 |
| GET | `/api/attendance?sessionId&studentId&search` | admin | RF-08 |
| PATCH | `/api/attendance` | admin | RF-07 |
| GET | `/api/attendance/export` | admin | RF-17 |
| GET | `/api/students?search` · `/api/sessions` | admin | RF-06 |
| GET | `/api/activity?studentId&date&page` | admin | RF-10 |
| GET | `/api/modules/active` | admin | |
| POST | `/api/modules/preview` · `/api/modules/activate` | admin | RF-11, 12, 13, 16 |

## Nota de seguridad

El ingreso de estudiantes solo con correo o número de registro (RF-01) significa que cualquiera
que conozca esos datos puede marcar asistencia por otra persona. Si hace falta, el siguiente paso
sería agregar un PIN por estudiante o un código de clase que entregue el docente.
