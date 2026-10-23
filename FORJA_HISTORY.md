# Historia de trabajo de Forja

Esta bitácora registra los cambios, verificaciones y decisiones relevantes realizados sobre el repositorio junto con el usuario.

## 2026-10-22

### Revisión inicial

- Se verificó el acceso al repositorio público `aleotromundo/Forja`.
- Se clonó la rama `main` para revisar la estructura, la documentación y los componentes principales.
- Se confirmó que el proyecto contiene un workbench tipo VS Code, editor local, preview visual, chat con IA, historial y equipo de agentes.
- Se ejecutaron las pruebas existentes: **18 tests pasaron en 6 archivos**.
- Se ejecutó el build de producción: **completado correctamente**.
- Se comprobó TypeScript con `pnpm exec tsc --noEmit`: **sin errores**.
- Se detectó que `pnpm run lint` falla por numerosos errores de formato Prettier y algunos avisos menores.
- Se detectó una advertencia de TanStack por el uso de `inputValidator()`, cuya migración recomendada es `validator()`.

### Cambio 1 — Documentación propia

- Se reemplazó el README genérico de Lovable por documentación específica de Forja.
- El nuevo README describe el producto, sus funciones, requisitos, desarrollo local, configuración de IA, privacidad, flujo recomendado, estructura del código y estado del proyecto.
- Commit: `4a4e87d docs: escribir README propio de Forja`
- Estado: subido a `origin/main`.

### Cambio 2 — Bitácora y skill operativo

- Se agregó este archivo (`FORJA_HISTORY.md`) para conservar la historia de cambios, verificaciones, decisiones y aprendizajes del proyecto.
- Se creó `forja-repository/SKILL.md` con el flujo de trabajo, la arquitectura, las reglas de privacidad, las condiciones de seguridad, las pautas para IA y las convenciones de documentación.
- El skill se inicializó con la estructura oficial y fue validado correctamente con `quick_validate.py`.
- Durante la validación fue necesario instalar `PyYAML` en el entorno de trabajo porque no estaba disponible previamente.

### Decisión de documentación operativa

- Se acordó mantener este archivo como historia cronológica de trabajo.
- Se acordó mantener además un skill específico del repositorio para que futuras guías conozcan las reglas, decisiones y procedimientos de Forja.

### Cambio 3 — Lint y formato

- Se formateó el código fuente mantenido con Prettier.
- Se excluyeron del lint los artefactos generados de `src/generated`, que no deben editarse manualmente.
- Se corrigieron dos escapes innecesarios detectados por ESLint en el preview.
- `pnpm run lint` ahora termina correctamente; quedan 6 warnings preexistentes de Fast Refresh en componentes UI.
- `pnpm run test`: 18 tests pasaron.
- `pnpm exec tsc --noEmit`: sin errores.
- `pnpm run build`: completado correctamente; permanece el aviso de `inputValidator()` deprecado.

### Cambio 4 — Migración de TanStack

- Se reemplazó `inputValidator()` por `validator()` en `askForja`.
- Tests, TypeScript y build pasaron.
- Se eliminó el aviso de deprecación de TanStack del build.

### Cambio 5 — Seguridad de rutas de IA

- Se agregó `isSafeRelativePath` para rechazar rutas absolutas, traversal con `..`, separadores Windows, drives, segmentos vacíos y bytes nulos.
- La función servidor filtra edits inseguros antes de devolverlos.
- El Workbench repite la validación antes de escribir o eliminar en la carpeta local.
- Se agregaron tests para rutas válidas, absolutas, traversal y formatos inseguros.
- Tests, TypeScript y build pasaron.

### Cambio 6 — Lint sin warnings del kit UI

- Se mantuvo la regla Fast Refresh para código de aplicación.
- Se desactivó únicamente para `src/components/ui`, donde las primitivas exportan intencionalmente variantes y helpers además de componentes.
- `pnpm run lint` ahora termina sin errores ni warnings.
- Tests y TypeScript pasaron.

