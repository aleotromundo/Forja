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
import { askForja } from "@/lib/ai.functions";
import {
  createDir,
  flatten,
  isSupported,
  isTextFile,
  languageOf,
  pickFolder,
  readFile,
  readTree,
  removeEntry,
  writeFile,
  type FileNode,
} from "@/lib/fs";
import { cn } from "@/lib/utils";
import { isSafeRelativePath } from "@/lib/paths";
import { ChatPanel, type ChatMsg } from "./ChatPanel";
import { EditorPane, type RevealRequest, type Tab } from "./EditorPane";
import { Explorer } from "./Explorer";
import { PreviewPane } from "./PreviewPane";
import { Button } from "@/components/ui/button";
import { EditHistory, type HistoryEntry } from "@/lib/edit-history";
import { collectChatContext, type ChatExtras } from "@/lib/chat-context";

type Snapshot = { path: string; before: string | null }[];

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

export function Workbench() {
  const ask = useServerFn(askForja);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [lastProvider, setLastProvider] = useState<string>("");
  const [showExplorer, setShowExplorer] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const [view, setView] = useState<"code" | "preview">("code");
  const [previewContext, setPreviewContext] = useState("");
  const editHistory = useRef(new EditHistory());
  const [, updateHistory] = useState(0);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
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

  const refresh = useCallback(
    async (r = root) => {
      if (r) setTree(await readTree(r));
    },
    [root],
  );

  const openFolder = async () => {
    try {
      const h = await pickFolder();
      editHistory.current.clear();
      updateHistory((v) => v + 1);
      setMessages([]);
      setRoot(h);
      setTabs([]);
      setActive(null);
      setChanged(new Set());
      setPreviewContext("");
      setTree(await readTree(h));
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("No se pudo abrir la carpeta");
    }
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
      await writeFile(root, path, t.content);
      setTabs((ts) => ts.map((x) => (x.path === path ? { ...x, saved: x.content } : x)));
      toast.success(`Guardado ${path.split("/").pop()}`);
    },
    [root, tabs],
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

  const sendChat = async (text: string, extras: ChatExtras): Promise<boolean> => {
    if (!root) return false;
    const input = previewContext
      ? `${text}\n\n[Contexto seleccionado en vista previa]\n${previewContext}`
      : text;
    const history: ChatMsg[] = [...messages, { role: "user", content: input }];
    setBusy(true);
    try {
      // Context: active file, open tabs, and any file path mentioned in the message.
      const wanted = new Set<string>();
      if (active) wanted.add(active);
      tabs.forEach((t) => wanted.add(t.path));
      files.forEach((f) => {
        const name = f.split("/").pop();
        if (input.includes(f) || (name && input.includes(name))) wanted.add(f);
      });
      const ctx = await collectChatContext(extras, [...wanted], async (path) => {
        return (
          tabsRef.current.find((tab) => tab.path === path)?.content ??
          (await readFile(root, path).catch(() => null))
        );
      });
      setMessages(history);

      const res = await ask({
        data: {
          messages: history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
          files: ctx,
          tree: files.slice(0, 3000),
          activePath: active,
          mode: extras.mode ?? "edit",
        },
      });
      setLastProvider(`${res.provider} · ${res.model}`);
      setPreviewContext("");

      // Apply edits to disk and editor.
      const edits = res.edits.filter((edit) => isSafeRelativePath(edit.path));
      if (
        edits.length > 0 &&
        !window.confirm(
          `La IA propone aplicar ${edits.length} cambio${edits.length === 1 ? "" : "s"}:\n\n${edits.map((edit) => `${edit.action === "delete" ? "Eliminar" : "Modificar"} ${edit.path}`).join("\n")}\n\n¿Querés aplicar estos cambios?`,
        )
      ) {
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
        const prev =
          tabs.find((t) => t.path === e.path)?.content ??
          (await readFile(root, e.path).catch(() => null));
        snap.push({ path: e.path, before: prev });
        if (e.action === "delete") {
          await removeEntry(root, e.path).catch(() => {});
        } else {
          await writeFile(root, e.path, e.content ?? "");
        }
      }
      const idx = history.length;
      if (snap.length) {
        const folder = root;
        const after = edits.map((e) => ({
          path: e.path,
          before: e.action === "delete" ? null : (e.content ?? ""),
        }));
        const restore = async (values: Snapshot, undone: boolean) => {
          for (const item of values) {
            if (item.before === null) await removeEntry(folder, item.path);
            else await writeFile(folder, item.path, item.before);
          }
          setTabs((current) => {
            let next = current.filter(
              (tab) => !values.some((item) => item.path === tab.path && item.before === null),
            );
            for (const item of values) {
              if (item.before === null) continue;
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
          setActive(values.find((item) => item.before !== null)?.path ?? null);
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
      setChanged((c) => new Set([...c, ...edits.map((e) => e.path)]));
      if (edits.length) await refresh();

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.reply,
          edits: edits.map((e) => ({ path: e.path, action: e.action })),
          provider: res.provider,
          team: res.team,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: (err as Error).message, error: true },
      ]);
      return false;
    } finally {
      setBusy(false);
    }
    return true;
  };

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
        setShowExplorer((v) => !v);
      } else if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setShowChat((v) => !v);
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (active) save(active);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const activeTab = tabs.find((t) => t.path === active);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Title bar */}
      <div className="flex h-8 shrink-0 items-center gap-3 border-b bg-panel-deep px-3 text-xs">
        <Flame className="h-4 w-4 text-ember" />
        <span className="font-semibold tracking-wide">Forja</span>
        <button
          onClick={openFolder}
          className="rounded px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Abrir carpeta
        </button>
        <button
          onClick={() => root && setQuickOpen(true)}
          className="mx-auto flex w-80 items-center gap-2 rounded border bg-background px-2 py-0.5 text-muted-foreground hover:border-ember"
        >
          <Search className="h-3.5 w-3.5" /> {root ? root.name : "Forja"}{" "}
          <span className="ml-auto font-mono">Ctrl+P</span>
        </button>
        <span className="w-24" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-panel-deep py-2">
          {[
            {
              icon: Files,
              on: showExplorer,
              fn: () => setShowExplorer((v) => !v),
              title: "Explorador (Ctrl+B)",
            },
            {
              icon: Search,
              on: false,
              fn: () => root && setQuickOpen(true),
              title: "Buscar archivo (Ctrl+P)",
            },
            {
              icon: Sparkles,
              on: showChat,
              fn: () => setShowChat((v) => !v),
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

        {showExplorer && (
          <>
            <div style={{ width: leftW }} className="shrink-0 border-r">
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
                  {!isSupported() && (
                    <p className="text-xs text-destructive">
                      Tu navegador no permite abrir carpetas locales. Usá Chrome, Edge u Opera en
                      computadora.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div onMouseDown={dragLeft} className="w-1 shrink-0 cursor-col-resize hover:bg-ember" />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b bg-panel-deep px-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!activeTab || busy || activeTab.content === activeTab.saved}
              title="Guardar archivo (Ctrl+S)"
              onClick={() =>
                active &&
                void save(active).catch(() => toast.error("No se pudo guardar el archivo"))
              }
            >
              <Save /> Guardar
            </Button>
            <Button
              variant="ghost"
              size="icon"
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
              aria-pressed={view === "code"}
              onClick={() => setView("code")}
            >
              <Code2 /> Código
            </Button>
            <Button
              variant={view === "preview" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === "preview"}
              onClick={() => setView("preview")}
            >
              <Globe /> Vista previa
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
                  setShowChat(true);
                }}
              />
            </div>
            <div className={cn("h-full", view !== "code" && "hidden")}>
              <EditorPane
                tabs={tabs}
                active={active}
                reveal={reveal}
                onSelect={setActive}
                onClose={closeTab}
                onChange={changeText}
                onSave={save}
                onToggleDiff={(p) =>
                  setTabs((ts) =>
                    ts.map((t) => (t.path === p ? { ...t, showDiff: !t.showDiff } : t)),
                  )
                }
              />
            </div>
          </div>
        </div>

        {showChat && (
          <>
            <div
              onMouseDown={dragRight}
              className="w-1 shrink-0 cursor-col-resize hover:bg-ember"
            />
            <div style={{ width: rightW }} className="shrink-0 border-l">
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
