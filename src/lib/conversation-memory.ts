import { recentContext, type HistoryLike } from "./chat-history";

// Resumen rodante de una charla larga: lo viejo se condensa y lo reciente va completo.
export interface ConversationSummary {
  upTo: number; // cantidad de mensajes ya resumidos
  text: string;
}

const KEY = (sessionId: string) => `forja.summary.v1.${sessionId}`;
const RECENT = 20;
const TRIGGER = 30;

export function loadSummary(sessionId: string): ConversationSummary | null {
  try {
    const raw = localStorage.getItem(KEY(sessionId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ConversationSummary>;
    return typeof value.upTo === "number" && typeof value.text === "string"
      ? (value as ConversationSummary)
      : null;
  } catch {
    return null;
  }
}

export function saveSummary(sessionId: string, summary: ConversationSummary) {
  try {
    localStorage.setItem(KEY(sessionId), JSON.stringify(summary));
  } catch {
    /* sin localStorage, el resumen dura solo esta sesión */
  }
}

/** Hay que resumir cuando hay más mensajes sin resumir que el umbral. */
export function needsSummary(total: number, summary: ConversationSummary | null): boolean {
  return total - (summary?.upTo ?? 0) > TRIGGER;
}

/** Mensajes que se resumen en esta vuelta: desde lo ya resumido hasta dejar los últimos RECENT. */
export function chunkToSummarize(history: HistoryLike[], summary: ConversationSummary | null) {
  return history.slice(summary?.upTo ?? 0, history.length - RECENT);
}

/** Contexto para el modelo: el resumen de lo viejo más los mensajes recientes completos. */
export function buildContext(history: HistoryLike[], summary: ConversationSummary | null): HistoryLike[] {
  const recent = recentContext(history.slice(-RECENT * 3));
  if (!summary?.text) return recent;
  return [
    { role: "user", content: `RESUMEN DE LA CHARLA ANTERIOR (lo que ya se habló y se decidió):\n${summary.text}` },
    { role: "assistant", content: "Entendido, sigo con ese contexto." },
    ...recent,
  ];
}

export const SUMMARY_SYSTEM =
  "Sos el secretario de Forja. Escribí resúmenes precisos y breves en español, en texto plano, sin JSON.";

export function summaryRequest(previous: string | undefined, chunk: HistoryLike[]): string {
  const transcript = chunk
    .map((m) => `${m.role === "user" ? "USUARIO" : "FORJA"}: ${m.content}`)
    .join("\n");
  return `${previous ? `Resumen previo:\n${previous}\n\n` : ""}Mensajes nuevos:\n${transcript}\n\nActualizá el resumen en máximo 12 líneas: qué se está creando, decisiones tomadas, archivos creados o cambiados, y pendientes. Texto plano.`;
}