### Cambio 7 — Límites de contexto

- Se centralizaron los límites: 40 archivos, 60.000 caracteres por archivo y 120.000 caracteres totales.
- El cliente y el validador server-side comparten los mismos límites.
- Se agregó una validación Zod del tamaño total antes de ejecutar llamadas de IA.
- Se agregaron tests para contextos seleccionados que exceden el límite.
- Tests, TypeScript y lint pasaron.

### Cambio 8 — Confirmación antes de aplicar edits

- Se agregó una confirmación explícita antes de escribir o eliminar archivos por una respuesta de IA.
- La confirmación muestra la cantidad de cambios y la ruta de cada archivo afectado.
- Si el usuario cancela, no se toca el filesystem y la conversación registra que los cambios fueron rechazados.
- La validación de rutas se mantiene antes de mostrar y aplicar la propuesta.
- Tests, TypeScript, lint y build pasaron.

### Cambio 9 — Estado de APIs y acciones del chat

- Se agregó `getAiStatus`, una función server-side que informa si hay proveedores configurados y cuáles, sin devolver claves ni valores secretos.
- El encabezado del chat muestra un indicador discreto: verde `Conectado`, naranja `Conectando` y rojo `Sin conexión`.
- El indicador se actualiza al cargar la aplicación, al iniciar una consulta y según el resultado de la llamada.
- Cada mensaje ahora tiene acción `Copiar`; los mensajes del usuario también tienen `Editar`, que carga el texto y recorta la conversación para reenviarlo.
- Se muestran confirmaciones breves al copiar o preparar una edición.
- Tests, TypeScript, lint y build pasaron.

### Cambio 10 — Auditoría responsive y persistencia temporal del chat

- Se agregó un modo móvil de panel único: editor, explorador y chat ya no se renderizan simultáneamente con anchos fijos en pantallas chicas.
- Se adaptaron la barra superior, la toolbar del editor y los atajos Ctrl+B/Ctrl+L para navegar entre paneles móviles.
- El contexto enviado desde la vista previa abre el chat correcto también en móvil.
- Las acciones de eliminar del explorador tienen área táctil visible en móvil y no dejan zonas de clic invisibles.
- Se agregó persistencia acotada en `localStorage` por nombre de proyecto: conserva hasta 80 mensajes y limita cada contenido a 40.000 caracteres.
- El historial se restaura al volver a abrir el mismo proyecto después de recargar; la carpeta sigue requiriendo permiso del navegador y debe volver a seleccionarse.
- Se agregó tolerancia ante `localStorage` bloqueado, lleno o corrupto para que el chat siga funcionando en memoria.
- Auditoría visual local: sin overflow horizontal ni botones sin etiqueta en la vista inspeccionada.
- Tests, TypeScript, lint y build pasaron.

### Cambio 11 — Receptor principal y delegación condicional

- Se cambió el pipeline de IA para que el primer llamado siempre lo haga el receptor principal.
- El receptor decide mediante `delegate` si el pedido requiere trabajo sobre el proyecto.
- Saludos, preguntas simples y conversación general terminan con una sola respuesta, sin `pickTeam` ni consultas paralelas de especialistas.
- Solo cuando `delegate: true` se convocan especialistas en paralelo y luego el receptor integra sus aportes.
- Cada proveedor tiene un timeout de 15 segundos; los errores indican qué proveedor no respondió y el sistema puede continuar con otra clave/proveedor.
- Se mantienen las fases visibles y el contador de tiempo en el chat.
- Tests, TypeScript, lint y build pasaron.

### Cambio 12 — Auditoría de escritorio compacto y migración de Groq

