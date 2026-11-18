param(
  [string]$Root = "",
  [string]$ForjaUrl = "https://forja.app/"
)

if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Read-Host "Ruta de la carpeta del proyecto"
}

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
  Write-Error "La carpeta no existe: $Root"
  exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "No encuentro Node.js. Instalalo y volvé a ejecutar este lanzador."
  exit 1
}

$token = (& node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))").Trim()
if (-not $token) {
  Write-Error "No se pudo generar el token local."
  exit 1
}

$separator = if ($ForjaUrl.Contains("#")) { "&" } else { "#" }
$pairUrl = "${ForjaUrl}${separator}agentToken=$token"
Start-Process $pairUrl

Write-Host "Forja se está conectando automáticamente."
Write-Host "Carpeta: $((Resolve-Path -LiteralPath $Root).Path)"
Write-Host "Dejá esta ventana abierta mientras uses el agente."
& node (Join-Path $PSScriptRoot "forja-agent.mjs") --root $Root --token $token
