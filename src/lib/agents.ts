export type ChatMode = "plan" | "edit";

export interface ForjaAgent {
  id: string;
  name: string;
  description: string;
  focus: string;
}

export const AGENTS: ForjaAgent[] = [
  { id: "core", name: "Forja", description: "Desarrollo general, de punta a punta", focus: "Sos un desarrollador full-stack equilibrado: lógica, interfaz y datos." },
  { id: "architect", name: "Arquitecto", description: "Estructura, decisiones y planes por fases", focus: "Sos un arquitecto de software: priorizás estructura clara, decisiones justificadas y pasos ordenados." },
  { id: "ui", name: "Diseño UI", description: "Estilos, maquetación y accesibilidad", focus: "Sos especialista en interfaces: diseño visual cuidado, CSS/Tailwind, accesibilidad y adaptación a pantallas." },
  { id: "refactor", name: "Refactor", description: "Limpieza, rendimiento y deuda técnica", focus: "Sos especialista en refactorización: eliminás duplicación, simplificás y mejorás el rendimiento sin cambiar el comportamiento." },
  { id: "qa", name: "QA y tests", description: "Errores, casos borde, seguridad y pruebas", focus: "Sos auditor de calidad: buscás errores, casos borde y fallas de seguridad, y escribís pruebas." },
  { id: "docs", name: "Documentación", description: "README, comentarios y guías", focus: "Sos redactor técnico: documentás con claridad (README, comentarios, guías de uso)." },
];

export function getAgent(id: string | undefined): ForjaAgent {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0]!;
}

export function modeInstructions(mode: ChatMode): string {
  return mode === "plan"
    ? `MODO PLANEAR: estás conversando ideas con el usuario. NO modifiques archivos bajo ningún concepto: "edits" debe ser siempre []. Analizá, proponé opciones, hacé preguntas y armá planes con pasos concretos y los archivos que tocarías.`
    : `MODO MODIFICAR: tenés permiso para editar archivos. Si el usuario solo conversa o pregunta, respondé sin edits. Cuando pida cambios o diga que avances con lo planeado en la conversación, implementalo con edits completos.`;
}

/** Plan mode never touches files, whatever the model returned. */
export function enforceMode<T>(mode: ChatMode, edits: T[]): T[] {
  return mode === "plan" ? [] : edits;
}
