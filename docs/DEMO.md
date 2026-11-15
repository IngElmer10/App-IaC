# Presentación del MVP

## Iniciar la demostración

Desde la raíz del proyecto, en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-MVP.ps1 -Demo
```

Abre http://localhost:3000. El script compila e inicia ambas aplicaciones en segundo plano. PostgreSQL debe estar en ejecución y `backend/.env` debe tener una conexión válida. Si ya compilaste esta versión, agrega `-SkipBuild` para iniciar más rápido.

La demostración usa el esquema PostgreSQL `mvp_demo`, separado de `public`. Los datos del módulo real no se modifican. Cada ejecución prepara fechas relativas al día actual de Bolivia y conserva las marcas ya realizadas en la demostración.

| Rol | Usuario | Contraseña |
| --- | --- | --- |
| Administrador | admin | admin123 |
| Estudiante para presentar | DEMO1001 | 12345678 |
| Otro estudiante | DEMO1002 | 12345678 |

También puedes usar `ana.garcia@example.com` para ingresar como DEMO1001. Las credenciales de esta tabla corresponden exclusivamente al modo demostración.

## Guion de 7 minutos

1. Entra como administrador. Muestra el módulo activo, los seis estudiantes y el resumen de presentes, faltas calculadas y pendientes.
2. Abre **Estudiantes** y busca `Ana` o `DEMO1001`.
3. Abre **Cargar Excel**. Descarga las plantillas. Importa `demo/estudiantes.xlsx` y `demo/fechas.xlsx` para demostrar altas adicionales. Estos archivos se generan al preparar la demo; no contienen registros ya cargados en su primera importación.
4. Abre una ventana de incógnito e ingresa como **DEMO1001**. Muestra el historial, una falta pasada y las clases futuras pendientes. Pulsa **Marcar asistencia** para la fecha de hoy. La hora del servidor se guarda y el botón queda deshabilitado.
5. Regresa al administrador y abre **Asistencias**. Filtra por la fecha actual y por `Ana`. Muestra su presencia y la hora de marca. Luego limpia los filtros, elige una falta pasada y cambia a **Presente**.
6. Abre **Actividades** y busca `Ana`. Muestra usuario, fecha, hora y el cambio **Falta → Presente**. En **Asistencias**, pulsa **Exportar Excel**.
7. Como último paso, pulsa **Nuevo módulo**. Primero muestra **Cancelar**; luego escribe un nombre y confirma. El nuevo módulo aparece vacío. Los estudiantes anteriores ya no pueden ingresar, pero los datos históricos siguen en PostgreSQL.

Haz el reinicio al final: por diseño, el módulo nuevo empieza vacío. Puedes volver a ejecutar el lanzador para preparar otro módulo de demostración después de reiniciar.

## Datos reales

Para usar el módulo real, detén los dos procesos indicados por el lanzador e inicia sin `-Demo`:

```powershell
Stop-Process -Id <PID_BACKEND>,<PID_FRONTEND>
powershell -ExecutionPolicy Bypass -File .\Start-MVP.ps1 -SkipBuild
```

El puerto 3000 corresponde al frontend y el 3001 al backend. Consulta `backend/mvp-error.log` y `frontend/mvp-error.log` si no responden.

## Verificaciones

```powershell
Set-Location backend
npm test
npm run test:e2e
npm run build
Set-Location ../frontend
npm run lint
npm run build
$env:MVP_TEST_ATTENDANCE='1'
npm run test:e2e
```

Las pruebas e2e del backend crean un esquema temporal con un nombre aleatorio y lo limpian al terminar. Verifican las importaciones, permisos, faltas calculadas, marca concurrente, correcciones auditadas, filtros, exportación, constraints y conservación del historial. No escriben en el esquema real. Las pruebas de navegador requieren el modo demostración ya iniciado y Playwright instalado (`npx playwright install chromium`); utilizan DEMO1006, dejando DEMO1001 disponible para presentar.
