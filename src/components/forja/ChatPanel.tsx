import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileCode, Sparkles, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  edits?: { path: string; action: "write" | "delete" }[];
  provider?: string;
  error?: boolean;
  undone?: boolean;
}

interface Props {
  messages: ChatMsg[];
  busy: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
  onOpenFile: (p: string) => void;
  onUndo: (index: number) => void;
  previewContext?: string;
  onClearContext?: () => void;
}

export function ChatPanel({ messages, busy, disabled, onSend, onOpenFile, onUndo, previewContext, onClearContext }: Props) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = () => {
    const t = text.trim();
    if (!t || busy || disabled) return;
    onSend(t);
    setText("");
  };

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-ember" /> Forja IA
      </div>
      <div className="flex-1 space-y-4 overflow-auto px-3 py-2 text-[13px]">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-muted-foreground">
            <p className="mb-2 text-foreground">Pedile cambios en lenguaje natural.</p>
            <p className="text-xs">La IA ve el archivo activo, las pestañas abiertas y los archivos que menciones por ruta.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("rounded-md p-2.5", m.role === "user" ? "bg-accent" : "bg-panel-deep", m.error && "text-destructive")}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {m.role === "user" ? "Vos" : `Forja${m.provider ? ` · ${m.provider}` : ""}`}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
            {m.edits && m.edits.length > 0 && (
              <div className="mt-2 space-y-1 border-t pt-2">
                {m.edits.map((e) => (
                  <button
                    key={e.path}
                    onClick={() => e.action === "write" && onOpenFile(e.path)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-accent"
                  >
                    <FileCode className={cn("h-3.5 w-3.5", e.action === "delete" ? "text-destructive" : "text-added")} />
                    <span className={cn(e.action === "delete" && "line-through")}>{e.path}</span>
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
            <span className="h-2 w-2 rounded-full bg-ember animate-forge" /> Forjando cambios…
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="p-3">
        {previewContext && <div className="mb-2 flex items-start gap-2 rounded border bg-panel-deep p-2 text-xs">
          <div className="min-w-0 flex-1"><span className="text-ember">Selección de vista previa</span><p className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-muted-foreground">{previewContext}</p></div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Quitar contexto de vista previa" onClick={onClearContext}><X /></Button>
        </div>}
        <div className="rounded-md border bg-background focus-within:ember-glow">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={disabled}
            rows={3}
            placeholder={disabled ? "Abrí una carpeta primero" : "Ej: agregá validación al formulario en src/App.tsx"}
            className="w-full resize-none bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <div className="flex justify-end px-2 pb-2">
            <button
              onClick={send}
              disabled={busy || disabled || !text.trim()}
              className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
