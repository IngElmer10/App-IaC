param(
    [switch]$Demo,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$ProjectPath = $PSScriptRoot
$BackendPath = Join-Path $ProjectPath 'backend'
$FrontendPath = Join-Path $ProjectPath 'frontend'
$NodePath = (Get-Command node -ErrorAction Stop).Source

foreach ($Port in @(3000, 3001)) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        throw "El puerto $Port ya está ocupado. Cierra la ejecución anterior antes de iniciar el MVP."
    }
}

Push-Location $BackendPath
try {
    if (-not (Test-Path '.env')) { throw 'Falta backend/.env. Configura la conexión a PostgreSQL.' }
    if (-not (Test-Path 'node_modules')) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias del backend.' }
    }
    npx prisma generate
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el cliente Prisma.' }
    if ($Demo) {
        & $NodePath --env-file=.env scripts/prepare-demo.mjs
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la demostración.' }
    } else {
        npx prisma migrate deploy
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones.' }
    }
    if (-not $SkipBuild -or -not (Test-Path 'dist/main.js')) {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación del backend.' }
    }
} finally { Pop-Location }

Push-Location $FrontendPath
try {
    if (-not (Test-Path 'node_modules')) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias del frontend.' }
    }
    if (-not $SkipBuild -or -not (Test-Path '.next/BUILD_ID')) {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación del frontend.' }
    }
} finally { Pop-Location }

$EnvironmentFile = if ($Demo) { '.env.demo.local' } else { '.env' }
$BackendProcess = Start-Process -FilePath $NodePath -ArgumentList @("--env-file=$EnvironmentFile", 'dist/main.js') -WorkingDirectory $BackendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $BackendPath 'mvp-output.log') -RedirectStandardError (Join-Path $BackendPath 'mvp-error.log')
$FrontendProcess = Start-Process -FilePath $NodePath -ArgumentList @('node_modules/next/dist/bin/next', 'start', '-p', '3000') -WorkingDirectory $FrontendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $FrontendPath 'mvp-output.log') -RedirectStandardError (Join-Path $FrontendPath 'mvp-error.log')

$Ready = $false
for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    try {
        $Health = Invoke-RestMethod 'http://localhost:3001/api/health' -TimeoutSec 2
        $Page = Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing -TimeoutSec 2
        if ($Health.status -eq 'ok' -and $Page.StatusCode -eq 200) { $Ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $Ready) {
    throw 'Los servicios no respondieron. Consulta backend/mvp-error.log y frontend/mvp-error.log.'
}
Write-Host 'MVP disponible en http://localhost:3000'
Write-Host "Procesos: backend $($BackendProcess.Id), frontend $($FrontendProcess.Id)."
if ($Demo) {
    Write-Host 'Modo demostración: datos separados del módulo real.'
    Write-Host 'Admin: admin / admin123. Estudiante: DEMO1001 / 12345678.'
    Write-Host 'Archivos de importación: demo/estudiantes.xlsx y demo/fechas.xlsx.'
}
