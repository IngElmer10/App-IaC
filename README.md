# TenantForge · Plataforma de instituciones

## Implementaciones conservadas en esta rama

El MVP TenantForge de esta entrega utiliza **`frontend/`, `backend/` e `infrastructure/`** y se inicia con `Start-Platform.ps1`. La aplicación que ya existía en el repositorio se conserva, sin reemplazar sus carpetas **`client/`, `server/` e `infra/`**; su documentación original está en [README_APLICACION_EXISTENTE.md](README_APLICACION_EXISTENTE.md). Son implementaciones diferentes: no se deben mezclar sus configuraciones ni iniciar ambas sobre los mismos puertos.

## Informe integral de entrega

Los ocho entregables del proyecto y la guía explicativa están integrados en un mismo informe, disponible en `entregables/TenantForge_Informe_Integral.docx` (editable) y `entregables/TenantForge_Informe_Integral.pdf` (con código y evidencias en un adjunto técnico). Las portadas dejan los nombres en blanco. La generación reproducible se documenta en `tools/documentation/README.md`.

## Presentar el proyecto final

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-Platform.ps1
```

Abre http://localhost:3000 para la página pública y su formulario; usa http://localhost:3000/login para administrar instituciones y solicitudes. Acceso local de demostración: `platform` / `platform123`. Cada tenant utiliza tres instancias AWS: frontend, backend y PostgreSQL, con color e identificador propios. Consulta la [arquitectura, preparación, operaciones y alcance verificado](docs/PLATFORM.md).

La plataforma administra planes, crea instituciones independientes en AWS, ejecuta despliegues con Terraform o CloudFormation y registra operaciones de suspensión, reanudación, respaldo, restauración y monitoreo. La aplicación de asistencia descrita a continuación se despliega dentro de cada institución y corresponde al RF-21 del proyecto final.

## Aplicación de asistencia

Aplicación web para administrar estudiantes, módulos académicos y asistencia a clases. Los datos se guardan en PostgreSQL y cada módulo conserva su propio historial.

## Funcionalidades

- Acceso de administrador y estudiantes del módulo activo.
- Importación independiente de estudiantes y fechas/horarios mediante archivos Excel `.xlsx`.
- Lista de estudiantes con búsqueda por nombre o número de registro.
- Historial personal y registro de asistencia durante el día programado.
- Vista administrativa de asistencia, correcciones auditadas e historial de actividades.
- Activación confirmada de un módulo nuevo, conservando los datos anteriores.

## Tecnologías

- Frontend: Next.js 16, React 19 y TypeScript.
- Backend: NestJS 12, TypeScript y Prisma 5.
- Base de datos: PostgreSQL 17.

## Requisitos

- Node.js 20.9 o superior; probado con Node.js 24.
- npm 10 o superior.
- PostgreSQL 17 en ejecución y una cuenta con permiso para crear la base de datos.

## Preparar una copia local

### 1. Clonar el repositorio

Reemplaza la URL por la dirección del repositorio en GitHub:

```powershell
git clone https://github.com/<usuario>/<repositorio>.git
cd control-asistencia
```

### 2. Configurar el backend

Desde la raíz del proyecto, crea el archivo local de configuración:

```powershell
Copy-Item backend\.env.example backend\.env
```

Edita `backend/.env` y cambia `DATABASE_URL` para que use el usuario, la contraseña y el puerto configurados en PostgreSQL:

```env
DATABASE_URL="postgresql://postgres:<contraseña>@localhost:5432/control_asistencia?schema=public"
PORT=3001
FRONTEND_URL="http://localhost:3000"
TZ="America/La_Paz"
SESSION_SECRET="reemplazar-por-un-secreto-aleatorio"
DEFAULT_ADMIN_PASSWORD="admin123"
DEFAULT_STUDENT_PASSWORD="12345678"
```

Puedes generar un secreto local con:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Si la contraseña de PostgreSQL contiene caracteres especiales, codifícala para URL dentro de `DATABASE_URL`. **No publiques `backend/.env` ni compartas sus secretos.**

### 3. Instalar dependencias

```powershell
Set-Location backend
npm ci
npx prisma generate
```

En otra terminal, desde la raíz del repositorio:

```powershell
Set-Location frontend
npm ci
```

### 4. Crear la base y aplicar migraciones

Con PostgreSQL en ejecución, desde `backend/`:

```powershell
npm run db:setup
```

El script lee `DATABASE_URL`, busca `psql` en el PATH o en la ubicación estándar de PostgreSQL, crea `control_asistencia` si no existe y aplica las migraciones. También puedes aplicar migraciones pendientes con `npx prisma migrate deploy`. No uses `prisma migrate reset` sobre una base con datos que quieras conservar.

## Ejecutar para probar

Inicia cada aplicación en una terminal diferente:

```powershell
# Terminal 1, desde backend/
npm run start:dev
```

```powershell
# Terminal 2, desde frontend/
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). La API está en `http://localhost:3001/api` y su health check en [http://localhost:3001/api/health](http://localhost:3001/api/health).

### Credenciales iniciales

| Rol | Usuario | Contraseña inicial |
| --- | --- | --- |
| Administrador | `admin` | `DEFAULT_ADMIN_PASSWORD`; si no está definida, `admin123` |
| Estudiante | Correo o número de registro importado | `DEFAULT_STUDENT_PASSWORD`; por defecto `12345678` |

La contraseña de administrador de ejemplo es solo para pruebas locales. Configura una propia antes de publicar o desplegar la aplicación. Los estudiantes solo pueden iniciar sesión después de ser importados en el módulo activo.

### Probar el flujo administrativo

1. Inicia sesión como administrador.
2. En **Cargar Excel**, importa los estudiantes y las fechas en cargas separadas.
3. El Excel de estudiantes debe tener las columnas `Número de registro`, `Nombre completo` y `Correo electrónico`.
4. El Excel de clases debe tener `Fecha`, `Hora inicio` y `Hora fin`. Las fechas aceptan el formato `DD/MM/AAAA`; las horas son informativas y la marca se habilita durante todo el día programado.
5. Prueba la lista y búsqueda en `/admin/students`, las correcciones en `/admin/attendance` y el historial en `/admin/activities`.
6. Para probar el portal de estudiante, inicia sesión con un alumno importado. Para probar el botón de asistencia, carga una fecha de clase que coincida con el día actual.

El panel permite activar un módulo nuevo con confirmación. Los datos del módulo anterior se conservan en la base, pero dejan de aparecer en la operación cotidiana.

## Tests y builds

Desde `backend/`:

```powershell
npm test
npm run test:e2e
npm run build
```

La suite unitaria no necesita conectarse a PostgreSQL. La prueba e2e inicializa la aplicación completa y requiere `backend/.env`, PostgreSQL activo y las migraciones aplicadas.

Desde `frontend/`:

```powershell
npm run build
```

## Estructura

```text
backend/                 API NestJS, Prisma, migraciones y tests
	prisma/migrations/     Esquema versionado de PostgreSQL
	scripts/               Preparación local de PostgreSQL
	src/modules/           Módulos de autenticación, asistencia y administración
	test/                  Prueba e2e
frontend/                Interfaz Next.js
	src/app/               Rutas de acceso, estudiante y administración
docs/requirements/       Documento de requerimientos funcionales
```

Consulta los [requerimientos funcionales](docs/requirements/Requerimientos_Control_Asistencia.pdf). La zona horaria operativa es `America/La_Paz` (UTC-4).

## Publicación

No subas archivos `.env`, `.env.local`, dependencias (`node_modules`) ni salidas de compilación. El `.gitignore` del proyecto ya excluye estas rutas. Este repositorio no incluye actualmente un archivo `LICENSE`; define una licencia si quieres permitir formalmente que otras personas reutilicen el código.
