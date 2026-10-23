export interface PersistedChatMessage {
  role: "user" | "assistant";
  content: string;
  edits?: { path: string; action: "write" | "delete" }[];
  provider?: string;
  team?: string[];
  error?: boolean;
  undone?: boolean;
}

const PREFIX = "forja:chat-history:v1:";
const MAX_MESSAGES = 80;
const MAX_CONTENT_CHARS = 40_000;

function keyFor(projectName: string) {
  return `${PREFIX}${projectName.trim().slice(0, 120)}`;
}

export function loadChatHistory(projectName: string): PersistedChatMessage[] {
  if (typeof window === "undefined" || !projectName) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(projectName));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (message): message is PersistedChatMessage =>
          !!message &&
          typeof message === "object" &&
          (message as PersistedChatMessage).role !== undefined &&
          ["user", "assistant"].includes((message as PersistedChatMessage).role) &&
          typeof (message as PersistedChatMessage).content === "string",
      )
      .slice(-MAX_MESSAGES)
      .map((message) => ({
        ...message,
        content: message.content.slice(0, MAX_CONTENT_CHARS),
      }));
  } catch {
    return [];
  }
}

export function saveChatHistory(projectName: string, messages: PersistedChatMessage[]) {
  if (typeof window === "undefined" || !projectName) return;
  try {
    window.localStorage.setItem(
      keyFor(projectName),
      JSON.stringify(
        messages.slice(-MAX_MESSAGES).map((message) => ({
          ...message,
          content: message.content.slice(0, MAX_CONTENT_CHARS),
        })),
      ),
    );
  } catch {
    // Storage may be unavailable or full; chat must continue working in memory.
  }
}
