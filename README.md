# Forja

Forja es un editor local tipo VS Code que combina exploración de proyectos, edición de código, preview visual y asistencia de IA en lenguaje natural.

La idea es trabajar sobre una carpeta local sin subir el proyecto completo a un servidor: abrís la carpeta desde el navegador, elegís qué contexto compartir con la IA y decidís si querés solamente planear o aplicar cambios.

## Qué incluye

- Explorador de archivos y pestañas de edición con Monaco.
- Edición y guardado directo en la carpeta local mediante la File System Access API.
- Operaciones de workspace desde el chat: crear carpetas, crear o eliminar archivos y mover o renombrar rutas.
- Chat con contexto del archivo activo, pestañas abiertas, archivos seleccionados y adjuntos de texto.
- Dos modos de trabajo: **Planear**, que no modifica archivos, y **Modificar**, que puede aplicar cambios.
- Historial unificado para cambios de IA, edición de código, preview y anotaciones.
- Preview de archivos HTML locales en un iframe aislado.
- Selección de elementos, edición de texto, comentarios y anotaciones dibujadas.
- Rotación y fallback entre proveedores de IA configurados.
- Equipo de especialistas para arquitectura, interfaz, lógica, QA y documentación.

## Requisitos

- Node.js 22 o una versión compatible con el toolchain del proyecto.
- Un navegador basado en Chromium con soporte para `showDirectoryPicker`, como Chrome, Edge u Opera.
- Una o más claves de proveedores de IA.

## Desarrollo local

```bash
git clone https://github.com/aleotromundo/Forja.git
cd Forja
pnpm install
pnpm run dev
```

También se pueden ejecutar las comprobaciones principales:

```bash
pnpm run test
pnpm run lint
pnpm run build
```

## Configuración de IA

Forja lee las claves desde variables de entorno. Cada variable acepta claves separadas por comas para permitir rotación. Para agregar una clave desde Vercel sin editar una variable secreta existente, también se pueden usar nombres independientes numerados:

```bash
GROQ_API_KEYS=...
XAI_API_KEY=...
GEMINI_API_KEYS=...
OPENROUTER_API_KEYS=...
GEMINI_API_KEY_1=...
GEMINI_API_KEY_2=...
# Orden recomendado: Groq, xAI y Gemini
FORJA_ENABLED_PROVIDERS=groq,xai,gemini
```

Las formas singular (`GEMINI_API_KEY`), plural (`GEMINI_API_KEYS`) y numerada (`GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, etc.) se combinan y se deduplican. Las claves numeradas se ordenan por número y cada una participa como un slot independiente de rotación.

Por defecto, Forja prioriza modelos rápidos para código: Groq usa `openai/gpt-oss-20b`, Gemini usa `gemini-3-flash-preview` y OpenRouter usa `openai/gpt-oss-20b`. Se pueden reemplazar con `GROQ_MODEL`, `GEMINI_MODEL` y `OPENROUTER_MODEL`. Si Gemini falla, Forja prueba exactamente esta lista confirmada para el proyecto: `gemini-3-flash-preview`, `gemini-3-pro`, `gemini-3-flash-8b`, `gemini-3-flash` y `gemini-1.5-flash`, antes de pasar a otra clave o proveedor.

Las llamadas de IA pasan por `src/lib/ai.functions.ts`. Las claves permanecen del lado del servidor; el navegador envía solamente el contexto que el usuario selecciona para la conversación.

Por defecto, Forja activa Groq, xAI y Gemini si `FORJA_ENABLED_PROVIDERS` no está definida. Groq se prueba primero, luego xAI/Grok y después Gemini. Un error de un proveedor no interrumpe el flujo: se continúa con el siguiente disponible. La clave `xai-...` va en `XAI_API_KEY`, no en `GROQ_API_KEY`.

## Privacidad y permisos

La carpeta del usuario se abre en el navegador mediante la File System Access API. Forja lee y escribe archivos únicamente después de que el usuario elige una carpeta y concede permiso. El contenido de los archivos solo se envía a la IA cuando forma parte del contexto de una consulta.

El preview local se renderiza dentro de un `iframe` con sandbox. Los scripts, formularios y algunos recursos potencialmente peligrosos se eliminan o aíslan en el modo de preview local. Las páginas externas permiten anotaciones, pero no inspección ni edición del DOM por las restricciones de origen cruzado.

## Flujo recomendado

1. Abrí Forja en un navegador compatible.
2. Elegí **Abrir carpeta** y seleccioná tu proyecto.
3. Usá **Planear** para conversar sobre el cambio y revisar una propuesta.
4. Cambiá a **Modificar** cuando quieras aplicar el plan.
5. Revisá la propuesta explícita antes de aplicarla. Forja valida las rutas y no escribe nada sin confirmación.
6. Usá el historial para deshacer o rehacer ediciones, creación de carpetas y movimientos.
7. En **Vista previa**, seleccioná un elemento o agregá una anotación y enviá ese contexto al chat.

## Estructura principal

- `src/components/forja/`: workbench, explorador, editor, chat y preview.
- `src/lib/fs.ts`: acceso a carpetas y archivos locales.
- `src/lib/preview.ts`: inspección HTML, reemplazos de texto y bridge del preview.
- `src/lib/ai.functions.ts`: función servidor para las consultas de IA y aplicación de edits.
- `src/lib/ai-providers.ts`: rotación y selección de proveedores.
- `src/lib/agents.ts`: modos de chat y especialistas del equipo.
- `src/lib/edit-history.ts`: historial unificado de cambios.

## Estado del proyecto

Forja es un piloto/MVP en evolución. La base funcional está lista para probar el flujo completo, pero todavía se están mejorando la documentación, la cobertura de integración, el manejo de diffs y la robustez para proyectos grandes.

## Licencia

Este repositorio no declara todavía una licencia de código abierto. No asumas permisos de redistribución sin consultar al propietario del proyecto.
