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

El esqueleto Tauri, la ventana principal y los comandos ya están configurados. La primera versión todavía usa la interfaz web y el agente HTTP existente; el siguiente paso es mover el agente a comandos Tauri y después publicar el instalador para habilitar el botón **Escritorio** de la web.
