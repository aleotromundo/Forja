export interface PersistedChatMessage {
  role: "user" | "assistant";
  content: string;
  edits?: { path: string; action: "write" | "delete" | "mkdir" | "move"; toPath?: string }[];
  provider?: string;
  team?: string[];
  error?: boolean;
  undone?: boolean;
}

export interface SessionFileChange {
  added: number;
  removed: number;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: PersistedChatMessage[];
  files: Record<string, SessionFileChange>;
}

const HISTORY_PREFIX = "forja:chat-history:v1:";
const SESSIONS_PREFIX = "forja:chat-sessions:v1:";
const MAX_MESSAGES = 80;
const MAX_SESSIONS = 40;
const MAX_CONTENT_CHARS = 40_000;

function keyFor(prefix: string, projectName: string) {
  return `${prefix}${projectName.trim().slice(0, 120)}`;
}

function sanitizeMessages(messages: PersistedChatMessage[]) {
  return messages.slice(-MAX_MESSAGES).map((message) => ({
    ...message,
    content: message.content.slice(0, MAX_CONTENT_CHARS),
  }));
}

function isMessage(value: unknown): value is PersistedChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as PersistedChatMessage;
  return (
    (message.role === "user" || message.role === "assistant") && typeof message.content === "string"
  );
}

function isSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== "object") return false;
  const session = value as ChatSession;
  return (
    typeof session.id === "string" &&
    typeof session.title === "string" &&
    typeof session.createdAt === "string" &&
    typeof session.updatedAt === "string" &&
    Array.isArray(session.messages) &&
    session.messages.every(isMessage) &&
    !!session.files &&
    typeof session.files === "object"
  );
}

export function chatSessionTitle(messages: PersistedChatMessage[]) {
  const first = messages.find((message) => message.role === "user")?.content.trim();
  if (!first) return "Nueva sesión";
  return first.replace(/\s+/g, " ").slice(0, 48) || "Nueva sesión";
}

function normalizeSession(session: ChatSession): ChatSession {
  return {
    ...session,
    title: session.title || chatSessionTitle(session.messages),
    messages: sanitizeMessages(session.messages),
    files: Object.fromEntries(
      Object.entries(session.files).map(([path, change]) => [
        path,
        {
          added: Number.isFinite(change.added) ? Math.max(0, change.added) : 0,
          removed: Number.isFinite(change.removed) ? Math.max(0, change.removed) : 0,
          updatedAt: typeof change.updatedAt === "string" ? change.updatedAt : session.updatedAt,
        },
      ]),
    ),
  };
}

export function createChatSession(title = "Nueva sesión"): ChatSession {
  const now = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    files: {},
  };
}

export function loadChatSessions(projectName: string): ChatSession[] {
  if (typeof window === "undefined" || !projectName) return [];
  try {
    const sessionsRaw = window.localStorage.getItem(keyFor(SESSIONS_PREFIX, projectName));
    if (sessionsRaw) {
      const parsed: unknown = JSON.parse(sessionsRaw);
      if (Array.isArray(parsed)) {
        return parsed.filter(isSession).map(normalizeSession).slice(-MAX_SESSIONS);
      }
    }

    // Migrate the original single-history format into the first named session.
    const legacy = loadChatHistory(projectName);
    return legacy.length
      ? [
          {
            ...createChatSession(chatSessionTitle(legacy)),
            messages: legacy,
            updatedAt: new Date().toISOString(),
          },
        ]
      : [];
  } catch {
    return [];
  }
}

export function saveChatSessions(projectName: string, sessions: ChatSession[]) {
  if (typeof window === "undefined" || !projectName) return;
  try {
    window.localStorage.setItem(
      keyFor(SESSIONS_PREFIX, projectName),
      JSON.stringify(
        sessions.slice(-MAX_SESSIONS).map((session) => ({
          ...session,
          messages: sanitizeMessages(session.messages),
        })),
      ),
    );
  } catch {
    // Storage may be unavailable or full; chat must continue working in memory.
  }
}

export function loadChatHistory(projectName: string): PersistedChatMessage[] {
  if (typeof window === "undefined" || !projectName) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(HISTORY_PREFIX, projectName));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizeMessages(parsed.filter(isMessage)) : [];
  } catch {
    return [];
  }
}

export function saveChatHistory(projectName: string, messages: PersistedChatMessage[]) {
  if (typeof window === "undefined" || !projectName) return;
  try {
    window.localStorage.setItem(
      keyFor(HISTORY_PREFIX, projectName),
      JSON.stringify(sanitizeMessages(messages)),
    );
  } catch {
    // Storage may be unavailable or full; chat must continue working in memory.
  }
}
