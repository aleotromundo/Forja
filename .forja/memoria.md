# Memoria del Proyecto

- Forja mantiene el acceso a los proyectos en el navegador mediante File System Access API; el servidor solo recibe el contexto que el usuario envía a la IA.
- El árbol local ignora carpetas de dependencias, builds y control de versiones, y limita la exploración a 3000 archivos.
- Los proveedores implementados actualmente son Groq, Gemini y OpenRouter; no asumir soporte para otros proveedores sin incorporarlo primero a `src/lib/ai-providers.ts` y sus pruebas.
- El plan de trabajo y el estado de las mejoras se mantienen en `FORJA_IMPROVEMENT_INDEX.md`; leerlo al comenzar una sesión.