- Se amplió el modo compacto hasta 1024 px para cubrir ventanas de escritorio reducidas por la consola del navegador.
- La toolbar del editor ahora oculta etiquetas largas antes de comprimir botones, fija el ancho de cada control y permite scroll horizontal controlado.
- La cabecera del proyecto trunca nombres largos, libera espacio en modo compacto y evita que el buscador empuje otros controles.
- La cabecera del chat protege el título, estado y selector de modo contra compresión y solapamiento.
- Se revisaron overlays de preview, adjuntos, popovers, tabs, explorador y controles de mensajes.
- Se migró automáticamente el modelo retirado de Groq `llama-3.3-70b-versatile` a `openai/gpt-oss-20b`, incluso si quedó guardado en `GROQ_MODEL`.
- Se agregó un test para impedir que el modelo retirado vuelva a usarse.
- La documentación oficial de Groq indica que `llama-3.3-70b-versatile` fue retirado para planes gratuitos/desarrollador el 16/08/2026; Gemini y OpenRouter también documentan que modelos, límites y proveedores pueden fallar aunque la clave exista.
- Tests, TypeScript, lint y build pasaron: 26 tests.

### Cambio 13 — Sesiones de chat estilo editor

- Se reemplazó el historial único por sesiones persistidas por proyecto.
- Al abrir una carpeta se restaura automáticamente la sesión más reciente.
- Cada sesión recibe un nombre derivado del primer mensaje y conserva fecha de creación y última actividad.
- Se agregó selector de sesiones y botón `Nuevo chat` en la cabecera del chat.
- Cada sesión muestra archivos modificados, líneas agregadas en verde, líneas eliminadas en rojo y tiempo relativo de actualización.
- Se contabilizan cambios de IA y también cambios manuales al guardar archivos.
- Se migró el historial anterior de `localStorage` a una primera sesión sin perder mensajes.
- Se agregaron tests de sesiones, migración y estadísticas: 28 tests pasan.

### Cambio 14 — Reintento de saturación 503/429

- Se confirmó que el error observado de Gemini era HTTP 503: el proveedor recibió la solicitud pero el modelo estaba temporalmente con alta demanda.
- Se agregó un reintento automático con espera breve para 429, 500, 502, 503 y 504 antes de pasar al siguiente proveedor.
- Los errores ahora distinguen `alta demanda temporal`, `límite de solicitudes o cuota` y `respuesta de error`.
- No se exponen claves ni se modifica la información sensible de las variables de entorno.
- Tests, TypeScript, lint y build pasaron: 28 tests.

### Cambio 15 — Claves Gemini separadas por coma

- Se verificó el formato real de Vercel con una clave en `GEMINI_API_KEYS` y varias claves dentro de `GEMINI_API_KEY` separadas por comas.
- El parser ya acepta comas, espacios, punto y coma y saltos de línea, combina ambas variables y elimina duplicados.
- Se agregó un test específico con `GEMINI_API_KEY=g1, g2,g3`: genera tres slots Gemini independientes para rotación y fallback.
- Tests, TypeScript, lint y build pasaron: 29 tests.

### Cambio 16 — Claves numeradas para Vercel

- Se documentó que editar una variable secreta en Vercel reemplaza su valor completo; no es una operación de agregar al final.
- Se agregó soporte para variables independientes numeradas, como `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2` y `GEMINI_API_KEY_3`.
- Las variables numeradas se ordenan, se combinan con las formas singular y plural existentes y se deduplican.
- Así se puede agregar una clave nueva en Vercel sin volver a abrir ni reescribir la variable que ya contiene otras claves.
- Se actualizó README y AGENTS con el formato recomendado.
- Tests, TypeScript, lint y build pasaron: 30 tests.

### Cambio 17 — Fallback de modelo Gemini ante 503 global

- Se confirmó que varias claves de proyectos distintos pueden recibir 503 simultáneamente cuando el modelo específico está saturado; cambiar la clave no cambia la capacidad del modelo.
- Ante un 503 de Gemini, Forja ahora reintenta brevemente y prueba modelos alternativos (`gemini-3.6-flash` y `gemini-2.5-flash`) antes de pasar a otra clave o proveedor.
- La respuesta informa el modelo que finalmente respondió cuando el fallback tiene éxito.
- Tests, TypeScript, lint y build pasaron: 30 tests.

