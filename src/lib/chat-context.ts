export interface ChatAttachment {
  path: string;
  content: string;
}
export interface ChatExtras {
  attachments: ChatAttachment[];
  projectPaths: string[];
  mode?: "plan" | "edit";
}

export const MAX_CONTEXT_FILES = 40;
// Contexto más chico: pedidos grandes hacen que Gemini tarde más de 60s y Groq rechace por tamaño.
export const MAX_CONTEXT_FILE_CHARS = 40_000;
export const MAX_CONTEXT_CHARS = 60_000;

export function findMentionedProjectFiles(text: string, projectFiles: string[]) {
  const query = text.toLowerCase();
  const exactPaths = projectFiles.filter((path) => query.includes(path.toLowerCase()));
  if (exactPaths.length > 0) return exactPaths;

  const names = projectFiles.filter((path) => {
    const name = path.split("/").pop();
    return Boolean(name && query.includes(name.toLowerCase()));
  });
  return names.length === 1 ? names : [];
}

export function asksUserForProjectFile(text: string) {
  return /\b(?:abrir|abrí|abre|abr[aá]|mostrar|mostrá|muestra|compartir|compartí|compartime|comparta|pegar|pegá|pegame|pasame|mandame|facilitame|open|show|share|paste|send|provide)\b.{0,120}\b(?:archivo|file|contenido|content|c[oó]digo|code|proyecto|project)\b|\b(?:archivo|file|contenido|content|c[oó]digo|code)\b.{0,120}\b(?:peg[aá]|compart[ií]|pas[aá]me|mand[aá]me|show|share|paste|send)\b/i.test(
    text,
  );
}

export async function collectChatContext(
  explicit: ChatExtras,
  automatic: string[],
  read: (path: string) => Promise<string | null>,
) {
  const result: ChatAttachment[] = [];
  let remaining = MAX_CONTEXT_CHARS;
  const add = (file: ChatAttachment, required: boolean) => {
    if (
      result.length >= MAX_CONTEXT_FILES ||
      file.content.length > MAX_CONTEXT_FILE_CHARS ||
      file.content.length > remaining
    ) {
      if (required)
        throw new Error(
          "Los archivos seleccionados superan el espacio de contexto. Quitá alguno y volvé a enviar.",
        );
      return;
    }
    result.push(file);
    remaining -= file.content.length;
  };
  for (const file of explicit.attachments)
    add({ ...file, path: `[Adjunto de referencia] ${file.path}` }, true);
  const selected = new Set(explicit.projectPaths);
  for (const path of new Set([...selected, ...automatic])) {
    const content = await read(path);
    if (content === null) {
      if (selected.has(path)) throw new Error(`No se pudo leer ${path}. Volvé a seleccionarlo.`);
      continue;
    }
    add({ path, content }, selected.has(path));
  }
  return result;
}
