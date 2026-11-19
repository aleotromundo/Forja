import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  FolderOpen,
  Files,
  Flame,
  Globe,
  Search,
  Sparkles,
  Undo2,
  Redo2,
  Save,
  Terminal,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { getAiStatus, type AiInput, type AiProgress, type AiResult } from "@/lib/ai.functions";
import {
  createDir,
  flatten,
  isSupported,
  isTextFile,
  languageOf,
  moveEntry,
  pickFolder,
  createAgentDirectoryHandle,
  desktopInvoke,
  isDesktopBridge,
  readFile,
  readTree,
  removeEntry,
  writeBinaryFile,
  writeFile,
  type FileNode,
} from "@/lib/fs";
import { cn } from "@/lib/utils";
import { isSafeRelativePath } from "@/lib/paths";
import { ChatPanel, type ChatMsg, type QueuedMessage } from "./ChatPanel";
import {
  ensureAccess,
  forgetProject,
  listRecent,
  rememberProject,
  type RecentProject,
} from "@/lib/recent-projects";
import { EditorPane, type RevealRequest, type Tab, type TransientEditor } from "./EditorPane";
import { Explorer } from "./Explorer";
import { PreviewPane } from "./PreviewPane";
import { Button } from "@/components/ui/button";
import { EditHistory, type HistoryEntry } from "@/lib/edit-history";
import {
  asksUserForProjectFile,
  collectChatContext,
  findMentionedProjectFiles,
  MAX_CONTEXT_FILE_CHARS,
  type ChatExtras,
} from "@/lib/chat-context";
import { editProblems } from "@/lib/edit-checks";
import { askAgent } from "@/lib/agent.functions";
import { runAgentLoop, type ToolCall } from "@/lib/agent-loop";
import { TOOL_ROUTES } from "@/lib/agent-tools";
import { recentContext } from "@/lib/chat-history";
import {
  buildContext,
  chunkToSummarize,
  loadSummary,
  needsSummary,
  saveSummary,
  summaryRequest,
  SUMMARY_SYSTEM,
  type ConversationSummary,
} from "@/lib/conversation-memory";
import { SPECIALISTS, specialistPrompt } from "@/lib/agents";
import {
  extractImagePath,
  IMAGE_QUERY_SYSTEM,
  looksLikeImageRequest,
  parseImageQueries,
  type FoundImage,
} from "@/lib/image-search";
import { searchImages } from "@/lib/images.functions";
import {
  agentCall,
  AGENT_URL,
  clearAgentSettings,
  hasAgentSettings,
  saveAgentSettings,
} from "@/lib/local-agent";
import {
  chatSessionTitle,
  createChatSession,
  loadChatSessions,
  saveChatSessions,
  type ChatSession,
} from "@/lib/chat-persistence";
import { useIsMobile } from "@/hooks/use-mobile";
import { firstCodeBlock } from "@/lib/ai-stream";
import { loadAutonomyMode, saveAutonomyMode, type AutonomyMode } from "@/lib/agent-policy";

type Snapshot = {
  path: string;
  before: string | null;
  action: "write" | "delete" | "mkdir" | "move";
  toPath?: string;
}[];

function lineDelta(before: string, after: string) {
  const oldLines = before ? before.split("\n") : [];
  const newLines = after ? after.split("\n") : [];
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start])
    start++;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { added: newEnd - start, removed: oldEnd - start };
}