### Cambio 18 — Perfil rápido de modelos y búsqueda web opcional

- Se configuró como default rápido Groq `openai/gpt-oss-20b`, con aproximadamente 1000 tokens/s según Groq.
- Se cambió Gemini default a `gemini-3.5-flash-lite`, orientado por Google a alta velocidad y alto volumen.
- Se cambió OpenRouter default a `openai/gpt-oss-20b` y se mantienen los overrides `GROQ_MODEL`, `GEMINI_MODEL` y `OPENROUTER_MODEL`.
- El fallback Gemini quedó en `gemini-3.6-flash` y `gemini-2.5-flash-lite`.
- Se agregó búsqueda web opcional mediante el browser search nativo de Groq cuando el usuario pide explícitamente buscar en Internet, sin agregar latencia a consultas normales.
- Se mantuvo el receptor único para saludos, preguntas y cambios simples; los especialistas solo se convocan cuando el receptor decide que el pedido necesita trabajo real.
- Tests, TypeScript, lint y build pasaron: 31 tests.

### Cambio 19 — Respuestas más naturales

- Se ajustó el prompt general para español natural, directo y con párrafos cortos.
- Se indicó al modelo que no use listas de guiones, asteriscos, títulos ni separadores salvo que hagan falta.
- Se agregó una normalización segura de la respuesta visible: elimina encabezados, viñetas y negritas Markdown excesivas, pero preserva bloques de código.
- Los objetos JSON internos y el contenido completo de archivos no se modifican; solo se limpia el texto de respuesta mostrado al usuario.
- Tests, TypeScript, lint y build pasaron: 31 tests.

### Cambio 20 — Guía de desarrollo inspirada en prácticas públicas de Copilot

- Se investigó la documentación pública de GitHub Copilot y VS Code: instrucciones de repositorio, instrucciones por ruta, planificación, contexto explícito, revisión de diffs, checkpoints y validación.
- No se copió ningún prompt interno privado; se tradujeron esas prácticas a reglas propias de Forja.
- Se reforzó el prompt de IA con cambios quirúrgicos, análisis de impacto, conservación de comportamiento, preguntas ante ambigüedad y prohibición de refactors no pedidos.
- Se creó `.github/copilot-instructions.md` con arquitectura, flujo de trabajo, comandos de validación, seguridad, responsive y reglas de edición mínima para Copilot y agentes compatibles.
- Tests, TypeScript, lint y build pasaron: 31 tests.

### Cambio 21 — Prioridad real para Groq y presupuesto por proveedor

- Se detectó que el contador global rotaba entre todos los slots: con una sola clave Groq y cinco Gemini, las consultas posteriores podían empezar en Gemini y saltear Groq.
- Se agregó `prioritizeSlots`: cada consulta prueba siempre Groq primero, luego Gemini y finalmente OpenRouter; las claves se mantienen ordenadas dentro de cada proveedor.
- Se redujo el timeout individual de 15 a 8 segundos para evitar esperas largas.
- Se agregó un presupuesto de 12 segundos por proveedor dentro de cada llamada, para que una cuenta saturada no recorra indefinidamente todas sus claves y modelos.
- Se mantuvieron los fallbacks de modelo de Gemini y la rotación de claves.
- Tests, TypeScript, lint y build pasaron: 32 tests.

### Cambio 22 — Política final de Gemini gratuita y estable

- Se concluyó que Flash, Flash-Lite y Pro describen familias de capacidad; el nivel gratuito depende del proyecto, cuota y billing, no solo del nombre.
- Se mantuvo `gemini-3.5-flash-lite` como modelo Gemini principal por velocidad y nivel gratuito.
- Se cambió el fallback automático desde `gemini-3.6-flash` a `gemini-3.1-flash-lite`, seguido de `gemini-2.5-flash-lite`, para evitar un fallback más pesado o potencialmente pago.
- Se excluyeron de la rotación automática Gemini Pro y previews retiradas. Pro queda disponible solamente mediante configuración manual.
- Se documentó que las cuotas se aplican por proyecto y que varias claves del mismo proyecto no multiplican automáticamente el límite.
- Tests, TypeScript, lint y build pasaron: 32 tests.

