param([string]$Region = 'us-east-2',[string]$Profile = 'iac')
$ErrorActionPreference = 'Stop'
$base = (Resolve-Path (Join-Path $PSScriptRoot '..\templates')).Path
foreach ($archivo in @('main.yaml','nested/red.yaml','nested/seguridad.yaml','nested/servidor.yaml')) {
    $ruta = (Join-Path $base $archivo)
    Write-Host "Validando $archivo"
    aws cloudformation validate-template --template-body "file://$ruta" --region $Region --profile $Profile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "CloudFormation no valido: $archivo" }
}
Write-Host 'ValidateTemplate completado. Esto NO comprueba despliegue ni permisos.'
