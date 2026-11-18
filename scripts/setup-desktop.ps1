$ErrorActionPreference = "Stop"

function Require-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Error "$Name no está disponible. $InstallHint"
  }
  Write-Host "$Name OK" -ForegroundColor Green
}

Require-Command "node" "Instalá Node.js LTS desde https://nodejs.org/"
Require-Command "pnpm" "Ejecutá: corepack enable pnpm"
Require-Command "cargo" "Instalá Rust con https://rustup.rs/"

$linker = Get-Command "link.exe" -ErrorAction SilentlyContinue
if (-not $linker) {
  Write-Warning "No encuentro link.exe. Instalá Visual Studio Build Tools con Desktop development with C++."
  Write-Host "Comando recomendado:"
  Write-Host 'winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --override "--passive --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"'
  exit 1
}
Write-Host "link.exe OK" -ForegroundColor Green

pnpm install
pnpm run desktop:check
Write-Host "Forja está lista para desarrollo de escritorio." -ForegroundColor Green
Write-Host "Usá 'pnpm run desktop:dev' para abrir la app Tauri."
