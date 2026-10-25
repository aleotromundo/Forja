export interface HistoryLike {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 60;
const MAX_CHARS = 40_000;
const MAX_EACH = 6_000;

/**
 * Toma la conversación más reciente que entra en el presupuesto, en orden cronológico.
 * Así al pasar de Planear a Modificar la IA conserva el hilo completo, con topes para no
 * reventar los límites de los proveedores.
 */
export function recentContext(messages: HistoryLike[]): HistoryLike[] {
  const picked: HistoryLike[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0 && picked.length < MAX_MESSAGES; i--) {
    const m = messages[i];
    if (!m) continue;
    const content =
      m.content.length > MAX_EACH ? `${m.content.slice(0, MAX_EACH)}…` : m.content;
    if (picked.length > 0 && chars + content.length > MAX_CHARS) break;
    chars += content.length;
    picked.unshift({ role: m.role, content });
  }
  return picked;
}
