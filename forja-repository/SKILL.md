---
name: forja-repository
description: Trabajo de desarrollo y mantenimiento del repositorio Forja, un editor local tipo VS Code con IA, preview visual y File System Access API. Usar al modificar este repositorio, revisar su arquitectura, aplicar cambios, ejecutar verificaciones o incorporar aprendizajes del usuario.
---

# Skill del repositorio Forja

## Objetivo

Trabajar sobre Forja sin romper su modelo de privacidad, su flujo de edición local ni la sincronización con GitHub. Antes de modificar, leer `AGENTS.md`, `README.md` y `FORJA_HISTORY.md` cuando existan.

## Flujo obligatorio de cambios

1. Inspeccionar el estado actual con `git status`, la rama y los últimos commits.
2. Entender el cambio y ubicarlo en la arquitectura existente antes de editar.
3. Hacer un cambio acotado por vez; no mezclar documentación, lógica y refactors sin necesidad.
4. Ejecutar las verificaciones relevantes: `pnpm run test`, `pnpm run lint`, `pnpm run build` y `pnpm exec tsc --noEmit`.
5. Registrar el cambio, las verificaciones y cualquier aprendizaje en `FORJA_HISTORY.md`.
6. Crear un commit descriptivo y subirlo a `origin/main` solo cuando el usuario lo haya autorizado.
7. Informar el commit, el resultado de las verificaciones y cualquier deuda pendiente.

No reescribir historia publicada, no hacer force push y no cambiar de rama sin una razón explícita. Mantener cada commit pequeño y reversible.

## Arquitectura que hay que respetar

- `src/components/forja/`: workbench, explorador, editor, chat y preview.
- `src/lib/fs.ts`: único módulo para acceder a carpetas y archivos locales.
- `src/lib/preview.ts`: inspección HTML, offsets de fuente, reemplazo de texto y bridge del iframe.
- `src/lib/ai.functions.ts`: función servidor que valida entrada, arma contexto, rota proveedores y aplica el resultado estructurado.
- `src/lib/ai-providers.ts`: selección y rotación pura de proveedores; las claves llegan únicamente por variables de entorno.
- `src/lib/agents.ts`: modos `plan` y `edit`, selección de especialistas y garantía de que Planear no devuelva edits.
- `src/lib/edit-history.ts`: historial compartido entre cambios de IA, editor, preview y anotaciones.
- `src/components/forja/Workbench.tsx`: composición del estado de carpeta, pestañas, historial, chat y preview.

Preferir funciones puras y tests en `src/lib` para reglas de negocio. Evitar introducir acceso al filesystem local en el servidor o estado global innecesario.

## Reglas de privacidad y seguridad

El usuario elige explícitamente la carpeta mediante File System Access API. No enviar archivos al servidor salvo que formen parte del contexto seleccionado para una consulta de IA. No registrar claves, contenido de archivos ni prompts completos en logs.

El preview local debe permanecer aislado en un iframe sandbox. Mantener la eliminación de scripts, formularios, `base`, iframes y handlers inline cuando corresponda. El bridge debe validar origen, ventana fuente y token efímero antes de aceptar mensajes.

Las páginas externas pueden mostrar overlays y anotaciones, pero no deben prometer inspección o edición DOM cross-origin. Validar URLs externas y aceptar únicamente `http:` y `https:`.

Validar cualquier ruta producida por la IA antes de escribir o eliminar archivos. No permitir rutas absolutas, traversal (`..`), separadores inesperados ni edición fuera de la carpeta elegida.

## IA y contexto

Todas las llamadas deben pasar por `askForja` en `src/lib/ai.functions.ts`. Mantener la rotación de claves y el fallback existente. Los especialistas aportan notas; el líder integra y produce la respuesta final estructurada.

En modo Planear, `edits` debe ser siempre `[]`, incluso si el modelo devuelve cambios. En modo Modificar, aceptar solo edits con ruta, acción válida y contenido completo para escrituras. No aplicar fragmentos ni confiar ciegamente en JSON del modelo.

Controlar tamaño de contexto y evitar enviar archivos binarios. Cuando se cambie el formato de respuesta de IA, actualizar sus validadores y tests.

## UX y edición

Conservar los atajos nativos dentro de inputs, textareas y Monaco. Mantener el historial cronológico aunque el usuario cambie entre Código y Vista previa. Los cambios de IA deben poder deshacerse y reflejarse tanto en disco como en las pestañas abiertas.

Los cambios de texto de preview deben usar offsets de fuente y escapar HTML. No reemplazar contenido que contenga elementos hijos sin una decisión explícita del usuario o de la IA.

## Documentación viva

Registrar en `FORJA_HISTORY.md` cada cambio subido, decisión del usuario, resultado de tests/build/lint y aprendizaje que pueda ayudar a otra guía. Mantener `README.md` orientado a usuarios y este skill orientado a agentes; no duplicar documentación innecesariamente.
