export type ChatMode = "plan" | "edit";

export interface ForjaAgent {
  id: string;
  name: string;
  focus: string;
  /** Words in the request that make this specialist relevant. */
  triggers: RegExp;
}

export const LEAD_ROLE =
  "ROL: sos el líder del equipo Forja. Recibís los aportes de especialistas que trabajaron en paralelo; combinalos, resolvé contradicciones y entregá una única respuesta final.";

export const SPECIALISTS: ForjaAgent[] = [
  {
    id: "architect",
    name: "Arquitecto",
    focus: "estructura del proyecto, archivos a tocar, orden de pasos y decisiones técnicas",
    triggers: /./,
  },
  {
    id: "ui",
    name: "Diseño UI",
    focus: "interfaz, estilos, CSS/Tailwind, maquetación, accesibilidad y adaptación a pantallas",
    triggers:
      /dise|estilo|color|css|tailwind|bot[oó]n|p[aá]gina|pantalla|layout|ui|visual|fuente|men[uú]|responsive|animaci/i,
  },
  {
    id: "logic",
    name: "Lógica y datos",
    focus: "lógica de negocio, estado, APIs, datos, servidor y rendimiento",
    triggers:
      /api|dato|estado|l[oó]gica|funci[oó]n|servidor|backend|fetch|base|guardar|login|formulario|calcul|rendimiento|lento/i,
  },
  {
    id: "qa",
    name: "QA y seguridad",
    focus: "errores, casos borde, validaciones, seguridad y pruebas",
    triggers: /error|bug|falla|roto|no anda|test|prueba|segur|valid/i,
  },
  {
    id: "docs",
    name: "Documentación",
    focus: "README, comentarios y guías de uso",
    triggers: /doc|readme|coment|gu[ií]a|explic/i,
  },
];

/** Architect always participates; others join when relevant. Up to 3 specialists in parallel. */
export function pickTeam(request: string, max = 3): ForjaAgent[] {
  const team = SPECIALISTS.filter((a) => a.triggers.test(request)).slice(0, max);
  if (team.length === 1) team.push(SPECIALISTS.find((a) => a.id === "qa")!);
  return team;
}

export function specialistPrompt(agent: ForjaAgent, mode: ChatMode): string {
  return `Sos el especialista "${agent.name}" del equipo Forja, un editor tipo VS Code. Tu foco: ${agent.focus}.
Analizá el pedido del usuario y el proyecto SOLO desde tu especialidad. Respondé en texto plano, breve (máximo 15 líneas): hallazgos, riesgos y recomendaciones concretas con rutas de archivo. No escribas archivos completos ni JSON; el líder del equipo integra tu aporte${mode === "plan" ? " en un plan" : " y aplica los cambios"}.`;
}

export function modeInstructions(mode: ChatMode): string {
  return mode === "plan"
    ? `MODO PLANEAR: estás conversando ideas con el usuario. NO modifiques archivos bajo ningún concepto: "edits" debe ser siempre []. Analizá, proponé opciones, hacé preguntas y armá planes con pasos concretos y los archivos que tocarías.`
    : `MODO MODIFICAR: tenés permiso para editar archivos. Si el usuario solo conversa o pregunta, respondé sin edits. Cuando pida cambios o diga que avances con lo planeado en la conversación, implementalo con edits completos. Si pide aplicar lo acordado ("aplicá", "dale", "hacelo"), tomá el último plan acordado del historial e implementalo entero, sin pedirle que lo repita.`;
}

/** Plan mode never touches files, whatever the model returned. */
export function enforceMode<T>(mode: ChatMode, edits: T[]): T[] {
  return mode === "plan" ? [] : edits;
}
