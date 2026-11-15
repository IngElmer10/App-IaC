param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$ProjectPath = $PSScriptRoot
$BackendPath = Join-Path $ProjectPath 'backend'
$FrontendPath = Join-Path $ProjectPath 'frontend'
$NodePath = (Get-Command node -ErrorAction Stop).Source
foreach ($Port in @(3000,3001)) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "El puerto $Port está ocupado. Detén la ejecución anterior." }
}
if (-not (Test-Path (Join-Path $BackendPath '.env.platform.local'))) { throw 'Prepara primero la plataforma con node --env-file=.env scripts/prepare-platform.mjs --publish desde backend/.' }
if (-not $SkipBuild) {
    Push-Location $BackendPath
    try { npm run build; if ($LASTEXITCODE -ne 0) { throw 'Falló el build del backend.' } } finally { Pop-Location }
    Push-Location $FrontendPath
    try { npm run build; if ($LASTEXITCODE -ne 0) { throw 'Falló el build del frontend.' } } finally { Pop-Location }
}
$BackendProcess = Start-Process -FilePath $NodePath -ArgumentList @('--env-file=.env.platform.local','dist/main.js') -WorkingDirectory $BackendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $BackendPath 'platform-output.log') -RedirectStandardError (Join-Path $BackendPath 'platform-error.log')
$FrontendProcess = Start-Process -FilePath $NodePath -ArgumentList @('node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','-p','3000') -WorkingDirectory $FrontendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $FrontendPath 'platform-output.log') -RedirectStandardError (Join-Path $FrontendPath 'platform-error.log')
$Ready = $false
for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    try {
        $Health = Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 2
        $Page = Invoke-WebRequest 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 2
        if ($Health.status -eq 'ok' -and $Page.StatusCode -eq 200) { $Ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $Ready) { throw 'Los servicios no respondieron. Consulta backend/platform-error.log y frontend/platform-error.log.' }
Write-Host 'Pagina publica: http://localhost:3000 | Acceso administrativo: http://localhost:3000/login | Usuario platform'
Write-Host "Procesos backend $($BackendProcess.Id), frontend $($FrontendProcess.Id)."
