@echo off
setlocal
set /p "ROOT=Ruta de la carpeta del proyecto: "
if "%ROOT%"=="" exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root=$env:ROOT; $token=(node -e \\"process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))\\").Trim(); $dir=Join-Path $env:TEMP 'forja-agent'; New-Item -ItemType Directory -Force $dir | Out-Null; Invoke-WebRequest 'https://raw.githubusercontent.com/aleotromundo/Forja/main/agent/forja-agent.mjs' -OutFile (Join-Path $dir 'forja-agent.mjs'); Start-Process ('https://forja.app/#agentToken=' + $token); node (Join-Path $dir 'forja-agent.mjs') --root $root --token $token"
