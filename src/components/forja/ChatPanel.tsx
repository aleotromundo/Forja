import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  FileCode,
  Sparkles,
  Undo2,
  X,
  Mic,
  Square,
  Paperclip,
  FolderOpen,
  Search,
  MessagesSquare,
  Plus,
  Pencil,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { isTextFile } from "@/lib/fs";
import type { ChatAttachment, ChatExtras } from "@/lib/chat-context";
import { useDictation } from "./useDictation";
import type { ChatMode } from "@/lib/agents";
import type { ChatSession } from "@/lib/chat-persistence";

/** Matches "ruta/archivo.ext" or "ruta/archivo.ext:linea" inside a message. */
const CODE_REF = /([\w@./-]+\.[A-Za-z0-9]+)(?::(\d+))?/g;

/** Renders assistant text, turning references to known project files into clickable links. */
function MessageText({
  text,
  files,
  onOpen,
}: {
  text: string;
  files: string[];
  onOpen: (path: string, line?: number) => void;
}) {
  const known = new Set(files);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(CODE_REF)) {
    const whole = match[0];
    const path = match[1] ?? "";
    const lineText = match[2];
    if (!known.has(path)) continue;
    const index = match.index ?? 0;
    const line = lineText ? Number(lineText) : undefined;
    parts.push(text.slice(last, index));
    parts.push(
      <button
        key={index}
        type="button"
        onClick={() => onOpen(path, line)}
        title={`Abrir ${path}${line ? `, línea ${line}` : ""}`}
        className="rounded px-0.5 font-mono text-[12px] text-ember underline decoration-dotted underline-offset-2 hover:bg-accent"
      >
        {whole}
      </button>,
    );
    last = index + whole.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  edits?: { path: string; action: "write" | "delete" | "mkdir" | "move"; toPath?: string }[];
  provider?: string;
  team?: string[];
  error?: boolean;
  undone?: boolean;
}

interface Props {
  messages: ChatMsg[];
  busy: boolean;
  disabled: boolean;
  onSend: (text: string, extras: ChatExtras) => Promise<boolean>;
  projectFiles: string[];
  projectName?: string | undefined;
  onOpenFile: (p: string, line?: number) => void;
  onUndo: (index: number) => void;
  previewContext?: string;
  onClearContext?: () => void;
  onEditMessage: (index: number, content: string) => void;
  apiStatus: "connecting" | "connected" | "offline";
  apiProviders: string[];
  requestPhase: "idle" | "preparing" | "consulting" | "applying";
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
}

