# Índice de mejoras de Forja

Este archivo es la guía operativa para continuar el desarrollo de Forja sin perder decisiones ni contexto al cambiar de IA.

## Objetivo del producto

Forja debe convertirse en un entorno de desarrollo local-first donde una persona pueda abrir un repositorio, conversar con una IA que entienda su contexto, planear cambios, aplicarlos de forma controlada, revisar el resultado y verificarlo desde la misma herramienta.

La IA no debe limitarse a generar código para copiar. Debe actuar sobre el proyecto real, pero siempre con privacidad, trazabilidad, aprobación humana y posibilidad de deshacer.

## Estado base — 2026-11-17

- Rama: `main`.
- Estado inicial de esta ronda: limpio y alineado con `origin/main` según las referencias locales.
- Producto: workbench tipo VS Code con explorador, Monaco, chat, preview HTML, historial y modos Planear/Modificar.
- Acceso local: File System Access API desde el navegador.
- Agente local: lectura, búsqueda, escritura, movimientos, Git y comandos permitidos con aprobación.
- IA: proveedores implementados actualmente Groq, Gemini y OpenRouter.
- Contexto: archivos seleccionados o mencionados, árbol del proyecto, archivo activo, pestañas y memoria del proyecto.
- Validación actual: 60 tests pasaron, TypeScript y build pasaron; lint aún reporta 419 diferencias de formato heredadas.

## Orden de trabajo

### P0 — Base confiable antes de agregar funciones

- [x] Corregir el límite del árbol local para detenerse exactamente en 3000 archivos.
- [x] Eliminar de la memoria del proyecto referencias a archivos inexistentes.
- [x] Alinear la documentación con los proveedores realmente implementados.
- [ ] Ejecutar `pnpm run test`, `pnpm run test:agent`, `pnpm run lint`, `pnpm exec tsc --noEmit` y `pnpm run build` en un entorno con Node.js.
- [ ] Revisar y resolver cualquier fallo de esas validaciones antes de iniciar funcionalidades nuevas.
- [ ] Auditar el flujo completo de una edición: contexto → propuesta → aprobación → escritura → historial → deshacer → verificación.
- [ ] Auditar el agente local en Windows, especialmente comandos permitidos, rutas, enlaces simbólicos, CORS local y errores de permisos.

### P1 — Hacer confiable el trabajo sobre repositorios reales

- [ ] Mejorar el manejo de diffs para que el usuario pueda revisar cambios antes de aplicarlos.
- [ ] Mostrar claramente qué archivos se van a crear, modificar, mover o eliminar.
- [ ] Evitar que respuestas parciales o fallos de proveedor dejen el estado de la interfaz ambiguo.
- [ ] Mejorar la recuperación ante archivos grandes, proyectos con muchos archivos y contextos truncados.
- [ ] Asegurar que el historial restaure correctamente disco, pestañas, preview y operaciones estructurales.
- [ ] Agregar pruebas de integración del Workbench y del agente local, no solo pruebas de funciones puras.
- [ ] Revisar consistencia entre `README.md`, `AGENTS.md`, `FORJA_HISTORY.md`, esta guía y el comportamiento real.
- [ ] Diseñar tareas en segundo plano con agentes especializados: cola, estado, progreso, resultados, cancelación y aprobación antes de aplicar cambios.
- [x] Incorporar un interruptor persistente Asistido/Desatendido para que los cambios confirmados puedan avanzar sin aprobaciones intermedias.
- [x] Permitir que el agente descargue archivos binarios desde URLs públicas y los guarde dentro del proyecto con límites de tamaño y rutas seguras.
- [x] Agregar un lanzador de Windows que inicia el agente y prepara la conexión de Forja sin copiar el token manualmente.

### P2 — Convertirlo en un agente de desarrollo más completo

- [ ] Permitir que la IA inspeccione el repositorio de forma progresiva sin cargar contexto innecesario.
- [ ] Mejorar la memoria del proyecto: decisiones, convenciones, arquitectura, problemas conocidos y próximos pasos.
- [ ] Incorporar ciclos claros de diagnóstico → cambio → verificación → corrección.
- [ ] Mostrar resultados de tests, lint, TypeScript y build dentro de la conversación.
- [ ] Mejorar el trabajo multiarchivo y las tareas largas sin perder el control del usuario.
- [ ] Permitir retomar una tarea pausada con un resumen verificable del estado.

### P3 — Producto y experiencia

- [ ] Mejorar onboarding para abrir el primer proyecto y conectar el agente local.
- [ ] Hacer más visible la diferencia entre Planear, Modificar y ejecutar verificaciones.
- [ ] Mejorar responsive y accesibilidad del workbench.
- [ ] Diseñar una experiencia clara para proyectos sin preview HTML.
- [ ] Definir estrategia de despliegue, licencia y soporte antes de presentar Forja como producto terminado.

## Reglas que no se deben romper

1. Los archivos locales se acceden desde el navegador o mediante el agente local autorizado; el servidor no debe explorar arbitrariamente la PC.
2. Solo se envía a la IA el contexto que el usuario selecciona o que Forja carga explícitamente para la consulta.
3. En modo Planear no se aplican cambios, aunque el modelo devuelva edits.
4. Las rutas deben ser relativas, seguras y permanecer dentro de la carpeta autorizada.
5. Los cambios destructivos requieren aprobación explícita.
6. Los edits de escritura contienen el archivo completo, no parches ambiguos ni fragmentos.
7. El preview local permanece aislado en un iframe sandbox.
8. El historial debe ser único para editor, IA, preview y operaciones del workspace.
9. Ninguna IA debe afirmar que ejecutó una validación si no hay evidencia del resultado.
10. No hacer `git push`, instalar dependencias ni reescribir historia sin autorización explícita.

## Protocolo para cualquier nueva sesión de IA

1. Leer `AGENTS.md`, `README.md`, `FORJA_HISTORY.md`, `.forja/memoria.md` y este archivo.
2. Ejecutar `git status --short --branch` y revisar los últimos commits.
3. Identificar en qué ítem de este índice se trabajará.
4. Inspeccionar primero el código relacionado; no hacer refactors amplios sin necesidad.
5. Implementar un cambio acotado.
6. Ejecutar las validaciones relevantes y registrar sus resultados.
7. Actualizar este índice solo si cambia el estado, la prioridad o una decisión.
8. Registrar en `FORJA_HISTORY.md` el cambio, las verificaciones y cualquier aprendizaje permanente.
9. No marcar una tarea como completada si quedó una validación pendiente.

## Registro de decisiones

- Forja se orienta a desarrollo local-first, no a un generador de código aislado.
- La aprobación humana y la trazabilidad tienen prioridad sobre la autonomía total.
- El agente local es el puente para ejecutar verificaciones y operaciones que el navegador no puede realizar.
- La lista de proveedores debe reflejar siempre el código real; actualmente es Groq, Gemini y OpenRouter.
- Las funcionalidades nuevas deben reforzar primero el flujo completo sobre repositorios reales.
- Los especialistas actuales pueden colaborar dentro de una consulta; el siguiente nivel es convertirlos en tareas persistentes que sigan trabajando mientras el usuario conversa.
- El modo desatendido es opt-in y persistente por proyecto de navegador; todavía falta agregar límites de tiempo, cuenta regresiva, pausa, cancelación y checkpoints.

## Registro breve de sesiones

| Fecha | Trabajo | Estado | Próximo paso |
|---|---|---|---|
| 2026-11-17 | Auditoría inicial, corrección del límite del árbol y saneamiento de memoria/documentación | En curso | Ejecutar validaciones con Node.js disponible |
