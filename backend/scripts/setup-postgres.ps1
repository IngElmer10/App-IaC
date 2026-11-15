$ErrorActionPreference = 'Stop'

$BackendPath = Split-Path -Parent $PSScriptRoot
$EnvironmentFile = Join-Path $BackendPath '.env'
$DatabaseUrlLine = Get-Content $EnvironmentFile -ErrorAction Stop | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1

if (-not $DatabaseUrlLine) {
    throw 'No se encontró DATABASE_URL en backend/.env. Copia .env.example a .env y configura las credenciales reales de PostgreSQL.'
}

$DatabaseUrl = ($DatabaseUrlLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
try {
    $ConnectionUri = [Uri]$DatabaseUrl
} catch {
    throw 'DATABASE_URL no tiene un formato válido. Usa postgresql://usuario:contraseña@localhost:5432/control_asistencia?schema=public.'
}

$UserInfo = $ConnectionUri.UserInfo -split ':', 2
if ($UserInfo.Count -ne 2) {
    throw 'DATABASE_URL debe incluir usuario y contraseña de PostgreSQL.'
}

$UserName = [Uri]::UnescapeDataString($UserInfo[0])
$env:PGPASSWORD = [Uri]::UnescapeDataString($UserInfo[1])
$env:PGHOST = $ConnectionUri.Host
$env:PGPORT = [string]$ConnectionUri.Port
$DatabaseName = [Uri]::UnescapeDataString($ConnectionUri.AbsolutePath.TrimStart('/'))
$DatabaseName = $DatabaseName -replace '/.*$', ''

$PsqlCommand = Get-Command psql -ErrorAction SilentlyContinue
$PsqlPath = if ($PsqlCommand) { $PsqlCommand.Source } else { $null }
if (-not $PsqlPath) {
    $PostgresRoot = Join-Path $env:ProgramFiles 'PostgreSQL'
    if (Test-Path $PostgresRoot) {
        $PsqlPath = Get-ChildItem $PostgresRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName 'bin\psql.exe' } |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1
    }
}

if (-not $PsqlPath) {
    throw 'No se encontró psql. Instala PostgreSQL con las herramientas de línea de comandos, o agrega la carpeta PostgreSQL\<versión>\bin al PATH.'
}

Set-Location $BackendPath
& $PsqlPath -U $UserName -d postgres -Atqc 'SELECT 1;'
if ($LASTEXITCODE -ne 0) {
    throw 'PostgreSQL rechazó la conexión. Verifica usuario, contraseña, host y puerto en backend/.env (DATABASE_URL), y vuelve a ejecutar npm run db:setup.'
}

$DatabaseExistsResult = & $PsqlPath -U $UserName -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';"
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo consultar PostgreSQL para comprobar la base de datos.'
}
$DatabaseExists = $DatabaseExistsResult.Trim() -eq '1'
if (-not $DatabaseExists) {
    $CreateDatabaseSql = 'CREATE DATABASE "{0}";' -f $DatabaseName
    & $PsqlPath -U $UserName -d postgres -c $CreateDatabaseSql
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo crear la base de datos. Usa una cuenta PostgreSQL con permiso CREATEDB.'
    }
}

$GrantSql = 'GRANT ALL PRIVILEGES ON DATABASE "{0}" TO "{1}";' -f $DatabaseName, $UserName
& $PsqlPath -U $UserName -d $DatabaseName -c $GrantSql
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudieron otorgar permisos en la base. Verifica que la cuenta tenga privilegios administrativos.'
}

Write-Host 'Ejecutando migraciones de Prisma...'
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    throw 'Prisma no pudo aplicar las migraciones. Revisa el mensaje de conexión o el estado de los datos existentes.'
}

Write-Host "La base $DatabaseName quedó preparada."