function relativeDate(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "hace unos segundos";
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)} d`;
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

// Frases que indican que el usuario quiere empezar a aplicar lo planeado.
const APPLY_INTENT =
  /\b(dale|hacelo|hagámoslo|hagamoslo|empecemos|empez[aá]|manos a la obra|aplic[aá]|implement[aá]|adelante|ejecut[aá])(?![\wáéíóúñ])/i;
const APPLY_TEXT = "Aplicá lo que acordamos hasta ahora.";

export function ChatPanel({
  messages,
  busy,
  disabled,
  onSend,
  onOpenFile,
  onUndo,
  previewContext,
  onClearContext,
  projectFiles,
  projectName,
  onEditMessage,
  apiStatus,
  apiProviders,
  requestPhase,
  sessions,
  activeSessionId,
  onNewChat,
  onSelectChat,
}: Props) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [projectPaths, setProjectPaths] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState(false);
  const [mode, setMode] = useState<ChatMode>("plan");
  const [applyBanner, setApplyBanner] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const lastModeRef = useRef<ChatMode | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  // Al terminar la respuesta, el cuadro de texto vuelve a estar listo para escribir.
  useEffect(() => {
    if (!busy) composer.current?.focus();
  }, [busy]);

  const dictation = useDictation((words) =>
    setText((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${words}`),
  );
  useEffect(() => {
    setAttachments([]);
    setProjectPaths([]);
  }, [projectName]);
  const attach = async (files: FileList | null) => {
    if (!files) return;
    setReading(true);
    try {
      const added: ChatAttachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 480_000) {
          toast.error(`${file.name} es demasiado grande para el contexto del chat.`);
          continue;
        }
        if (
          !isTextFile(file.name) ||
          (file.type && !file.type.startsWith("text/") && !/json|javascript|xml/.test(file.type))
        ) {
          toast.error(`${file.name}: por ahora podés adjuntar texto y código, no imágenes ni PDF.`);
          continue;
        }
        const content = await file.text();
        if (content.includes("\0")) {
          toast.error(`${file.name} no es un archivo de texto.`);
          continue;
        }
        added.push({ path: file.name, content });
      }
      setAttachments((current) => {
        const next = [...current, ...added];
        if (
          next.length > 40 ||
          next.reduce((sum, file) => sum + file.content.length, 0) > 120_000
        ) {
          toast.error(
            "Los adjuntos superan el espacio del chat. Quitá alguno antes de agregar más.",
          );
          return current;
        }
        return next;
      });
    } catch {
      toast.error("No se pudo leer el archivo adjunto.");
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  };
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy || disabled || reading) return;
    // Venía de Planear y ahora pide empezar: pedimos confirmación antes de tocar archivos.
    if (mode === "edit" && lastModeRef.current === "plan" && APPLY_INTENT.test(t)) {
      setConfirmApply(true);
      return;
    }
    dictation.stop();
    const sentMode = mode;
    const sent = await onSend(t, { attachments, projectPaths, mode });
    if (sent) {
      lastModeRef.current = sentMode;
      setText("");
      setAttachments([]);
      setProjectPaths([]);
      setApplyBanner(sentMode === "plan" && APPLY_INTENT.test(t));
    }
  };

  // Aplica el plan acordado en Modificar, sin que el usuario tenga que repetirlo.
  const runApply = async () => {
    setConfirmApply(false);
    setApplyBanner(false);
    setText("");
    dictation.stop();
    setMode("edit");
    const sent = await onSend(APPLY_TEXT, { attachments: [], projectPaths: [], mode: "edit" });
    if (sent) lastModeRef.current = "edit";
  };

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(
        () => setCopiedIndex((current) => (current === index ? null : current)),
        1600,
      );
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo copiar el mensaje");
    }
  };

  const apiLabel =
    apiStatus === "connected"
      ? `Conectado${apiProviders.length ? ` · ${apiProviders.join(", ")}` : ""}`
      : apiStatus === "connecting"
        ? "Conectando"
        : "Sin conexión";
  const apiDot =
    apiStatus === "connected"
      ? "bg-emerald-400"
      : apiStatus === "connecting"
        ? "bg-amber-400 animate-forge"
        : "bg-red-400";

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 min-w-0 items-center gap-2 overflow-hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-ember" />
        <span className="min-w-0 truncate">Forja IA</span>
        <span
          role="status"
          title={apiLabel}
          className="ml-1 inline-flex shrink-0 items-center gap-1 normal-case tracking-normal text-[10px] font-normal text-muted-foreground"
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", apiDot)} />
          {apiStatus === "connected"
            ? "Conectado"
            : apiStatus === "connecting"
              ? "Conectando"
              : "Sin conexión"}
        </span>
        <div
          role="radiogroup"
          aria-label="Modo del chat"
          className="ml-auto flex shrink-0 rounded-md border p-0.5 normal-case tracking-normal"
        >
          {(["plan", "edit"] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              title={
                m === "plan"
                  ? "Conversar ideas sin tocar archivos"
                  : "La IA puede modificar archivos"
              }
              className={cn(
                "rounded px-2 py-0.5 text-[11px]",
                mode === m
                  ? "bg-ember text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "plan" ? "Planear" : "Modificar"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1 border-b px-2 py-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 flex-1 justify-start gap-1.5 px-1.5 text-xs"
              title="Cambiar sesión"
            >
              <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-ember" />
              <span className="truncate">
                {sessions.find((session) => session.id === activeSessionId)?.title ??
                  "Nueva sesión"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 max-w-[calc(100vw-24px)] p-1">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sesiones de {projectName ?? "este proyecto"}
            </div>
            <div className="max-h-72 overflow-auto">
              {[...sessions]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .map((session) => {
                  const fileEntries = Object.entries(session.files).sort((a, b) =>
                    b[1].updatedAt.localeCompare(a[1].updatedAt),
                  );
                  const added = fileEntries.reduce((sum, [, file]) => sum + file.added, 0);
                  const removed = fileEntries.reduce((sum, [, file]) => sum + file.removed, 0);
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelectChat(session.id)}
                      className={cn(
                        "flex w-full min-w-0 flex-col items-start rounded px-2 py-2 text-left hover:bg-accent",
                        session.id === activeSessionId && "bg-accent/60",
                      )}
                    >
                      <span className="w-full truncate text-xs font-medium">{session.title}</span>
                      <span className="mt-1 flex w-full items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{relativeDate(session.updatedAt)}</span>
                        {fileEntries.length > 0 && <span>{fileEntries.length} archivos</span>}
                        {added > 0 && <span className="text-added">+{added}</span>}
                        {removed > 0 && <span className="text-destructive">−{removed}</span>}
                      </span>
                      {fileEntries.length > 0 && (
                        <span className="mt-1 w-full truncate font-mono text-[10px] text-muted-foreground">
                          {fileEntries
                            .slice(0, 3)
                            .map(([path, file]) => `${path} (+${file.added}/−${file.removed})`)
                            .join(" · ")}
                          {fileEntries.length > 3 && " · …"}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Nuevo chat"
          title="Iniciar un nuevo chat"
          onClick={onNewChat}
        >
          <Plus />
        </Button>
        {activeSessionId && (
          <span className="hidden shrink-0 items-center gap-1 text-[10px] sm:flex">
            {(() => {
              const files = Object.values(
                sessions.find((s) => s.id === activeSessionId)?.files ?? {},
              );
              const added = files.reduce((sum, file) => sum + file.added, 0);
              const removed = files.reduce((sum, file) => sum + file.removed, 0);
              return (
                <>
                  {added > 0 && <span className="text-added">+{added}</span>}
                  {removed > 0 && <span className="text-destructive">−{removed}</span>}
                  {files.length > 0 && (
                    <span className="text-muted-foreground">· {files.length} arch.</span>
                  )}
                </>
              );
            })()}
          </span>
        )}
      </div>
      <div className="flex-1 space-y-4 overflow-auto px-3 py-2 text-[13px]">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-muted-foreground">
            <p className="mb-2 text-foreground">Pedile cambios en lenguaje natural.</p>
            <p className="text-xs">
              La IA ve el archivo activo, las pestañas abiertas y los archivos que menciones por
              ruta.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "rounded-md p-2.5",
              m.role === "user" ? "bg-accent" : "bg-panel-deep",
              m.error && "text-destructive",
            )}
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {m.role === "user" ? "Vos" : `Forja${m.provider ? ` · ${m.provider}` : ""}`}
            </div>
            {m.team && m.team.length > 0 && (
              <div className="mb-1 text-[10px] text-muted-foreground">
                Equipo: {m.team.join(" · ")}
              </div>
            )}
            <div className="whitespace-pre-wrap leading-relaxed">
              {m.role === "assistant" ? (
                <MessageText text={m.content} files={projectFiles} onOpen={onOpenFile} />
              ) : (
                m.content
              )}
            </div>
            <div className="mt-2 flex items-center gap-1 opacity-60 transition-opacity hover:opacity-100">
              {m.role === "user" && (
                <button
                  type="button"
                  onClick={() => {
                    setText(m.content);
                    onEditMessage(i, m.content);
                    input.current?.focus();
                  }}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  title="Editar y volver a enviar"
                >
                  <Pencil className="h-3 w-3" /> Editar
                </button>
              )}
              <button
                type="button"
                onClick={() => void copyMessage(m.content, i)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Copiar mensaje"
              >
                {copiedIndex === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedIndex === i ? "Copiado" : "Copiar"}
              </button>
            </div>
            {m.edits && m.edits.length > 0 && (
              <div className="mt-2 space-y-1 border-t pt-2">
                {m.edits.map((e) => (
                  <button
                    key={e.path}
                    onClick={() => e.action === "write" && onOpenFile(e.path)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-accent"
                  >
                    <FileCode
                      className={cn(
                        "h-3.5 w-3.5",
                        e.action === "delete" ? "text-destructive" : "text-added",
                      )}
                    />
                    <span className={cn(e.action === "delete" && "line-through")}>
                      {e.action === "mkdir"
                        ? "Crear carpeta "
                        : e.action === "move"
                          ? "Mover "
                          : e.action === "delete"
                            ? "Eliminar "
                            : "Modificar "}
                      {e.path}
                      {e.action === "move" && e.toPath ? ` → ${e.toPath}` : ""}
                    </span>
                  </button>
                ))}
                <button
                  disabled={m.undone}
                  onClick={() => onUndo(i)}
                  className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  <Undo2 className="h-3 w-3" /> {m.undone ? "Deshecho" : "Deshacer cambios"}
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-ember animate-forge" />{" "}
            <span>
              {requestPhase === "preparing"
                ? "Preparando contexto…"
                : requestPhase === "consulting"
                  ? "Consultando proveedores…"
                  : requestPhase === "applying"
                    ? "Procesando respuesta…"
                    : mode === "plan"
                      ? "El equipo está pensando…"
                      : "El equipo está forjando cambios…"}
              {elapsed > 0 && ` ${elapsed}s`}
              {elapsed >= 12 && requestPhase === "consulting" && (
                <span className="text-xs"> · puede estar probando otra API</span>
              )}
            </span>
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="p-3">
        <input
          ref={input}
          type="file"
          multiple
          aria-label="Adjuntar archivos al chat"
          className="hidden"
          onChange={(event) => void attach(event.target.files)}
        />
        {(attachments.length > 0 || projectPaths.length > 0) && (
          <div className="mb-2 max-h-32 space-y-1 overflow-auto">
            {attachments.map((file, index) => (
              <div key={index} className="flex min-w-0 items-center gap-2 border-b py-1 text-xs">
                <Paperclip className="h-3 w-3 shrink-0 text-ember" />
                <span className="min-w-0 flex-1 truncate" title={file.path}>
                  {file.path}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={`Quitar adjunto ${file.path}`}
                  disabled={busy}
                  onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                >
                  <X />
                </Button>
              </div>
            ))}
            {projectPaths.map((path) => (
              <div key={path} className="flex min-w-0 items-center gap-2 border-b py-1 text-xs">
                <FileCode className="h-3 w-3 shrink-0 text-ember" />
                <span className="min-w-0 flex-1 truncate" title={path}>
                  {path}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={`Quitar contexto ${path}`}
                  disabled={busy}
                  onClick={() =>
                    setProjectPaths((current) => current.filter((item) => item !== path))
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
        {applyBanner && !busy && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-ember/40 bg-panel-deep p-2 text-xs">
            <span className="min-w-0 flex-1 text-muted-foreground">
              Para empezar a hacer los cambios, cambiá a Modificar.
            </span>
            <Button size="sm" onClick={() => void runApply()}>
              Cambiar a Modificar y aplicar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setApplyBanner(false)}>
              Seguir planeando
            </Button>
          </div>
        )}
        {confirmApply && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-ember/40 bg-panel-deep p-2 text-xs">
            <span className="min-w-0 flex-1 text-muted-foreground">
              ¿Empezamos a aplicar el plan acordado?
            </span>
            <Button size="sm" onClick={() => void runApply()}>
              Sí, aplicar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmApply(false);
                setText("");
                setMode("plan");
              }}
            >
              Seguir planeando
            </Button>
          </div>
        )}
        {previewContext && (
          <div className="mb-2 flex items-start gap-2 rounded border bg-panel-deep p-2 text-xs">
            <div className="min-w-0 flex-1">
              <span className="text-ember">Selección de vista previa</span>
              <p className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-muted-foreground">
                {previewContext}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label="Quitar contexto de vista previa"
              onClick={onClearContext}
            >
              <X />
            </Button>
          </div>
        )}
        <div className="rounded-md border bg-background focus-within:ember-glow">
          <textarea
            ref={composer}
            aria-label="Mensaje a Forja"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={disabled || busy}
            rows={3}
            placeholder={
              disabled
                ? "Abrí una carpeta primero"
                : mode === "plan"
                  ? "Planeá con el equipo: contale tu idea (no toca archivos)"
                  : 'El equipo puede modificar archivos: pedí cambios o "aplicá lo planeado"'
            }
            className="w-full resize-none bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Adjuntar archivos"
              title="Adjuntar texto o código; se envía a la IA con tu mensaje"
              disabled={busy || disabled || reading}
              onClick={() => input.current?.click()}
            >
              <Paperclip />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Proyecto"
                  title="Archivos del proyecto"
                  disabled={busy || disabled}
                >
                  <FolderOpen />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-72 max-w-[calc(100vw-24px)] p-2"
              >
                <div className="mb-2 truncate px-1 text-xs font-semibold">
                  {projectName ?? "Proyecto"}
                </div>
                <div className="mb-2 flex items-center gap-2 border-b px-1">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    aria-label="Buscar archivos del proyecto"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar archivo…"
                    className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none"
                  />
                </div>
                <div className="max-h-64 overflow-auto">
                  {projectFiles
                    .filter(
                      (path) =>
                        isTextFile(path) && path.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((path) => (
                      <label
                        key={path}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-xs hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={projectPaths.includes(path)}
                          onChange={(event) =>
                            setProjectPaths((current) =>
                              event.target.checked
                                ? [...current, path]
                                : current.filter((item) => item !== path),
                            )
                          }
                        />
                        <span className="min-w-0 truncate" title={path}>
                          {path}
                        </span>
                      </label>
                    ))}
                  {!projectFiles.some(
                    (path) => isTextFile(path) && path.toLowerCase().includes(search.toLowerCase()),
                  ) && <p className="p-2 text-xs text-muted-foreground">Sin archivos</p>}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant={dictation.listening ? "secondary" : "ghost"}
              size="icon"
              className={cn("h-7 w-7 shrink-0", dictation.listening && "text-destructive")}
              aria-label={dictation.listening ? "Detener dictado" : "Micrófono"}
              aria-pressed={dictation.listening}
              title={
                dictation.supported
                  ? "Dictar con el servicio de voz del navegador"
                  : "Dictado no disponible en este navegador"
              }
              disabled={busy || disabled}
              onClick={dictation.toggle}
            >
              {dictation.listening ? <Square /> : <Mic />}
            </Button>
            <span
              role="status"
              className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
            >
              {dictation.listening ? "Escuchando…" : reading ? "Leyendo archivos…" : ""}
            </span>
            <Button
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Enviar mensaje"
              title="Enviar mensaje"
              onClick={() => void send()}
              disabled={busy || disabled || reading || !text.trim()}
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