### Cambio 23 — Delegación sin dependencia inicial de Gemini

- Se reprodujo el problema informado: el receptor podía responder rápido por Groq, pero los especialistas se llamaban con `rotateSlots`, lo que hacía que empezaran por Gemini.
- Se cambió cada llamada de especialista para usar `prioritizeSlots`, de modo que también empiece por Groq y solo use Gemini como fallback.
- Se limitó el equipo delegado a un máximo de dos especialistas paralelos para reducir concurrencia, cuota y puntos de bloqueo.
- El líder continúa usando el mismo orden: Groq, Gemini y OpenRouter.
- Tests, TypeScript, lint y build pasaron: 32 tests.

### Cambio 24 — Diagnóstico seguro por variable de entorno

- Cada slot de proveedor ahora conserva el nombre de la variable que lo originó, por ejemplo `GEMINI_API_KEY_1` o `GEMINI_API_KEY (clave 2)`.
- Cuando una clave o modelo falla, el error visible informa variable, proveedor, modelo, código HTTP y motivo, sin mostrar nunca el valor secreto.
- Forja continúa automáticamente con la siguiente clave/modelo/proveedor en lugar de detenerse en el primer fallo.
- Las claves numeradas y las claves múltiples dentro de una variable quedaron identificadas de forma separada en el diagnóstico.
- Tests, TypeScript, lint y build pasaron: 32 tests.

### Cambio 25 — Modo Modificar que no pierde los edits

- Se detectó que el receptor podía interpretar un pedido de cambio como una explicación y devolver código dentro del chat, aunque el usuario estuviera en modo Modificar.
- Se reforzó el rol del receptor: en modo Modificar, verbos como modificar, cambiar, reemplazar, agregar, corregir o implementar obligan a entrar al flujo de edits.
- Se agregó una salvaguarda server-side: si el modo es Modificar y el mensaje contiene una intención clara de edición, Forja delega aunque el modelo haya olvidado marcar `delegate: true`.
- Así el líder debe devolver edits estructurados para que Workbench pueda mostrar la confirmación y escribir los archivos, en vez de limitarse a imprimir código.
- Tests, TypeScript, lint y build pasaron: 32 tests.

### Cambio 26 — Verificador cruzado antes de aplicar cambios

- Se agregó una etapa de verificación después del líder y antes de devolver edits al navegador.
- El verificador recibe el pedido original, la respuesta del líder, el contexto del proyecto y los edits completos.
- Revisa alcance, archivos correctos, imports, tipos, referencias, seguridad, responsive y regresiones.
- Si aprueba, los edits llegan a Workbench y se muestra la confirmación normal antes de escribir en disco.
- Si detecta problemas o no puede verificar de forma segura, devuelve `edits: []` y bloquea la escritura.
- El equipo delegado queda informado con el agente `Verificador` y se incluye un resumen de la revisión cuando corresponde.
- Tests, TypeScript, lint y build pasaron: 32 tests.

### Cambio 27 — Fallback de modelo ante errores 400 de Gemini

- Se confirmó que un 400 indica una solicitud rechazada por formato, modelo o configuración, no una simple saturación 503.
- Se corrigió el bucle de Gemini para que, ante 400, 404, 429 o errores transitorios, pruebe inmediatamente el siguiente modelo Flash-Lite en vez de repetir el mismo modelo con todas las claves.
- Los errores de autenticación y permisos siguen marcándose en la variable exacta y pasan al siguiente slot sin reintentos inútiles.
- La verificación de edits también usa esta política y no queda bloqueada por un modelo Gemini inválido.
- Tests, TypeScript, lint y build pasaron: 32 tests.

