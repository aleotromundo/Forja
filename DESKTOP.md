# Forja para escritorio

Forja conserva su versión web y agrega una aplicación Tauri para Windows. La app de escritorio permitirá iniciar el agente local internamente y eliminar el copiado manual del token.

## Requisitos del sistema

- Node.js LTS.
- pnpm.
- Rust mediante rustup.
- Visual Studio Build Tools con **Desktop development with C++**, MSVC y Windows SDK.
- WebView2 Runtime, normalmente incluido en Windows 10/11.

El repositorio no incluye instaladores de Windows, Rust ni SDKs porque son herramientas del sistema. El script `scripts/setup-desktop.ps1` comprueba todos los requisitos y muestra cómo instalar lo que falte.

## Preparar

Desde PowerShell, en la raíz del repositorio:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-desktop.ps1
```

## Comandos

```text
pnpm run desktop:check  # valida el proyecto Rust/Tauri
pnpm run desktop:dev    # abre Forja usando el servidor Vite local
pnpm run desktop:build  # genera el instalador Tauri
```

## Estado actual

La app Tauri inicia el agente local automáticamente: al abrirla muestra el selector de carpeta, arranca `agent/forja-agent.mjs` con un token temporal y abre `https://forjah.vercel.app/` ya emparejada. Ya no requiere ejecutar el `.bat` por separado, aunque Node.js debe estar instalado.

`pnpm run desktop:build` genera instaladores MSI y NSIS. La siguiente evolución es reemplazar este puente HTTP por comandos IPC nativos, siguiendo el modelo de servidor local privado de OpenCode.
