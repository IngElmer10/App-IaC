param(
    [Parameter(Mandatory=$true)][string]$Bucket,
    [string]$Region = 'us-east-2',
    [string]$Prefijo = 'cloudformation-demo',
    [string]$Profile = 'iac'
)
$ErrorActionPreference = 'Stop'
$base = (Resolve-Path (Join-Path $PSScriptRoot '..\templates\nested')).Path
foreach ($archivo in @('red.yaml','seguridad.yaml','servidor.yaml')) {
    $origen = Join-Path $base $archivo
    $destino = "s3://$Bucket/$Prefijo/$archivo"
    Write-Host "Publicando $archivo a $destino"
    aws s3 cp "$origen" "$destino" --region $Region --profile $Profile --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "Fallo al subir $archivo" }
}
Write-Host 'Plantillas publicadas. Verifica bucket, region y prefijo en git-sync/deployment.yaml.'
