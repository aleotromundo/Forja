@echo off
setlocal
set "ROOT=%~1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$dir=Join-Path $env:TEMP 'forja-agent'; New-Item -ItemType Directory -Force $dir | Out-Null; Invoke-WebRequest 'https://raw.githubusercontent.com/aleotromundo/Forja/main/agent/start-forja-agent.ps1' -OutFile (Join-Path $dir 'start-forja-agent.ps1'); powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'start-forja-agent.ps1') -Root $env:ROOT"
