import Editor, { DiffEditor, type Monaco } from "@monaco-editor/react";
import { useRef } from "react";
import { GitCompare, X } from "lucide-react";
import { languageOf } from "@/lib/fs";
import { cn } from "@/lib/utils";

export interface Tab {
  path: string;
  content: string;
  saved: string;
  /** Content before the last AI edit, used for the diff view. */
  before?: string | undefined;
  showDiff?: boolean;
}

interface Props {
  tabs: Tab[];
  active: string | null;
  onSelect: (p: string) => void;
  onClose: (p: string) => void;
  onChange: (p: string, v: string) => void;
  onSave: (p: string) => void;
  onToggleDiff: (p: string) => void;
}

function defineTheme(monaco: Monaco) {
  // Monaco requires hex colors in its own theme definition.
  monaco.editor.defineTheme("forja", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7d7469", fontStyle: "italic" },
      { token: "keyword", foreground: "f08a3c" },
      { token: "string", foreground: "a8c97f" },
      { token: "number", foreground: "e6b450" },
      { token: "type", foreground: "6fc3c7" },
    ],
    colors: {
      "editor.background": "#1d1a17",
      "editor.foreground": "#e6dfd3",
      "editorLineNumber.foreground": "#5a534b",
      "editorLineNumber.activeForeground": "#f08a3c",
      "editor.selectionBackground": "#f08a3c33",
      "editor.lineHighlightBackground": "#26221e",
      "editorCursor.foreground": "#f08a3c",
      "editorIndentGuide.background1": "#2c2824",
    },
  });
}

const OPTIONS = {
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 13.5,
  fontLigatures: true,
  minimap: { enabled: true },
  smoothScrolling: true,
  cursorSmoothCaretAnimation: "on" as const,
  bracketPairColorization: { enabled: true },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  padding: { top: 8 },
};

export function EditorPane({ tabs, active, onSelect, onClose, onChange, onSave, onToggleDiff }: Props) {
  const tab = tabs.find((t) => t.path === active);
  const activeRef = useRef(active);
  activeRef.current = active;
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 overflow-x-auto bg-panel-deep">
        {tabs.map((t) => {
          const dirty = t.content !== t.saved;
          return (
            <div
              key={t.path}
              onClick={() => onSelect(t.path)}
              onMouseDown={(e) => e.button === 1 && onClose(t.path)}
              className={cn(
                "group flex shrink-0 cursor-pointer items-center gap-2 border-r px-3 text-[13px] text-muted-foreground",
                t.path === active && "border-t-2 border-t-ember bg-tab-active text-foreground",
              )}
            >
              <span className={cn(t.before !== undefined && "text-added")}>{t.path.split("/").pop()}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.path);
                }}
                className="flex h-4 w-4 items-center justify-center rounded hover:bg-accent"
              >
                {dirty ? <span className="h-2 w-2 rounded-full bg-foreground group-hover:hidden" /> : null}
                <X className={cn("h-3.5 w-3.5", dirty && "hidden group-hover:block")} />
              </button>
            </div>
          );
        })}
      </div>
      {tab ? (
        <>
          <div className="flex h-7 shrink-0 items-center justify-between px-4 font-mono text-xs text-muted-foreground">
            <span>{tab.path.split("/").join(" › ")}</span>
            {tab.before !== undefined && (
              <button
                onClick={() => onToggleDiff(tab.path)}
                className={cn("flex items-center gap-1 rounded px-2 py-0.5 hover:bg-accent", tab.showDiff && "text-ember")}
              >
                <GitCompare className="h-3.5 w-3.5" /> {tab.showDiff ? "Cerrar diff" : "Ver cambios de la IA"}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1">
            {tab.showDiff && tab.before !== undefined ? (
              <DiffEditor
                key={`diff-${tab.path}`}
                theme="forja"
                beforeMount={defineTheme}
                original={tab.before}
                modified={tab.content}
                language={languageOf(tab.path)}
                options={{ ...OPTIONS, readOnly: true, renderSideBySide: true }}
              />
            ) : (
              <Editor
                path={tab.path}
                theme="forja"
                beforeMount={defineTheme}
                value={tab.content}
                language={languageOf(tab.path)}
                options={OPTIONS}
                onChange={(v) => onChange(tab.path, v ?? "")}
                onMount={(editor, monaco) => {
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => activeRef.current && saveRef.current(activeRef.current));
                }}
              />
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <div className="font-mono text-6xl font-bold text-accent">⚒</div>
          <div className="text-sm">Abrí un archivo o pedile algo a la IA</div>
          <div className="font-mono text-xs">Ctrl+P buscar archivo · Ctrl+S guardar</div>
        </div>
      )}
    </div>
  );
}
