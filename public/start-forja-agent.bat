@echo off
setlocal
set /p "ROOT=Ruta de la carpeta del proyecto: "
if "%ROOT%"=="" exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root=$env:ROOT; $token=([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')); $dir=Join-Path $env:TEMP 'forja-agent'; New-Item -ItemType Directory -Force $dir | Out-Null; Invoke-WebRequest 'https://raw.githubusercontent.com/aleotromundo/Forja/main/agent/forja-agent.mjs' -OutFile (Join-Path $dir 'forja-agent.mjs'); Start-Process ('https://forja.app/#agentToken=' + $token); node (Join-Path $dir 'forja-agent.mjs') --root $root --token $token"