### Cambio 28 — Modelos Gemini confirmados por el usuario

- Se dejó de inferir o juzgar la vigencia de los modelos Gemini a partir de documentación externa.
- Se configuró exactamente la lista comprobada en el chat antiguo del usuario, en este orden: `gemini-3-flash-preview`, `gemini-3-pro`, `gemini-3-flash-8b`, `gemini-3-flash`, `gemini-1.5-flash`.
- `gemini-3-flash-preview` quedó como default de Gemini; la variable `GEMINI_MODEL` de Vercel, si existe, continúa teniendo prioridad.
- Los errores 400/404/429 y transitorios avanzan por esta lista exacta antes de probar otra clave o proveedor.
- Tests, TypeScript, lint y build pasaron: 32 tests.

### Cambio 29 — Operaciones completas de workspace y undo/redo

Se integraron de punta a punta las acciones `mkdir` y `move` en Workbench, incluyendo creación de carpetas y movimiento o renombrado de archivos y carpetas. Los snapshots del historial ahora conservan el tipo de operación y, cuando corresponde, la ruta destino. Deshacer y rehacer restauran correctamente escritura, eliminación, creación de carpetas y movimientos.

Las estadísticas de sesión siguen contabilizando líneas solamente para cambios de contenido y no inventan líneas para operaciones estructurales. La confirmación del chat y el resumen de operaciones ahora distinguen modificar, eliminar, crear carpeta y mover, mostrando el destino del movimiento. Se conservan las validaciones de rutas y la confirmación explícita antes de tocar el disco. README actualizado con el flujo de workspace.

Tests, TypeScript, lint y build pasaron: 32 tests.

### Cambio 30 — Groq activo y Gemini aislado temporalmente

Se agregó `FORJA_ENABLED_PROVIDERS`. Si no está definida, Forja activa únicamente Groq, sin borrar ni modificar ninguna variable o clave de Gemini. La variable puede cambiarse luego a `groq,gemini` cuando la integración de Gemini haya sido probada de forma independiente.

El indicador de estado del chat también refleja solamente los proveedores activos, evitando que Gemini aparezca como disponible si está temporalmente aislado.

### Cambio 31 — Restauración del fallback operativo anterior

Se confirmó que el deployment anterior podía responder mediante `LOVABLE_API_KEY`, aunque la interfaz lo mostrara como una respuesta del equipo. Se restauró ese comportamiento sin volver al repositorio anterior: Groq queda primero cuando existe y Lovable vuelve a ser respaldo automático. Gemini continúa aislado hasta validar su integración.

### Cambio 32 — Fallback contra selector de proveedores incompleto

Se corrigió un caso de desconexión total: si `FORJA_ENABLED_PROVIDERS` apunta a un proveedor sin clave, Forja ahora usa automáticamente los proveedores que sí estén configurados en vez de quedar sin slots. También se mejoró el mensaje de diagnóstico para incluir Lovable y distinguir ausencia real de claves de un selector mal configurado.

### Cambio 33 — Flujo definitivo Groq → Gemini → Lovable

Se activó el orden recomendado con Groq primero, Gemini como segundo proveedor y Lovable como respaldo si el entorno lo ofrece. Para Gemini se consolidan las instrucciones y el contexto en un único mensaje `system`, se eliminan mensajes `system` consecutivos y se omite `temperature` para evitar incompatibilidades del adaptador OpenAI con modelos de razonamiento.

Un error 400 de Gemini queda aislado por la rotación y no interrumpe el intento con los demás proveedores.

### Cambio 34 — Integración de la clave xAI/Grok existente

Se agregó xAI como proveedor independiente para aprovechar la clave `xai-...` que ya tenía el usuario. Forja la lee desde `XAI_API_KEY`, usa `https://api.x.ai/v1/chat/completions` y la coloca después de Groq y antes de Gemini. No se confunde más una clave xAI con una clave Groq; el diagnóstico identifica cada proveedor por separado.