function useDrag(initial: number, min: number, max: number, invert = false) {
  const [w, setW] = useState(initial);
  const start = (e: React.MouseEvent) => {
    const x0 = e.clientX;
    const w0 = w;
    const move = (ev: MouseEvent) => {
      const d = invert ? x0 - ev.clientX : ev.clientX - x0;
      setW(Math.min(max, Math.max(min, w0 + d)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return [w, start] as const;
}

// Pasos automáticos máximos por pedido. Después, el usuario escribe "seguí".
const MAX_AUTO_STEPS = 8;
const DOWNLOAD_REQUEST =
  /(?:descarg[aá]|baj[aá]|download|guard[aá]).{0,240}https?:\/\/\S+|https?:\/\/\S+.{0,240}(?:imagen|archivo|png|jpe?g|gif|webp|svg|pdf|binario)/i;
const DESKTOP_INSTALLER_URL =
  (import.meta.env["VITE_DESKTOP_INSTALLER_URL"] as string | undefined) ||
  "/downloads/Forja_0.1.0_x64-setup.exe";

function scratchPath(language: string) {
  const extensions: Record<string, string> = {
    c: "c",
    cpp: "cpp",
    css: "css",
    go: "go",
    html: "html",
    java: "java",
    js: "js",
    javascript: "js",
    json: "json",
    jsx: "jsx",
    php: "php",
    py: "py",
    python: "py",
    rb: "rb",
    rs: "rs",
    rust: "rs",
    sql: "sql",
    ts: "ts",
    tsx: "tsx",
    typescript: "ts",
    bash: "sh",
    shell: "sh",
  };
  return `Ejemplo.${extensions[language.toLowerCase()] ?? "txt"}`;
}

function directDownloadRequest(input: string) {
  if (!DOWNLOAD_REQUEST.test(input)) return null;
  const urlMatch = input.match(/https?:\/\/[^\s<>'"`]+/i);
  if (!urlMatch) return null;
  const url = urlMatch[0].replace(/[),.;]+$/, "");
  let filename = "download.bin";
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    if (/^[\w.-]+$/.test(last) && last.includes(".")) filename = last;
  } catch {
    /* La validación definitiva la hace el agente local. */
  }
  const destinationMatch = input.match(
    /(?:como|en|a|ruta(?:\s+de)?|path)\s*[:=]?\s*["'`]?([^\s"'`]+)["'`]?/i,
  );
  const path = destinationMatch?.[1] ?? `public/${filename}`;
  return { url, path };
}

function readableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; error?: unknown; reason?: unknown };
    for (const candidate of [value.message, value.error, value.reason]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Error desconocido.";
    }
  }
  return "Error desconocido.";
}

async function askForjaStreaming(
  data: AiInput,
  signal: AbortSignal,
  onProgress: (progress: AiProgress) => void,
): Promise<AiResult> {
  const response = await fetch("/api/ai-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "No se pudo iniciar la respuesta de IA.");
  }
  if (!response.body) throw new Error("El servidor no inició el flujo de respuesta.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AiResult | null = null;
  const consumeLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const event = JSON.parse(line.slice(5).trim()) as
      AiProgress | { type: "result"; result: AiResult } | { type: "error"; message: string };
    if (event.type === "result") result = event.result;
    else if (event.type === "error") throw new Error(event.message);
    else onProgress(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(consumeLine);
    }
    buffer += decoder.decode();
    if (buffer) consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!result) throw new Error("La respuesta de IA terminó antes de completarse.");
  return result;
}

export function Workbench() {
  const getStatus = useServerFn(getAiStatus);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;
  const [recent, setRecent] = useState<RecentProject[]>([]);
  useEffect(() => {
    void listRecent().then(setRecent);
  }, []);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<{ path: string; content: string } | null>(null);
  const [scratch, setScratch] = useState<{ path: string; content: string } | null>(null);
  const [transientKind, setTransientKind] = useState<"live" | "scratch" | null>(null);
  const [applyingScratch, setApplyingScratch] = useState(false);
  const applyingScratchRef = useRef(false);
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [lastProvider, setLastProvider] = useState<string>("");
  const [apiStatus, setApiStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [apiProviders, setApiProviders] = useState<string[]>([]);
  const [requestPhase, setRequestPhase] = useState<
    "idle" | "preparing" | "consulting" | "applying"
  >("idle");
  const [autonomy, setAutonomy] = useState<AutonomyMode>(() =>
    loadAutonomyMode(typeof window === "undefined" ? undefined : window.localStorage),
  );
  const isMobile = useIsMobile();
  const [mobilePanel, setMobilePanel] = useState<"editor" | "explorer" | "chat">("editor");
  const [showExplorer, setShowExplorer] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const [view, setView] = useState<"code" | "preview">("code");
  const [previewContext, setPreviewContext] = useState("");
  const editHistory = useRef(new EditHistory());
  const [, updateHistory] = useState(0);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const requestControllerRef = useRef<AbortController | null>(null);
  const streamedReplyRef = useRef("");
  const streamedEditsRef = useRef(new Map<string, string>());
  const record = (entry: HistoryEntry) => {
    editHistory.current.record(entry);
    updateHistory((v) => v + 1);
  };
  const travel = async (redo = false, index?: number) => {
    if (busy) return;
    try {
      if (index !== undefined) await editHistory.current.undoThrough(index);
      else if (redo) await editHistory.current.redo();
      else await editHistory.current.undo();
    } catch {
      toast.error("No se pudo restaurar el cambio. Revisá el permiso de tu carpeta.");
    }
    updateHistory((v) => v + 1);
  };
  const changeText = (path: string, content: string, original?: string) => {
    const previous = tabsRef.current.find((tab) => tab.path === path);
    const before = previous?.content ?? original ?? "";
    if (before === content) return;
    const apply = (value: string) => {
      setActive(path);
      setTabs((current) =>
        current.some((tab) => tab.path === path)
          ? current.map((tab) =>
              tab.path === path ? { ...tab, content: value, showDiff: false } : tab,
            )
          : [...current, { path, content: value, saved: previous?.saved ?? original ?? before }],
      );
    };
    record({ undo: () => apply(before), redo: () => apply(content) });
    apply(content);
  };
  const [leftW, dragLeft] = useDrag(260, 160, 500);
  const [rightW, dragRight] = useDrag(380, 260, 700, true);

  const files = useMemo(() => flatten(tree), [tree]);

  useEffect(() => {
    void getStatus()
      .then((status) => {
        setApiProviders(status.providers);
        setApiStatus(status.connected ? "connected" : "offline");
      })
      .catch(() => setApiStatus("offline"));
  }, [getStatus]);

  useEffect(() => {
    if (root?.name && sessions.length) saveChatSessions(root.name, sessions);
  }, [root?.name, sessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    setSessions((current) =>
      current.map((session) =>
        session.id === activeSessionId
          ? {
              ...session,
              title: session.title === "Nueva sesión" ? chatSessionTitle(messages) : session.title,
              updatedAt: messages.length ? new Date().toISOString() : session.updatedAt,
              messages,
            }
          : session,
      ),
    );
  }, [activeSessionId, messages]);

  const refresh = useCallback(
    async (r = root) => {
      if (r) setTree(await readTree(r));
    },
    [root],
  );

  const openHandle = async (h: FileSystemDirectoryHandle) => {
    try {
      void rememberProject(h).then(() => listRecent().then(setRecent));
      editHistory.current.clear();
      updateHistory((v) => v + 1);
      const restored = loadChatSessions(h.name);
      const available = restored.length ? restored : [createChatSession()];
      const latest = [...available].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!;
      setSessions(available);
      setActiveSessionId(latest.id);
      setMessages(latest.messages as ChatMsg[]);
      setRoot(h);
      setTabs([]);
      setActive(null);
      setLivePreview(null);
      setScratch(null);
      setTransientKind(null);
      setChanged(new Set());
      setPreviewContext("");
      setTree(await readTree(h));
    } catch {
      toast.error("No se pudo leer la carpeta");
    }
  };

  const openFolder = async () => {
    try {
      await openHandle(await pickFolder());
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("No se pudo abrir la carpeta");
    }
  };

  const openRecent = async (item: RecentProject) => {
    if (!(await ensureAccess(item.handle))) {
      toast.error(`Forja necesita permiso para abrir "${item.name}"`);
      return;
    }
    await openHandle(item.handle);
  };

  const newChat = () => {
    const session = createChatSession();
    setSessions((current) => [...current, session]);
    setActiveSessionId(session.id);
    setMessages([]);
    setPreviewContext("");
    setLivePreview(null);
    setScratch(null);
    setTransientKind(null);
    if (isMobile) setMobilePanel("chat");
  };

  const selectChat = (id: string) => {
    const session = sessions.find((item) => item.id === id);
    if (!session) return;
    setActiveSessionId(id);
    setMessages(session.messages as ChatMsg[]);
    setPreviewContext("");
    setLivePreview(null);
    setScratch(null);
    setTransientKind(null);
  };

  const openFile = useCallback(
    async (path: string) => {
      if (!root) return;
      if (!isTextFile(path)) {
        toast.info("Archivo binario: no se puede editar");
        return;
      }
      const exists = tabs.find((t) => t.path === path);
      if (!exists) {
        try {
          const content = await readFile(root, path);
          setTabs((ts) =>
            ts.some((t) => t.path === path) ? ts : [...ts, { path, content, saved: content }],
          );
        } catch {
          toast.error(`No se pudo leer ${path}`);
          return;
        }
      }
      setActive(path);
      setTransientKind(null);
    },
    [root, tabs],
  );

  /** Opens a file and, when a line is given, scrolls the editor to it. */
  const openAt = useCallback(
    (path: string, line?: number) => {
      void openFile(path).then(() => {
        if (line) setReveal({ path, line, nonce: Date.now() });
      });
    },
    [openFile],
  );

  const save = useCallback(
    async (path: string) => {
      if (!root) return;
      const t = tabs.find((x) => x.path === path);
      if (!t) return;
      const delta = lineDelta(t.saved, t.content);
      await writeFile(root, path, t.content);
      setTabs((ts) => ts.map((x) => (x.path === path ? { ...x, saved: x.content } : x)));
      if (activeSessionId && (delta.added > 0 || delta.removed > 0)) {
        const updatedAt = new Date().toISOString();
        setSessions((current) =>
          current.map((session) =>
            session.id === activeSessionId
              ? {
                  ...session,
                  updatedAt,
                  files: {
                    ...session.files,
                    [path]: {
                      added: (session.files[path]?.added ?? 0) + delta.added,
                      removed: (session.files[path]?.removed ?? 0) + delta.removed,
                      updatedAt,
                    },
                  },
                }
              : session,
          ),
        );
      }
      toast.success(`Guardado ${path.split("/").pop()}`);
    },
    [activeSessionId, root, tabs],
  );

  const closeTab = (path: string) => {
    const t = tabs.find((x) => x.path === path);
    if (t && t.content !== t.saved && !confirm(`${path} tiene cambios sin guardar. ¿Cerrar igual?`))
      return;
    const rest = tabs.filter((x) => x.path !== path);
    setTabs(rest);
    if (active === path) setActive(rest.at(-1)?.path ?? null);
  };

  const newEntry = async (dir: string, kind: "file" | "folder") => {
    if (!root) return;
    const name = prompt(kind === "file" ? "Nombre del archivo" : "Nombre de la carpeta");
    if (!name) return;
    const path = dir ? `${dir}/${name}` : name;
    if (kind === "file") {
      await writeFile(root, path, "");
      await refresh();
      openFile(path);
    } else {
      await createDir(root, path);
      await refresh();
    }
  };

  const del = async (path: string) => {
    if (!root || !confirm(`¿Eliminar ${path}?`)) return;
    await removeEntry(root, path);
    setTabs((ts) => ts.filter((t) => t.path !== path && !t.path.startsWith(path + "/")));
    if (active && (active === path || active.startsWith(path + "/"))) setActive(null);
    await refresh();
  };

  const [agentLinked, setAgentLinked] = useState(() => hasAgentSettings());

  const approvalWaiters = useRef(new Map<string, (ok: boolean) => void>());

  const resolveApproval = (id: string, ok: boolean) => {
    const waiter = approvalWaiters.current.get(id);
    approvalWaiters.current.delete(id);
    setMessages((ms) =>
      ms.map((m) =>
        m.approval?.id === id
          ? { ...m, approval: { ...m.approval, status: ok ? "approved" : "rejected" } }
          : m,
      ),
    );
    waiter?.(ok);
  };

  // Pregunta de permiso dentro del chat para acciones sensibles (borrar o commit).
  const askApproval = (items: string[]) => {
    if (isMobile) setMobilePanel("chat");
    const id = `ap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((ms) => [
      ...ms,
      {
        role: "assistant",
        content: "Necesito tu permiso para estas acciones:",
        approval: { id, items, status: "pending" },
        provider: "agente",
        team: [],
      },
    ]);
    return new Promise<boolean>((resolve) => approvalWaiters.current.set(id, resolve));
  };

  const applyScratch = async () => {
    if (!root || !scratch || applyingScratchRef.current) return;
    const folder = root;
    const draft = scratch;
    applyingScratchRef.current = true;
    setApplyingScratch(true);
    try {
      const path = window.prompt("Ruta relativa del archivo:", draft.path);
      if (!path) return;
      if (!isSafeRelativePath(path)) {
        toast.error("La ruta debe ser relativa y permanecer dentro del proyecto.");
        return;
      }

      let before: string | null = tabsRef.current.find((tab) => tab.path === path)?.content ?? null;
      if (before === null) {
        try {
          before = await readFile(folder, path);
        } catch (error) {
          if (error instanceof DOMException && error.name === "NotFoundError") before = null;
          else {
            toast.error(`No se pudo leer ${path}: ${(error as Error).message}`);
            return;
          }
        }
      }
      if (!(await askApproval([`${before === null ? "Crear" : "Reemplazar"} ${path}`]))) return;
      if (rootRef.current !== folder) {
        toast.error("El proyecto cambió. Volvé a abrir el borrador para aplicarlo.");
        return;
      }

      try {
        await writeFile(folder, path, draft.content);
      } catch (error) {
        toast.error(`No se pudo guardar ${path}: ${(error as Error).message}`);
        return;
      }
      if (rootRef.current !== folder) {
        toast.info(`Se guardó ${path} en ${folder.name}, que ya no es el proyecto activo.`);
        return;
      }
      const restore = async (content: string | null) => {
        if (content === null) await removeEntry(folder, path);
        else await writeFile(folder, path, content);
        setTabs((current) =>
          content === null
            ? current.filter((tab) => tab.path !== path)
            : current.some((tab) => tab.path === path)
              ? current.map((tab) =>
                  tab.path === path ? { ...tab, content, saved: content } : tab,
                )
              : [...current, { path, content, saved: content }],
        );
        setActive(content === null ? null : path);
        setTransientKind(null);
        setLivePreview(null);
        await refresh(folder);
      };
      record({
        undo: () => restore(before),
        redo: () => restore(draft.content),
      });
      setTabs((current) =>
        current.some((tab) => tab.path === path)
          ? current.map((tab) =>
              tab.path === path ? { ...tab, content: draft.content, saved: draft.content } : tab,
            )
          : [...current, { path, content: draft.content, saved: draft.content }],
      );
      setActive(path);
      setTransientKind(null);
      setLivePreview(null);
      if (isMobile) setMobilePanel("editor");
      setChanged((current) => new Set([...current, path]));
      try {
        await refresh(folder);
      } catch (error) {
        toast.error(
          `Se guardó ${path}, pero no se pudo actualizar el explorador: ${(error as Error).message}`,
        );
        return;
      }
      toast.success(`Se guardó ${path}`);
    } finally {
      applyingScratchRef.current = false;
      setApplyingScratch(false);
    }
  };

  const say = (content: string) =>
    setMessages((ms) => [
      ...ms,
      { role: "assistant", content, provider: "forja", team: [], error: false },
    ]);

  // Guarda una imagen encontrada en la carpeta del proyecto, con la misma aprobación que el resto de las descargas.
  const saveImageToProject = async (image: FoundImage, path: string): Promise<string> => {
    if (!root) throw new Error("Abrí una carpeta primero.");
    const approved =
      autonomy === "unattended" ||
      (await askApproval([`guardar imagen en ${path} (${image.title})`]));
    if (!approved) return "Guardado cancelado.";
    if (agentLinked || isDesktopBridge()) {
      const args = { url: image.full, path };
      if (isDesktopBridge()) await desktopInvoke("desktop_download", args);
      else await agentCall(TOOL_ROUTES["download_file"]!, args);
    } else {
      const res = await fetch(image.full);
      if (!res.ok) throw new Error(`la imagen respondió ${res.status}`);
      await writeBinaryFile(root, path, await res.blob());
    }
    await refresh();
    return `Guardada en ${path}.`;
  };

  // Pedidos de imágenes: busca, muestra en el chat y, si se pidió, guarda en el proyecto.
  // No depende del agente local.
  const answerImageRequest = async (input: string, history: ChatMsg[]) => {
    setRequestPhase("consulting");
    let plan: { queries: string[]; path: string | null };
    try {
      const step = await askAgent({
        data: {
          messages: [{ role: "user", content: input }],
          system: IMAGE_QUERY_SYSTEM,
          noTools: true,
        },
      });
      plan = parseImageQueries(step.reply, input);
    } catch {
      plan = parseImageQueries("", input);
    }
    const path = plan.path ?? extractImagePath(input);
    setRequestPhase("applying");
    const images = plan.queries.length
      ? await searchImages({ data: { queries: plan.queries } }).catch(() => [] as FoundImage[])
      : [];
    if (images.length === 0) {
      const content = plan.queries.length
        ? `No encontré imágenes públicas para: ${plan.queries.join(", ")}. Probá describirla de otra forma.`
        : "No entendí qué imagen buscar. Contame qué querés ver.";
      setMessages([...history, { role: "assistant", content, provider: "forja", team: [] }]);
      return;
    }
    const sources = [...new Set(images.map((i) => i.source))].join(", ");
    let content = `Encontré ${images.length} ${images.length === 1 ? "imagen" : "imágenes"} (${sources}) para: ${plan.queries.join(", ")}.`;
    if (path) {
      try {
        content += ` ${await saveImageToProject(images[0]!, path)}`;
      } catch (err) {
        content += ` No pude guardarla: ${(err as Error).message}.`;
      }
    }
    setMessages([
      ...history,
      {
        role: "assistant",
        content,
        provider: "forja",
        team: [],
        images,
        ...(path ? { imagePath: path } : {}),
      },
    ]);
  };

  const connectAgent = async () => {
    const token = window.prompt(
      "Pegá el token que muestra el agente local de Forja (la ventana de tu PC):",
    );
    if (!token?.trim()) return;
    saveAgentSettings({ url: AGENT_URL, token: token.trim() });
    try {
      const health = (await agentCall("/health", {})) as { project?: string };
      if (root && health.project && health.project !== root.name) {
        say(
          `Ojo: el agente está en la carpeta "${health.project}" y abriste "${root.name}". Tienen que ser la misma.`,
        );
      }
      setAgentLinked(true);
    } catch (error) {
      clearAgentSettings();
      setAgentLinked(false);
      say(`No pude conectar el agente: ${(error as Error).message}`);
    }
  };

  const disconnectAgent = () => {
    clearAgentSettings();
    setAgentLinked(false);
  };

  const downloadAgentLauncher = () => {
    const link = document.createElement("a");
    link.href = "/start-forja-agent.bat";
    link.download = "start-forja-agent.bat";
    link.click();
  };

  const installDesktop = () => {
    if (!DESKTOP_INSTALLER_URL) return;
    window.open(DESKTOP_INSTALLER_URL, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? new URLSearchParams(window.location.hash.slice(1))
      : null;
    const token = hash?.get("agentToken");
    if (!token) return;
    const projectName = hash?.get("projectName");
    saveAgentSettings({ url: AGENT_URL, token });
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${window.location.search}`,
    );
    const connectProject = async () => {
      setAgentLinked(true);
      if (!projectName) return;
      const recentProject = (await listRecent()).find((item) => item.name === projectName);
      if (recentProject && (await ensureAccess(recentProject.handle))) {
        await openHandle(recentProject.handle);
        toast.success(`Proyecto reutilizado: ${projectName}`);
      } else {
        await openHandle(createAgentDirectoryHandle(projectName));
        toast.success(`Proyecto conectado: ${projectName}`);
      }
    };
    const connection = isDesktopBridge()
      ? connectProject()
      : agentCall("/health", {}).then(connectProject);
    void connection.catch(() => {
      clearAgentSettings();
      setAgentLinked(false);
      say("No pude conectar automáticamente el agente local. Ejecutá el lanzador nuevamente.");
    });
  }, []);

  // Modo agente: el modelo lee, cambia y verifica el proyecto con herramientas en la PC del usuario.
  const runAgent = async (chatContext: { role: "user" | "assistant"; content: string }[]) => {
    if (!root) return;
    agentActiveRef.current = true;
    const messages: unknown[] = [...chatContext];
    const result = await runAgentLoop(messages, {
      ask: async (msgs) => {
        setRequestPhase("consulting");
        const step = await askAgent({ data: { messages: msgs } });
        return step.type === "tool_calls"
          ? {
              type: "tool_calls" as const,
              assistantMessage: step.assistantMessage,
              calls: step.calls,
              provider: step.provider,
              model: step.model,
            }
          : {
              type: "final" as const,
              reply: step.reply,
              provider: step.provider,
              model: step.model,
            };
      },
      runTool: async (name, args) => {
        if (name === "open_file") {
          const path = String(args["path"] ?? "");
          if (!isSafeRelativePath(path)) throw new Error("Ruta inválida.");
          await openFile(path);
          return { ok: true, abierto: path };
        }
        if (name === "consult_specialist") {
          setRequestPhase("consulting");
          const agent = SPECIALISTS.find((a) => a.id === args["specialist"]);
          if (!agent) throw new Error("Especialista desconocido.");
          const step = await askAgent({
            data: {
              messages: [{ role: "user", content: String(args["question"] ?? "") }],
              system: specialistPrompt(agent, "edit"),
              noTools: true,
            },
          });
          return { especialista: agent.name, opinion: step.reply };
        }
        setRequestPhase("applying");
        const route = TOOL_ROUTES[name];
        if (!route) throw new Error(`Herramienta desconocida: ${name}`);
        return agentCall(route, args);
      },
      approve: (calls: ToolCall[]) =>
        autonomy === "unattended"
          ? Promise.resolve(true)
          : askApproval(calls.map((c) => `${c.name} ${JSON.stringify(c.args).slice(0, 160)}`)),
      drain: () => steerRef.current.splice(0),
      onSteer: (text) => setMessages((m) => [...m, { role: "user", content: text }]),
      shouldStop: () => stopRef.current,
    });

    const touched = new Set(
      result.actions.flatMap((a) => (a.toPath ? [a.path, a.toPath] : [a.path])),
    );
    for (const tab of tabsRef.current) {
      if (!touched.has(tab.path)) continue;
      const content = await readFile(root, tab.path).catch(() => null);
      setTabs((ts) =>
        content === null
          ? ts.filter((t) => t.path !== tab.path)
          : ts.map((t) => (t.path === tab.path ? { ...t, content, saved: content } : t)),
      );
    }
    if (touched.size > 0) setChanged((c) => new Set([...c, ...touched]));
    await refresh();
    const block = firstCodeBlock(result.reply);
    if (block) {
      setScratch({ path: scratchPath(block.language), content: block.content });
      setTransientKind("scratch");
      setView("code");
      if (isMobile) setMobilePanel("editor");
    }
    const actionSummary = result.actions
      .map((action) =>
        action.action === "move"
          ? `${action.path} → ${action.toPath}`
          : `${action.action}: ${action.path}`,
      )
      .join(", ");
    const finalReply = result.limitReached
      ? `Trabajo parcial: se alcanzó el límite de pasos del agente. ${
          actionSummary ? `Cambios ya realizados: ${actionSummary}. ` : ""
        }No está confirmado como terminado. ${result.reply}`
      : result.stopped
        ? `Trabajo detenido por pedido del usuario.${
            actionSummary
              ? ` Cambios ya realizados: ${actionSummary}.`
              : " No se aplicaron cambios."
          }`
        : result.reply;
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content: finalReply,
        edits: result.actions.map((a) => ({
          path: a.path,
          action: a.action,
          ...(a.toPath ? { toPath: a.toPath } : {}),
        })),
        provider: result.provider ?? "agente",
        team: [],
      },
    ]);
  };

  const sendChat = async (
    text: string,
    extras: ChatExtras,
    step = 0,
    base?: ChatMsg[],
  ): Promise<boolean> => {
    if (!root) return false;
    const input = previewContext
      ? `${text}\n\n[Contexto seleccionado en vista previa]\n${previewContext}`
      : text;
    const history: ChatMsg[] = [...(base ?? messages), { role: "user", content: input }];
    setBusy(true);
    stopRef.current = false;
    requestControllerRef.current?.abort();
    const requestController = new AbortController();
    requestControllerRef.current = requestController;
    streamedReplyRef.current = "";
    streamedEditsRef.current.clear();
    setLivePreview(null);
    setApiStatus("connecting");
    setRequestPhase("preparing");
    try {
      if (looksLikeImageRequest(input)) {
        await answerImageRequest(input, history);
        return true;
      }
      // Context: active file, open tabs, and any file path mentioned in the message.
      const wanted = new Set<string>();
      // Memoria del proyecto: se carga si existe.
      wanted.add(".forja/memoria.md");
      const lowerInput = input.toLowerCase();
      const mentionedFiles = findMentionedProjectFiles(input, files);
      const mentionedFile = mentionedFiles[0];
      if (mentionedFile) {
        await openFile(mentionedFile);
        setView("code");
        if (isMobile) setMobilePanel("editor");
      }
      const activePath = mentionedFile ?? active;
      if (activePath) wanted.add(activePath);
      tabs.forEach((t) => wanted.add(t.path));
      files.forEach((f) => {
        const name = f.split("/").pop();
        if (
          lowerInput.includes(f.toLowerCase()) ||
          (name && lowerInput.includes(name.toLowerCase()))
        )
          wanted.add(f);
      });
      const ctx = await collectChatContext(
        {
          ...extras,
          projectPaths: [...new Set([...extras.projectPaths, ...mentionedFiles])],
        },
        [...mentionedFiles, ...wanted],
        async (path) => {
          const tab = tabsRef.current.find((item) => item.path === path);
          if (tab) return tab.content;
          try {
            return await readFile(root, path);
          } catch (error) {
            if (error instanceof DOMException && error.name === "NotFoundError") return null;
            throw new Error(
              `No se pudo leer ${path}: ${error instanceof Error ? error.message : "error de lectura"}`,
            );
          }
        },
      );
      setMessages(history);
      setRequestPhase("consulting");

      // Memoria de la charla: en charlas largas, lo viejo se resume y se guarda por sesión.
      const sid = activeSessionId ?? "default";
      let summary: ConversationSummary | null = loadSummary(sid);
      if (needsSummary(history.length, summary)) {
        try {
          const r = await askAgent({
            data: {
              messages: [
                {
                  role: "user",
                  content: summaryRequest(
                    summary?.text,
                    recentContext(chunkToSummarize(history, summary)),
                  ),
                },
              ],
              system: SUMMARY_SYSTEM,
              noTools: true,
            },
          });
          summary = { upTo: history.length - 20, text: r.reply };
          saveSummary(sid, summary);
        } catch {
          /* Sin resumen nuevo seguimos con el recorte reciente. */
        }
      }
      const chatContext = buildContext(history, summary);

      const directDownload = directDownloadRequest(input);
      if (directDownload && !agentLinked && !isDesktopBridge() && extras.mode !== "plan") {
        say(
          "Para descargar ese archivo dentro del proyecto, abrí el modo Modificar y conectá el agente local desde el botón «Agente». En la app de escritorio esto se conecta automáticamente al elegir la carpeta.",
        );
        return true;
      }
      if (directDownload && (agentLinked || isDesktopBridge()) && extras.mode !== "plan") {
        const call: ToolCall = {
          id: `download-${Date.now()}`,
          name: "download_file",
          args: directDownload,
        };
        const approved =
          autonomy === "unattended" ||
          (await askApproval([`download_file ${JSON.stringify(directDownload)}`]));
        if (!approved) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Descarga cancelada.", provider: "agente", team: [] },
          ]);
          return true;
        }
        setRequestPhase("applying");
        try {
          if (isDesktopBridge()) await desktopInvoke("desktop_download", call.args);
          else await agentCall(TOOL_ROUTES["download_file"]!, call.args);
          await refresh();
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `Descarga completada: ${directDownload.path}`,
              provider: "agente",
              team: [],
            },
          ]);
        } catch (error) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `No se pudo descargar el archivo: ${readableError(error)}`,
              provider: "agente",
              team: [],
              error: true,
            },
          ]);
        }
        return true;
      }

      if (agentLinked && extras.mode !== "plan") {
        const agentContext =
          ctx.length === 0
            ? chatContext
            : [
                ...chatContext,
                {
                  role: "user" as const,
                  content: `[Contexto local ya leído por Forja. Usá este contenido directamente; no le pidas al usuario que abra, copie o pegue estos archivos.]\n\n${ctx
                    .map(
                      (file) =>
                        `===== ${file.path} =====\n${file.content
                          .split("\n")
                          .map((line, index) => `${index + 1}| ${line}`)
                          .join("\n")}`,
                    )
                    .join("\n\n")}`,
                },
              ];
        await runAgent(agentContext);
        return true;
      }

      const resetStreamPreview = () => {
        streamedReplyRef.current = "";
        streamedEditsRef.current.clear();
        setLivePreview(null);
        setTransientKind(null);
      };
      const onProgress = (progress: AiProgress) => {
        if (progress.type === "reply") {
          streamedReplyRef.current += progress.text;
          const block = firstCodeBlock(streamedReplyRef.current);
          if (block) {
            setScratch({ path: scratchPath(block.language), content: block.content });
            setTransientKind("scratch");
            setView("code");
            if (isMobile) setMobilePanel("editor");
          }
          return;
        }
        const previous = progress.reset ? "" : (streamedEditsRef.current.get(progress.path) ?? "");
        const content = progress.reset ? progress.content : previous + progress.content;
        streamedEditsRef.current.set(progress.path, content);
        setLivePreview({ path: progress.path, content });
        setTransientKind("live");
        setView("code");
        if (isMobile) setMobilePanel("editor");
      };
      const askStreaming = (request: AiInput) =>
        askForjaStreaming(request, requestController.signal, onProgress);
      const request: AiInput = {
        messages:
          !agentLinked && extras.mode !== "plan" && DOWNLOAD_REQUEST.test(input)
            ? [
                ...chatContext,
                {
                  role: "user" as const,
                  content:
                    "[Capacidad local] El agente local no está conectado. No afirmes que la descarga binaria es imposible: explicá que para descargar esa URL dentro del proyecto el usuario debe conectar el agente local desde Modificar. Si el agente está conectado, usá la herramienta download_file.",
                },
              ]
            : chatContext,
        files: ctx,
        tree: files.slice(0, 3000),
        activePath,
        mode: extras.mode ?? "edit",
      };
      let res = await askStreaming(request);
      // Si la IA nombró un archivo que no tenía en contexto, lo cargamos y le pedimos de nuevo.
      const mentioned = files.filter(
        (f) => !ctx.some((c) => c.path === f) && res.reply.includes(f),
      );
      if (res.edits.length === 0 && mentioned.length > 0) {
        const extra = (
          await Promise.all(
            mentioned.slice(0, 3).map(async (path) => ({
              path,
              content: await readFile(root, path).catch(() => null),
            })),
          )
        ).filter(
          (f): f is { path: string; content: string } =>
            f.content !== null && f.content.length <= MAX_CONTEXT_FILE_CHARS,
        );
        if (extra.length > 0) {
          setRequestPhase("consulting");
          resetStreamPreview();
          res = await askStreaming({
            ...request,
            files: [...ctx, ...extra],
          });
        }
      }
      // Forja no le pide al usuario que pegue archivos: si lo hace sin cambios, se le corrige una vez.
      if (res.edits.length === 0 && asksUserForProjectFile(res.reply) && !stopRef.current) {
        setRequestPhase("consulting");
        resetStreamPreview();
        const loadedPaths = ctx.map((file) => file.path).join(", ");
        res = await askStreaming({
          ...request,
          messages: [
            ...chatContext,
            {
              role: "user",
              content: `[Instrucción de Forja] No le pidas al usuario que abra, copie, comparta ni pegue un archivo. Ya tenés el contenido local de estos archivos en ARCHIVOS DEL PROYECTO: ${loadedPaths || "ninguno"}. Leelos desde ese contexto y respondé el pedido original. Si el archivo mencionado no está en esa lista, decí que no se pudo leer desde la carpeta abierta; no le pidas al usuario que lo abra ni que pegue el contenido.`,
            },
          ],
        });
        if (res.edits.length === 0 && asksUserForProjectFile(res.reply)) {
          res = {
            ...res,
            reply:
              "Ya compartí con la IA el contenido local disponible del proyecto, pero no pudo analizarlo. No hace falta que abras ni pegues el archivo; podés reformular la consulta o intentar de nuevo.",
          };
        }
      }
      if (stopRef.current) {
        setLivePreview(null);
        setTransientKind(null);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "Detenido. No apliqué la respuesta de la IA.",
            provider: res.provider,
            team: [],
          },
        ]);
        return true;
      }
      setApiStatus("connected");
      setRequestPhase("applying");
      setLastProvider(`${res.provider} · ${res.model}`);
      setPreviewContext("");
      if (res.edits.length === 0) {
        setLivePreview(null);
        const codeBlock = firstCodeBlock(res.reply);
        if (codeBlock) {
          setScratch({ path: scratchPath(codeBlock.language), content: codeBlock.content });
          if (isMobile) setMobilePanel("editor");
        }
        setTransientKind(codeBlock ? "scratch" : null);
        if (!codeBlock) {
          const lowerReply = res.reply.toLowerCase();
          const discussedFile = files.find((path) => lowerReply.includes(path.toLowerCase()));
          if (discussedFile) {
            await openFile(discussedFile);
            setView("code");
            if (isMobile) setMobilePanel("editor");
          }
        }
      }

      // Apply edits to disk and editor.
      // "open" no modifica archivos: se muestra en una pestaña al final.
      const opens = res.edits.filter((e) => e.action === "open" && isSafeRelativePath(e.path));
      const edits = res.edits.filter(
        (edit): edit is typeof edit & { action: "write" | "delete" | "mkdir" | "move" } =>
          edit.action !== "open" &&
          isSafeRelativePath(edit.path) &&
          (edit.action !== "move" || Boolean(edit.toPath && isSafeRelativePath(edit.toPath))),
      );
      // Revisión antes de aplicar: si el cambio rompe imports conocidos, no se aplica.
      const problems = editProblems(edits);
      if (problems.length > 0) {
        setLivePreview(null);
        setTransientKind(null);
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: `No apliqué los cambios porque romperían la página:\n${problems.join("\n")}`,
            provider: res.provider,
            team: res.team,
          },
        ]);
        return true;
      }
      if (
        autonomy === "assisted" &&
        step === 0 &&
        edits.length > 0 &&
        !(await askApproval(
          edits.map((edit) => {
            const label =
              edit.action === "delete"
                ? "Eliminar"
                : edit.action === "mkdir"
                  ? "Crear carpeta"
                  : edit.action === "move"
                    ? "Mover"
                    : "Modificar/crear";
            return `${label} ${edit.path}${edit.action === "move" ? ` → ${edit.toPath}` : ""}`;
          }),
        ))
      ) {
        setLivePreview(null);
        setTransientKind(null);
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: "No apliqué los cambios propuestos. Podés volver a pedirlos cuando quieras.",
            provider: res.provider,
            team: res.team,
          },
        ]);
        return true;
      }
      const snap: Snapshot = [];
      for (const e of edits) {
        if (e.action === "move" && !e.toPath)
          throw new Error(`Falta el destino para mover ${e.path}`);
        const prev =
          e.action === "mkdir"
            ? null
            : (tabs.find((t) => t.path === e.path)?.content ??
              (await readFile(root, e.path).catch(() => null)));
        snap.push({
          path: e.path,
          before: prev,
          action: e.action,
          ...(e.toPath ? { toPath: e.toPath } : {}),
        });
        if (e.action === "delete") {
          await removeEntry(root, e.path).catch(() => {});
        } else if (e.action === "mkdir") {
          await createDir(root, e.path);
        } else if (e.action === "move" && e.toPath) {
          await moveEntry(root, e.path, e.toPath);
        } else {
          await writeFile(root, e.path, e.content ?? "");
        }
      }
      if (activeSessionId && edits.length) {
        const updatedAt = new Date().toISOString();
        setSessions((current) =>
          current.map((session) => {
            if (session.id !== activeSessionId) return session;
            const files = { ...session.files };
            edits.forEach((edit) => {
              const before = snap.find((item) => item.path === edit.path)?.before ?? "";
              if (edit.action !== "write" && edit.action !== "delete") return;
              const delta = lineDelta(before, edit.action === "delete" ? "" : (edit.content ?? ""));
              const previous = files[edit.path] ?? { added: 0, removed: 0, updatedAt };
              files[edit.path] = {
                added: previous.added + delta.added,
                removed: previous.removed + delta.removed,
                updatedAt,
              };
            });
            return { ...session, files, updatedAt };
          }),
        );
      }
      const idx = history.length;
      if (edits.length) {
        const folder = root;
        const after: Snapshot = edits.map((e) => ({
          path: e.path,
          before: e.action === "write" ? (e.content ?? "") : null,
          action: e.action,
          ...(e.toPath ? { toPath: e.toPath } : {}),
        }));
        const restore = async (values: Snapshot, undone: boolean) => {
          for (const item of values) {
            if (undone) {
              if (item.action === "move" && item.toPath)
                await moveEntry(folder, item.toPath, item.path);
              else if (item.action === "mkdir") await removeEntry(folder, item.path);
              else if (item.before === null) await removeEntry(folder, item.path);
              else await writeFile(folder, item.path, item.before);
            } else if (item.action === "delete") await removeEntry(folder, item.path);
            else if (item.action === "mkdir") await createDir(folder, item.path);
            else if (item.action === "move" && item.toPath)
              await moveEntry(folder, item.path, item.toPath);
            else await writeFile(folder, item.path, item.before ?? "");
          }
          setTabs((current) => {
            let next = current.filter(
              (tab) => !values.some((item) => item.path === tab.path && item.action === "delete"),
            );
            for (const item of values) {
              if (item.action !== "write" || item.before === null) continue;
              const content = item.before;
              next = next.some((tab) => tab.path === item.path)
                ? next.map((tab) =>
                    tab.path === item.path
                      ? { ...tab, content, saved: content, showDiff: false }
                      : tab,
                  )
                : [...next, { path: item.path, content, saved: content }];
            }
            return next;
          });
          setActive(values.find((item) => item.action === "write")?.path ?? null);
          setMessages((current) =>
            current.map((message, i) => (i === idx ? { ...message, undone } : message)),
          );
          await refresh(folder);
        };
        record({ id: idx, undo: () => restore(snap, true), redo: () => restore(after, false) });
      }

      setTabs((ts) => {
        let next = ts.filter((t) => !edits.some((e) => e.action === "delete" && e.path === t.path));
        for (const e of edits) {
          if (e.action !== "write") continue;
          const before = snap.find((s) => s.path === e.path)?.before ?? "";
          const content = e.content ?? "";
          const existing = next.find((t) => t.path === e.path);
          next = existing
            ? next.map((t) =>
                t.path === e.path ? { ...t, content, saved: content, before, showDiff: true } : t,
              )
            : [...next, { path: e.path, content, saved: content, before, showDiff: true }];
        }
        return next;
      });
      const firstWrite = edits.find((e) => e.action === "write");
      if (firstWrite) setActive(firstWrite.path);
      if (edits.length > 0) {
        setLivePreview(null);
        setTransientKind(null);
        if (isMobile) setMobilePanel("editor");
      }
      for (const o of opens) await openFile(o.path).catch(() => {});
      setChanged(
        (c) =>
          new Set([
            ...c,
            ...edits.map((e) => (e.action === "move" ? (e.toPath ?? e.path) : e.path)),
          ]),
      );
      if (edits.length) await refresh();

      const limitReached = res.more === true && step + 1 >= MAX_AUTO_STEPS;
      const assistantMsg: ChatMsg = {
        role: "assistant",
        content: limitReached
          ? `${res.reply}\n\n(Llegué al límite de ${MAX_AUTO_STEPS} pasos automáticos; escribí "seguí" para continuar.)`
          : res.reply,
        edits: edits.map((e) => ({
          path: e.path,
          action: e.action,
          ...(e.toPath ? { toPath: e.toPath } : {}),
        })),
        provider: res.provider,
        team: res.team,
      };
      if (res.more === true && step + 1 < MAX_AUTO_STEPS) {
        // Sigue solo con el siguiente paso, informando lo que quedó aplicado.
        const applied = edits
          .map((e) =>
            e.action === "delete"
              ? `eliminé ${e.path}`
              : e.action === "mkdir"
                ? `creé la carpeta ${e.path}`
                : e.action === "move"
                  ? `moví ${e.path} a ${e.toPath}`
                  : `modifiqué ${e.path}`,
          )
          .join(", ");
        return await sendChat(
          `Paso ${step + 1} aplicado: ${applied || "sin cambios"}. Continuá con el siguiente paso del plan. Si ya no queda nada, respondé con "continuar": false.`,
          { attachments: [], projectPaths: [], ...(extras.mode ? { mode: extras.mode } : {}) },
          step + 1,
          [...history, assistantMsg],
        );
      }
      setMessages((m) => [...m, assistantMsg]);
    } catch (err) {
      setLivePreview(null);
      setTransientKind(null);
      if (stopRef.current) {
        setMessages((m) => [...m, { role: "assistant", content: "Detenido. No apliqué cambios." }]);
      } else {
        setApiStatus("offline");
        setRequestPhase("idle");
        setMessages((m) => [
          ...m,
          { role: "assistant", content: (err as Error).message, error: true },
        ]);
      }
      return false;
    } finally {
      if (requestControllerRef.current === requestController) requestControllerRef.current = null;
      agentActiveRef.current = false;
      const leftover = steerRef.current.splice(0).map((text) => ({
        id: uid(),
        text,
        extras: { attachments: [], projectPaths: [], mode: "edit" as const },
      }));
      const all = stopRef.current ? [] : [...leftover, ...queueRef.current];
      if (stopRef.current) setQueue([]);
      const next = all[0] ?? null;
      if (next) setQueue(all.slice(1));
      autoSendRef.current = next;
      setBusy(false);
      setRequestPhase("idle");
    }
    return true;
  };

  const [queued, setQueuedState] = useState<QueuedMessage[]>([]);
  const queueRef = useRef<QueuedMessage[]>([]);
  const setQueue = (next: QueuedMessage[]) => {
    queueRef.current = next;
    setQueuedState(next);
  };
  const steerRef = useRef<string[]>([]);
  const stopRef = useRef(false);
  const agentActiveRef = useRef(false);
  const autoSendRef = useRef<QueuedMessage | null>(null);
  const uid = () => `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const enqueueMessage = (text: string, extras: ChatExtras) => {
    setQueue([...queueRef.current, { id: uid(), text, extras }]);
  };

  const sendNow = (id: string) => {
    const item = queueRef.current.find((q) => q.id === id);
    if (!item) return;
    const rest = queueRef.current.filter((q) => q.id !== id);
    if (agentActiveRef.current) {
      // Se suma al trabajo del agente en el próximo paso.
      steerRef.current.push(item.text);
      setQueue(rest);
    } else {
      setQueue([item, ...rest]);
    }
  };

  const removeQueued = (id: string) => setQueue(queueRef.current.filter((q) => q.id !== id));

  const stopWork = () => {
    stopRef.current = true;
    requestControllerRef.current?.abort();
    steerRef.current = [];
    setQueue([]);
    for (const id of [...approvalWaiters.current.keys()]) resolveApproval(id, false);
  };

  // Al terminar un envío, si quedó algo en cola, se envía solo (con el estado ya actualizado).
  useEffect(() => {
    if (busy || !autoSendRef.current) return;
    const next = autoSendRef.current;
    autoSendRef.current = null;
    void sendChat(next.text, next.extras);
  }, [busy]);

  const editMessage = (index: number, _content: string) => {
    setMessages((current) => current.slice(0, index));
    setPreviewContext("");
    toast.info("Editá el mensaje y volvé a enviarlo");
  };

  const explorerVisible = isMobile ? mobilePanel === "explorer" : showExplorer;
  const chatVisible = isMobile ? mobilePanel === "chat" : showChat;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target instanceof Element ? e.target : null;
      const nativeText =
        target?.closest("input, textarea, [contenteditable=true]") &&
        !target?.closest(".monaco-editor");
      if (mod && !nativeText && ["z", "y"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
        void travel(e.shiftKey || e.key.toLowerCase() === "y");
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (root) setQuickOpen(true);
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (isMobile) setMobilePanel("explorer");
        else setShowExplorer((v) => !v);
      } else if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        if (isMobile) setMobilePanel("chat");
        else setShowChat((v) => !v);
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (active && !transientKind) save(active);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const activeTab = tabs.find((t) => t.path === active);
  const transient: TransientEditor | null =
    transientKind === "live" && livePreview
      ? { ...livePreview, kind: "live" }
      : transientKind === "scratch" && scratch
        ? {
            ...scratch,
            kind: "scratch",
            editable: !busy,
            onChange: (content) =>
              setScratch((current) => (current ? { ...current, content } : current)),
          }
        : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Title bar */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b bg-panel-deep px-2 text-xs sm:gap-3 sm:px-3">
        <Flame className="h-4 w-4 text-ember" />
        <span className="font-semibold tracking-wide">Forja</span>
        <button
          onClick={openFolder}
          disabled={applyingScratch}
          className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground sm:px-2"
        >
          <span className="hidden lg:inline">Abrir carpeta</span>
          <FolderOpen className="h-3.5 w-3.5 lg:hidden" />
        </button>
        <button
          onClick={() => root && setQuickOpen(true)}
          className="mx-auto flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded border bg-background px-2 py-0.5 text-muted-foreground hover:border-ember sm:w-80 sm:flex-none"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{root ? root.name : "Forja"}</span>
          <span className="ml-auto hidden font-mono sm:inline">Ctrl+P</span>
        </button>
        {isDesktopBridge() ? (
          <span
            className="flex shrink-0 items-center rounded px-1.5 py-0.5 text-ember sm:px-2"
            title="Agente local integrado en Forja"
          >
            <Terminal className="h-3.5 w-3.5" />
            <span className="ml-1 hidden xl:inline">Local: on</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => (agentLinked ? disconnectAgent() : void connectAgent())}
            title={
              agentLinked
                ? "Agente local conectado: la IA puede leer y cambiar tu carpeta. Clic para desconectar."
                : "Conectar el agente local de tu PC"
            }
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 hover:bg-accent sm:px-2",
              agentLinked ? "text-ember" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span className="ml-1 hidden xl:inline">{agentLinked ? "Agente: on" : "Agente"}</span>
          </button>
        )}
        {!isDesktopBridge() && !agentLinked && (
          <button
            type="button"
            onClick={downloadAgentLauncher}
            title="Descargar lanzador del agente: inicia la conexión automáticamente"
            className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground sm:px-2"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="ml-1 hidden xl:inline">Lanzador</span>
          </button>
        )}
        {!isDesktopBridge() && (
          <button
            type="button"
            onClick={installDesktop}
            disabled={!DESKTOP_INSTALLER_URL}
            title={
              DESKTOP_INSTALLER_URL
                ? "Descargar Forja para escritorio"
                : "El instalador de escritorio estará disponible próximamente"
            }
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 sm:px-2",
              DESKTOP_INSTALLER_URL
                ? "text-ember hover:bg-accent"
                : "cursor-not-allowed text-muted-foreground/50",
            )}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="ml-1 hidden xl:inline">Escritorio</span>
          </button>
        )}
        <span className="hidden w-24 lg:inline-block" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-panel-deep py-2">
          {[
            {
              icon: Files,
              on: showExplorer,
              fn: () => (isMobile ? setMobilePanel("explorer") : setShowExplorer((v) => !v)),
              title: "Explorador (Ctrl+B)",
            },
            {
              icon: Search,
              on: false,
              fn: () => root && (isMobile ? setMobilePanel("editor") : setQuickOpen(true)),
              title: "Buscar archivo (Ctrl+P)",
            },
            {
              icon: Sparkles,
              on: showChat,
              fn: () => (isMobile ? setMobilePanel("chat") : setShowChat((v) => !v)),
              title: "Chat IA (Ctrl+L)",
            },
          ].map(({ icon: Icon, on, fn, title }) => (
            <button
              key={title}
              title={title}
              onClick={fn}
              className={cn(
                "flex h-10 w-full items-center justify-center border-l-2 border-transparent text-muted-foreground hover:text-foreground",
                on && "border-ember text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>

        {explorerVisible && (
          <>
            <div
              style={isMobile ? undefined : { width: leftW }}
              className="min-w-0 flex-1 border-r"
            >
              {root ? (
                <Explorer
                  rootName={root.name}
                  tree={tree}
                  activePath={active}
                  changed={changed}
                  onOpen={openFile}
                  onNewFile={(d) => newEntry(d, "file")}
                  onNewFolder={(d) => newEntry(d, "folder")}
                  onDelete={del}
                  onRefresh={() => refresh()}
                />
              ) : (
                <div className="flex h-full flex-col gap-3 bg-panel p-4 text-[13px]">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Explorador
                  </div>
                  <p className="text-muted-foreground">No hay ninguna carpeta abierta.</p>
                  <button
                    onClick={openFolder}
                    className="flex items-center justify-center gap-2 rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90"
                  >
                    <FolderOpen className="h-4 w-4" /> Abrir carpeta
                  </button>
                  {recent.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Proyectos recientes
                      </div>
                      {recent.map((item) => (
                        <div key={item.id} className="group flex items-center gap-1">
                          <button
                            onClick={() => void openRecent(item)}
                            className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left hover:bg-accent"
                            title={item.name}
                          >
                            <FolderOpen className="mr-1 inline h-3.5 w-3.5 text-ember" />
                            {item.name}
                          </button>
                          <button
                            onClick={() => {
                              void forgetProject(item.id).then(() => listRecent().then(setRecent));
                            }}
                            className="rounded px-1.5 py-1 text-xs text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                            title="Quitar de recientes"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!isSupported() && (
                    <p className="text-xs text-destructive">
                      Tu navegador no permite abrir carpetas locales. Usá Chrome, Edge u Opera en
                      computadora.
                    </p>
                  )}
                </div>
              )}
            </div>
            {!isMobile && (
              <div
                onMouseDown={dragLeft}
                className="w-1 shrink-0 cursor-col-resize hover:bg-ember"
              />
            )}
          </>
        )}

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            isMobile && mobilePanel !== "editor" && "hidden",
          )}
        >
          <div className="flex h-9 shrink-0 items-center justify-end gap-1 overflow-x-auto border-b bg-panel-deep px-2">
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={
                !activeTab || Boolean(transient) || busy || activeTab.content === activeTab.saved
              }
              title="Guardar archivo (Ctrl+S)"
              onClick={() =>
                active &&
                void save(active).catch(() => toast.error("No se pudo guardar el archivo"))
              }
            >
              <Save /> <span className="hidden lg:inline">Guardar</span>
            </Button>
            {scratch && !transient && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                aria-label="Abrir borrador temporal"
                title="Abrir borrador temporal"
                onClick={() => {
                  setTransientKind("scratch");
                  setView("code");
                }}
              >
                <Code2 /> <span className="hidden lg:inline">Borrador</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Deshacer"
              title="Deshacer (Ctrl+Z)"
              disabled={busy || !editHistory.current.canUndo}
              onClick={() => void travel()}
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Rehacer"
              title="Rehacer (Ctrl+Shift+Z)"
              disabled={busy || !editHistory.current.canRedo}
              onClick={() => void travel(true)}
            >
              <Redo2 />
            </Button>
            <Button
              variant={view === "code" ? "secondary" : "ghost"}
              size="sm"
              className="shrink-0"
              aria-pressed={view === "code"}
              onClick={() => setView("code")}
            >
              <Code2 /> <span className="hidden lg:inline">Código</span>
            </Button>
            <Button
              variant={view === "preview" ? "secondary" : "ghost"}
              size="sm"
              className="shrink-0"
              aria-pressed={view === "preview"}
              onClick={() => setView("preview")}
            >
              <Globe /> <span className="hidden lg:inline">Vista previa</span>
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <div className={cn("h-full", view !== "preview" && "hidden")}>
              <PreviewPane
                key={root?.name ?? "empty"}
                root={root}
                files={files}
                tabs={tabs}
                active={active}
                onChange={changeText}
                onRecord={record}
                onUndo={() => void travel()}
                onRedo={() => void travel(true)}
                canUndo={editHistory.current.canUndo && !busy}
                canRedo={editHistory.current.canRedo && !busy}
                onContext={(context) => {
                  setPreviewContext(context);
                  if (isMobile) setMobilePanel("chat");
                  else setShowChat(true);
                }}
              />
            </div>
            <div className={cn("h-full", view !== "code" && "hidden")}>
              <EditorPane
                tabs={tabs}
                transient={transient}
                active={active}
                reveal={reveal}
                onSelect={(path) => {
                  setTransientKind(null);
                  setActive(path);
                }}
                onClose={closeTab}
                onChange={changeText}
                onSave={save}
                onToggleDiff={(p) =>
                  setTabs((ts) =>
                    ts.map((t) => (t.path === p ? { ...t, showDiff: !t.showDiff } : t)),
                  )
                }
                {...(!busy && !applyingScratch && approvalWaiters.current.size === 0
                  ? { onApplyTransient: applyScratch }
                  : {})}
                onCloseTransient={() => setTransientKind(null)}
              />
            </div>
          </div>
        </div>

        {chatVisible && (
          <>
            <div
              onMouseDown={dragRight}
              className={cn("w-1 shrink-0 cursor-col-resize hover:bg-ember", isMobile && "hidden")}
            />
            <div
              style={isMobile ? undefined : { width: rightW }}
              className={cn("min-w-0 flex-1 border-l", !isMobile && "shrink-0")}
            >
              <ChatPanel
                messages={messages}
                busy={busy}
                disabled={!root}
                onSend={sendChat}
                projectName={root?.name}
                projectFiles={files}
                onOpenFile={openAt}
                onUndo={(index) => void travel(false, index)}
                previewContext={previewContext}
                onClearContext={() => setPreviewContext("")}
                onEditMessage={editMessage}
                onApproval={resolveApproval}
                queued={queued}
                onQueue={enqueueMessage}
                onSendNow={sendNow}
                onRemoveQueued={removeQueued}
                onStop={stopWork}
                apiStatus={apiStatus}
                apiProviders={apiProviders}
                agentLinked={agentLinked}
                requestPhase={requestPhase}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onNewChat={newChat}
                onSelectChat={selectChat}
                autonomy={autonomy}
                onAutonomyChange={(next) => {
                  setAutonomy(next);
                  saveAutonomyMode(window.localStorage, next);
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Status bar */}
      <div className="flex h-6 shrink-0 items-center gap-4 bg-primary px-3 font-mono text-[11px] text-primary-foreground">
        <span>⚒ {root ? root.name : "sin carpeta"}</span>
        <span>{files.length} archivos</span>
        {changed.size > 0 && <span>{changed.size} modificados por IA</span>}
        <span className="ml-auto">{lastProvider && `IA: ${lastProvider}`}</span>
        {activeTab && <span>{languageOf(activeTab.path)}</span>}
        {activeTab && activeTab.content !== activeTab.saved && <span>● sin guardar</span>}
      </div>

      <CommandDialog open={quickOpen} onOpenChange={setQuickOpen}>
        <CommandInput placeholder="Buscar archivo por nombre…" />
        <CommandList>
          <CommandEmpty>Sin resultados</CommandEmpty>
          {files.slice(0, 2000).map((f) => (
            <CommandItem
              key={f}
              value={f}
              onSelect={() => {
                setQuickOpen(false);
                openFile(f);
              }}
              className="font-mono text-xs"
            >
              {f}
            </CommandItem>
          ))}
        </CommandList>
      </CommandDialog>
    </div>
  );
}
