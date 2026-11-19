# Forja frente a OpenCode V2

Esta comparación se actualizó el 2026-11-18 usando la instalación local de OpenCode Desktop/CLI en Windows (`opencode v2.2.2`) y la documentación oficial V2.

## Qué hace OpenCode que debemos conservar como referencia

### Arquitectura local

- El ejecutable de Windows incluye un CLI nativo (`opencode-cli.exe`) y la app de escritorio.
- Los clientes se conectan a un servidor local compartido en segundo plano; también existe `--standalone` para un servidor privado por sesión.
- La sesión, permisos, herramientas, agentes y procesos pertenecen al servidor, no a una página web aislada.
- El emparejamiento web es opcional y usa enlaces de un solo uso que expiran.

**Forja:** ya tiene Tauri, selección nativa, IPC de filesystem y un agente HTTP de compatibilidad. El siguiente objetivo es que Tauri aloje el servicio completo y que la web pública sea solo una modalidad separada.

### Herramientas verificables

OpenCode separa herramientas de conversación: lectura, glob, grep, edición, patch, shell, webfetch, websearch, navegador, adjuntos, subagentes, MCP y generación de imágenes. El modelo pide una herramienta y recibe su resultado antes de responder.

**Forja:** tiene `list_files`, `read_file`, `write_file`, `make_dir`, `delete_path`, `move_path`, `download_file`, búsqueda, Git y comandos permitidos. Ya se agregó una regla para no afirmar acciones fallidas, pero falta agregar webfetch/websearch y un registro visual de cada llamada.

### Permisos y modo desatendido

OpenCode usa reglas ordenadas `allow`, `ask` y `deny`, con recursos concretos: comandos, rutas, URLs, subagentes, skills y servidores MCP. Guarda aprobaciones `always` por proyecto sin saltarse un `deny`. El modo `--auto` aprueba lo no denegado explícitamente.

**Forja:** tiene `Asistido/Desatendido`, aprobación por tipo de herramienta y rutas seguras. Falta convertirlo en políticas por recurso: comandos permitidos, dominios de descarga, rutas sensibles, agentes secundarios y acciones siempre bloqueadas.

### Agentes y delegación

OpenCode define agentes Markdown/JSON con nombre, descripción, modo `primary`/`subagent`, modelo, prompt, permisos, color y límite de pasos. Los subagentes tienen contexto separado, trabajan en segundo plano y devuelven informes al agente principal.

**Forja:** tiene especialistas arquitecto, UI, lógica, QA y documentación, pero actualmente son consultas paralelas predefinidas. Falta un registro editable de agentes, sesiones hijas, límites por agente y devolución de resultados con estado.

### Comandos, MCP y extensiones

OpenCode permite comandos reutilizables (`.opencode/commands/*.md`), plantillas con argumentos, ejecución en segundo plano y servidores MCP locales/remotos con OAuth, recursos, prompts y herramientas.

**Forja:** no tiene comandos de usuario ni MCP. La primera versión debe soportar comandos Markdown del proyecto y MCP local por stdio en Windows; los servidores remotos y OAuth pueden venir después.

### Continuidad y tiempo

OpenCode mantiene sesiones durables, exportación/importación, sesiones hijas, compaction automática y en segundo plano, snapshots para `/undo` y `/redo`, límites de pasos y procesos persistentes.

**Forja:** ya guarda chat, resúmenes y limita pasos automáticos. Falta persistir sesiones en el agente local, guardar estados de tareas, compactar en segundo plano, registrar procesos largos y ofrecer rollback real de archivos además del historial de ediciones.

### Internet y navegador

OpenCode distingue `websearch` de `webfetch`, aplica permisos por URL y tiene una herramienta de navegador con pestañas, formularios, capturas, consola, red y transferencias.

**Forja:** `download_file` funciona cuando recibe una URL directa y el proyecto está conectado. No puede descubrir URLs ni navegar sitios. Debemos agregar `web_fetch`, un proveedor configurable de `web_search` y, solo en escritorio, un navegador controlado con permisos explícitos.

## Prioridad de implementación para Forja

1. **Servidor local Tauri persistente:** mover el ciclo del agente, sesiones y permisos al proceso local; mantener la web pública como cliente opcional.
2. **Políticas por recurso:** `allow/ask/deny`, aprobaciones permanentes por proyecto, bloqueo de secretos y dominios privados.
3. **Veracidad de herramientas:** cada respuesta debe incluir llamadas, resultados, errores y archivos afectados; nunca usar una respuesta textual como prueba de ejecución.
4. **Agentes secundarios reales:** registro de agentes, sesiones hijas en segundo plano, límites de pasos y síntesis del agente principal.
5. **Comandos y MCP:** comandos del proyecto, MCP stdio en Windows y luego MCP remoto/OAuth.
6. **Trabajo prolongado:** cola de tareas, cancelación, pausa, reanudación, compaction en segundo plano y logs persistentes.
7. **Internet:** webfetch/websearch con permisos y descargas directas integradas en el mismo flujo de herramientas.
8. **Snapshots:** restauración de archivos por paso, sin fingir que revierte procesos externos, Git o bases de datos.

## Fuentes

- https://opencode.ai/v2/docs/
- https://opencode.ai/v2/docs/tools
- https://opencode.ai/v2/docs/permissions
- https://opencode.ai/v2/docs/agents
- https://opencode.ai/v2/docs/commands
- https://opencode.ai/v2/docs/mcp-servers
- https://opencode.ai/v2/docs/compaction
- https://opencode.ai/v2/docs/snapshots
- https://opencode.ai/v2/docs/cli
