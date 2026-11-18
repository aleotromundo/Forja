param(
  [string]$Root = "",
  [string]$ForjaUrl = "https://forjah.vercel.app/"
)

if ([string]::IsNullOrWhiteSpace($Root)) {
  Add-Type -AssemblyName System.Windows.Forms
  $current = (Get-Location).Path
  $looksLikeProject = (Test-Path (Join-Path $current ".git")) -or (Test-Path (Join-Path $current "package.json"))
  if ($looksLikeProject) {
    $answer = [System.Windows.Forms.MessageBox]::Show(
      "¿Usar esta carpeta como proyecto de Forja?`n`n$current",
      "Forja",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Question
    )
    if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) {
      $Root = $current
    }
  }
  if ([string]::IsNullOrWhiteSpace($Root)) {
    $picker = New-Object System.Windows.Forms.FolderBrowserDialog
    $picker.Description = "Elegí la carpeta del proyecto para Forja"
    $picker.UseDescriptionForTitle = $true
    if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      exit 0
    }
    $Root = $picker.SelectedPath
  }
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

$token = ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")).Trim()
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
$agentScript = Join-Path $PSScriptRoot "forja-agent.mjs"
if (-not (Test-Path -LiteralPath $agentScript)) {
  Invoke-WebRequest "https://raw.githubusercontent.com/aleotromundo/Forja/main/agent/forja-agent.mjs" -OutFile $agentScript
}
& node $agentScript --root $Root --token $token
