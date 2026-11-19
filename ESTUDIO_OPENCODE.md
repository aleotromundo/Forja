# Estudio de OpenCode y plan para Forja

Fuente: código público de `sst/opencode` (licencia MIT, commit `88ca792`, leído el 2026-11-18) y documentación oficial.
Forja puede tomar ideas y código de OpenCode respetando el aviso de autoría MIT (`Copyright (c) 2025 opencode`).

## Lo que vale la pena copiar o adaptar

### 1. Permisos por recurso (`packages/core/src/permission.ts`)
- Reglas `allow` / `ask` / `deny` sobre una **acción** (`read`, `edit`, `bash`…) y un **recurso** (ruta, comando, URL), con comodines.
- Gana la **última regla que coincide**; si ninguna coincide, se pregunta (`ask`).
- Las rutas fuera del proyecto tienen una aprobación aparte (`external_directory`).
- Hay un conjunto de reglas para modo desatendido: lo no permitido se niega.

**Forja hoy:** solo tiene un interruptor asistido/desatendido. No distingue comandos, rutas ni dominios.

### 2. Salidas de herramientas que no se pierden (`packages/core/src/tool-output.ts`)
- Límite de 2.000 líneas y 50 KiB. Lo que sobra se guarda en un archivo y el modelo recibe la ruta.

**Forja hoy:** `MAX_TOOL_CHARS = 12_000` corta la salida en silencio. El modelo no sabe que faltó algo.

### 3. Fuentes de búsqueda con registro (`packages/core/src/websearch.ts`, `plugin/websearch/provider.ts`)
- Cada proveedor declara su ID, su nombre y la variable de entorno de su clave. Se puede elegir uno, rotar (`random`) o desactivar.
- Las credenciales se resuelven solo cuando se usan.

**Forja hoy:** ya usa este patrón para imágenes (`images.functions.ts`). Falta el registro editable y la selección del usuario.

### 4. Instrucciones del proyecto (`packages/core/src/instructions/index.ts`)
- Lee `AGENTS.md` del proyecto y lo incluye en el contexto, con un hash para saber si cambió.

**Forja hoy:** usa `.forja/memoria.md`. Conviene aceptar también `AGENTS.md`.

### 5. Deshacer con instantáneas (`packages/core/src/snapshot.ts`)
- Guarda el estado de los archivos como árbol de contenido direccionable y compara dos estados para mostrar diferencias por archivo.

**Forja hoy:** `edit-history.ts` ya guarda cambios y permite deshacer. Puede mejorar si cada paso guarda una instantánea completa.

### 6. Herramientas con permiso declarado (`packages/core/src/tool/plugin/write.ts`)
- Cada herramienta declara su nombre, su esquema de entrada, su permiso (`edit`) y errores explícitos (`ToolFailure`).

**Forja hoy:** las herramientas están en una lista. Está bien, pero el permiso se decide por una tabla aparte (`APPROVAL_REQUIRED`).

### 7. Imágenes redimensionadas antes de guardar (`packages/core/src/image/`)
- Si una imagen supera el límite, la reduce y la vuelve a codificar hasta que entre.

**Forja hoy:** rechaza cualquier imagen mayor de 20 MB. Con fotos de Commons eso pasa seguido.

## Lo que no conviene copiar ahora
- Servidor de sesiones, base de datos y clientes múltiples: es una arquitectura completa que Forja todavía no necesita.
- Navegador integrado, LSP y generación de video: fuera de alcance por ahora.

## Plan de implementación (en orden)
1. **AGENTS.md** como instrucciones del proyecto (cambio chico).
2. **Salidas truncadas sin pérdida silenciosa**: mantener inicio y final, avisar cuántos caracteres faltan.
3. **Reglas de permisos por recurso** (`allow` / `ask` / `deny`, comodines, última regla gana) con aprobación «siempre» por proyecto.
4. **Reducir imágenes en el navegador** antes de guardarlas (canvas), para no pasar el límite.
5. **Registro de fuentes de imágenes** con selección del usuario.

## Fuentes
- https://github.com/sst/opencode (MIT)
- packages/core/src/permission.ts, snapshot.ts, websearch.ts, tool-output.ts, instructions/index.ts, image/photon.ts
