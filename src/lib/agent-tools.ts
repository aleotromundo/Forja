// Herramientas del agente local: definición para el modelo y ruta en el agente.
import { WORK_STYLE } from "./work-style";

export const APPROVAL_REQUIRED = new Set([
  "write_file",
  "make_dir",
  "delete_path",
  "move_path",
  "git_commit",
  "run_command",
]);

export const TOOL_ROUTES: Record<string, string> = {
  list_files: "/fs/tree",
  read_file: "/fs/read",
  write_file: "/fs/write",
  make_dir: "/fs/mkdir",
  delete_path: "/fs/delete",
  move_path: "/fs/move",
  search_text: "/fs/search",
  git_status: "/git/status",
  git_log: "/git/log",
  git_diff: "/git/diff",
  git_commit: "/git/commit",
  run_command: "/shell/run",
};

// Cambios de archivos que se registran en el mensaje para poder revisarlos.
export const FILE_ACTIONS: Record<string, "write" | "mkdir" | "delete" | "move"> = {
  write_file: "write",
  make_dir: "mkdir",
  delete_path: "delete",
  move_path: "move",
};

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });

export const AGENT_TOOLS = [
  fn("list_files", "Lista los archivos del proyecto con tamaño y fecha. Usalo para orientarte.", obj({})),
  fn("read_file", "Lee un archivo de texto completo del proyecto.", obj({ path: str("ruta relativa") }, ["path"])),
  fn(
    "write_file",
    "Crea o reemplaza un archivo con su contenido completo. Requiere aprobación del usuario.",
    obj({ path: str("ruta relativa"), content: str("contenido completo del archivo") }, ["path", "content"]),
  ),
  fn("make_dir", "Crea una carpeta. Requiere aprobación.", obj({ path: str("ruta relativa") }, ["path"])),
  fn("delete_path", "Borra un archivo o carpeta. Requiere aprobación.", obj({ path: str("ruta relativa") }, ["path"])),
  fn(
    "move_path",
    "Mueve o renombra un archivo o carpeta. Requiere aprobación.",
    obj({ path: str("ruta origen"), toPath: str("ruta destino") }, ["path", "toPath"]),
  ),
  fn("search_text", "Busca un texto en todos los archivos del proyecto.", obj({ query: str("texto a buscar") }, ["query"])),
  fn("git_status", "Muestra el estado de git.", obj({})),
  fn("git_log", "Muestra los últimos commits.", obj({})),
  fn("git_diff", "Muestra los cambios sin commitear, opcionalmente de un archivo.", obj({ path: str("ruta opcional") })),
  fn(
    "git_commit",
    "Agrega todos los cambios y hace commit local (no sube nada). Requiere aprobación.",
    obj({ message: str("mensaje del commit") }, ["message"]),
  ),
  fn(
    "open_file",
    "Abre un archivo en Forja para que el usuario lo vea. No ejecuta nada. Usalo después de crear o cambiar un archivo que el usuario tiene que revisar.",
    obj({ path: str("ruta relativa") }, ["path"]),
  ),
  fn(
    "consult_specialist",
    "Pide la opinión de un especialista del equipo antes de decidir algo difícil. architect: arquitectura y archivos; ui: interfaz y responsive; logic: lógica y datos; qa: pruebas y riesgos; docs: documentación. No modifica nada.",
    obj(
      {
        specialist: { type: "string", enum: ["architect", "ui", "logic", "qa", "docs"] },
        question: str("pregunta concreta, con el contexto necesario"),
      },
      ["specialist", "question"],
    ),
  ),
  fn(
    "run_command",
    "Ejecuta un comando permitido: git status/diff/log, npm run|test, bun run|test, npx tsc, npx vitest, o node, python o python3 con un script del proyecto (.js, .mjs o .py). Requiere aprobación.",
    obj({ command: str("comando completo, sin pipes ni encadenados") }, ["command"]),
  ),
];

function fn(name: string, description: string, parameters: unknown) {
  return { type: "function" as const, function: { name, description, parameters } };
}

export const AGENT_SYSTEM = `Sos Forja, un asistente de programación que trabaja directamente sobre la carpeta del proyecto del usuario a través de herramientas.
Trabajá en pasos: primero mirá lo necesario (list_files, read_file, search_text), después cambiá lo mínimo con write_file y verificá (git_diff, run_command con tests o tsc).
Reglas:
- Leé un archivo antes de modificarlo. Escribí siempre el contenido completo.
- Hacé cambios quirúrgicos: solo lo que se pidió. No reformatees ni refactorices código no relacionado.
- No pidas al usuario que pegue archivos: leelos con read_file.
- Las acciones que modifican el proyecto las aprueba el usuario; si una fue rechazada, no insistas: explicá y ofrecé alternativas.
- No hagas push ni instales paquetes.
- Para decisiones de diseño o riesgos, consultá a un especialista con consult_specialist antes de editar.
- Si generaste un archivo que el usuario tiene que ver, abrilo con open_file. Para generar archivos con un script: escribí el script, corrélo con run_command y después abrí el resultado.
- Si necesitás generar algo con un script: escribí el script con write_file y después corrélo con run_command (node ruta/script.js o python ruta/script.py). Nunca menciones un script, comando o archivo que no hayas creado o que no exista en el proyecto.
- Memoria del proyecto: si existe .forja/memoria.md, leela al empezar y respetala. Actualizala con write_file (contenido completo) cuando aprendas algo duradero.
- Cuando termines, respondé en español, directo y breve, sin listas largas ni JSON. Contá qué cambiaste y qué verificaste.

${WORK_STYLE}`;
