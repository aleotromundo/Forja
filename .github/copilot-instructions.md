# Instrucciones de desarrollo para Forja

Forja es un editor de código local con chat de IA, explorador, editor, preview y sesiones persistentes. Es una aplicación TypeScript/React con TanStack Start, Vite, Tailwind y Vitest. Los archivos del usuario se leen y escriben en el navegador mediante la File System Access API; las funciones de servidor solo reciben el contexto que el usuario selecciona para una consulta.

## Regla principal

Trabajá como un desarrollador cuidadoso, no como un generador de reescrituras. Antes de editar, entendé el flujo y definí el alcance mínimo. Cambiá solamente los archivos y líneas necesarios para cumplir el pedido. No reformatees, refactorices, renombres, actualices dependencias ni cambies arquitectura o estilos no relacionados. Si una modificación secundaria es necesaria para conservar tipos, imports, contratos o comportamiento, explicá la razón.

Si el pedido es ambiguo, tiene dos interpretaciones incompatibles o requiere tocar muchos archivos sin que el usuario lo haya pedido, detenete y preguntá. No inventes requisitos. Para una modificación concreta, preferí un diff pequeño y reversible.

Antes de entregar una edición, revisá posibles efectos en imports, tipos, estado, rutas, persistencia, permisos de archivos, seguridad, responsive layout y compatibilidad con el preview. No elimines validaciones de rutas, límites de contexto, confirmaciones de edits ni controles de secretos. Nunca expongas API keys en el cliente, logs o respuestas.

## Flujo de trabajo

1. Leé el archivo relevante y sus usos antes de cambiarlo.
2. Explicá brevemente qué vas a tocar y qué queda fuera del alcance.
3. Implementá el cambio mínimo.
4. Agregá o actualizá tests cuando cambie lógica reutilizable o un bug pueda repetirse.
5. Ejecutá `pnpm exec prettier --write` sobre los archivos mantenidos, luego `pnpm run test`, `pnpm exec tsc --noEmit`, `pnpm run lint` y `pnpm run build`.
6. Revisá `git diff --check` y el diff final. Informá cualquier validación que no se haya podido ejecutar.

## Convenciones importantes

- Las llamadas de IA pasan por `src/lib/ai.functions.ts` y la rotación de proveedores por `src/lib/ai-providers.ts`.
- Los edits de IA deben conservar rutas relativas seguras y requieren confirmación antes de aplicarse al disco.
- El modo Planear no debe escribir archivos; el modo Modificar sí puede proponer edits, pero siempre con confirmación.
- El receptor principal decide si un pedido simple necesita especialistas. No convoques agentes para saludos, preguntas generales o cambios de un solo archivo.
- El chat debe responder en español natural, con párrafos cortos. Usá Markdown solo cuando ayude a leer código, comandos o rutas.
- Las interfaces deben funcionar en desktop angosto y móvil: evitá botones que se compriman o se superpongan; preferí truncado, wrapping o modo compacto.
- La persistencia del chat usa sesiones por proyecto y debe conservar la última sesión sin perder el historial anterior.

## Comandos

```bash
pnpm install
pnpm run test
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```
