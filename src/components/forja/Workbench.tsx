import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Files, Flame, Search, Sparkles } from "lucide-react";
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
import { ChatPanel, type ChatMsg } from "./ChatPanel";
import { EditorPane, type Tab } from "./EditorPane";
import { Explorer } from "./Explorer";

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
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [lastProvider, setLastProvider] = useState<string>("");
  const [showExplorer, setShowExplorer] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const snapshots = useRef<Record<number, Snapshot>>({});
  const [leftW, dragLeft] = useDrag(260, 160, 500);
  const [rightW, dragRight] = useDrag(380, 260, 700, true);

  const files = useMemo(() => flatten(tree), [tree]);

  const refresh = useCallback(async (r = root) => {
    if (r) setTree(await readTree(r));
  }, [root]);

  const openFolder = async () => {
    try {
      const h = await pickFolder();
      setRoot(h);
      setTabs([]);
      setActive(null);
      setChanged(new Set());
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
          setTabs((ts) => (ts.some((t) => t.path === path) ? ts : [...ts, { path, content, saved: content }]));
        } catch {
          toast.error(`No se pudo leer ${path}`);
          return;
        }
      }
      setActive(path);
    },
    [root, tabs],
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
    if (t && t.content !== t.saved && !confirm(`${path} tiene cambios sin guardar. ¿Cerrar igual?`)) return;
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

  const sendChat = async (text: string) => {
    if (!root) return;
    const history: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setBusy(true);
    try {
      // Context: active file, open tabs, and any file path mentioned in the message.
      const wanted = new Set<string>();
      if (active) wanted.add(active);
      tabs.forEach((t) => wanted.add(t.path));
      files.forEach((f) => {
        if (text.includes(f) || text.includes(f.split("/").pop()!)) wanted.add(f);
      });
      const ctx: { path: string; content: string }[] = [];
      let budget = 120_000;
      for (const p of [...wanted].slice(0, 30)) {
        const tab = tabs.find((t) => t.path === p);
        const content = tab ? tab.content : await readFile(root, p).catch(() => null);
        if (content == null || content.length > budget) continue;
        budget -= content.length;
        ctx.push({ path: p, content });
      }

      const res = await ask({
        data: {
          messages: history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
          files: ctx,
          tree: files.slice(0, 3000),
          activePath: active,
        },
      });
      setLastProvider(`${res.provider} · ${res.model}`);

      // Apply edits to disk and editor.
      const snap: Snapshot = [];
      for (const e of res.edits) {
        const prev = tabs.find((t) => t.path === e.path)?.content ?? (await readFile(root, e.path).catch(() => null));
        snap.push({ path: e.path, before: prev });
        if (e.action === "delete") {
          await removeEntry(root, e.path).catch(() => {});
        } else {
          await writeFile(root, e.path, e.content ?? "");
        }
      }
      const idx = history.length;
      snapshots.current[idx] = snap;

      setTabs((ts) => {
        let next = ts.filter((t) => !res.edits.some((e) => e.action === "delete" && e.path === t.path));
        for (const e of res.edits) {
          if (e.action !== "write") continue;
          const before = snap.find((s) => s.path === e.path)?.before ?? "";
          const content = e.content ?? "";
          const existing = next.find((t) => t.path === e.path);
          next = existing
            ? next.map((t) => (t.path === e.path ? { ...t, content, saved: content, before, showDiff: true } : t))
            : [...next, { path: e.path, content, saved: content, before, showDiff: true }];
        }
        return next;
      });
      const firstWrite = res.edits.find((e) => e.action === "write");
      if (firstWrite) setActive(firstWrite.path);
      setChanged((c) => new Set([...c, ...res.edits.map((e) => e.path)]));
      if (res.edits.length) await refresh();

      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.reply, edits: res.edits.map((e) => ({ path: e.path, action: e.action })), provider: res.provider },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: (err as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (index: number) => {
    const snap = snapshots.current[index];
    if (!root || !snap) return;
    for (const s of snap) {
      if (s.before === null) await removeEntry(root, s.path).catch(() => {});
      else await writeFile(root, s.path, s.before);
    }
    setTabs((ts) =>
      ts
        .filter((t) => !snap.some((s) => s.path === t.path && s.before === null))
        .map((t) => {
          const s = snap.find((x) => x.path === t.path);
          return s && s.before !== null ? { ...t, content: s.before, saved: s.before, before: undefined, showDiff: false } : t;
        }),
    );
    setMessages((m) => m.map((x, i) => (i === index ? { ...x, undone: true } : x)));
    await refresh();
    toast.success("Cambios deshechos");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "p") {
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [root, active, save]);

  const activeTab = tabs.find((t) => t.path === active);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Title bar */}
      <div className="flex h-8 shrink-0 items-center gap-3 border-b bg-panel-deep px-3 text-xs">
        <Flame className="h-4 w-4 text-ember" />
        <span className="font-semibold tracking-wide">Forja</span>
        <button onClick={openFolder} className="rounded px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          Abrir carpeta
        </button>
        <button
          onClick={() => root && setQuickOpen(true)}
          className="mx-auto flex w-80 items-center gap-2 rounded border bg-background px-2 py-0.5 text-muted-foreground hover:border-ember"
        >
          <Search className="h-3.5 w-3.5" /> {root ? root.name : "Forja"} <span className="ml-auto font-mono">Ctrl+P</span>
        </button>
        <span className="w-24" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-panel-deep py-2">
          {[
            { icon: Files, on: showExplorer, fn: () => setShowExplorer((v) => !v), title: "Explorador (Ctrl+B)" },
            { icon: Search, on: false, fn: () => root && setQuickOpen(true), title: "Buscar archivo (Ctrl+P)" },
            { icon: Sparkles, on: showChat, fn: () => setShowChat((v) => !v), title: "Chat IA (Ctrl+L)" },
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
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Explorador</div>
                  <p className="text-muted-foreground">No hay ninguna carpeta abierta.</p>
                  <button
                    onClick={openFolder}
                    className="flex items-center justify-center gap-2 rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90"
                  >
                    <FolderOpen className="h-4 w-4" /> Abrir carpeta
                  </button>
                  {!isSupported() && (
                    <p className="text-xs text-destructive">
                      Tu navegador no permite abrir carpetas locales. Usá Chrome, Edge u Opera en computadora.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div onMouseDown={dragLeft} className="w-1 shrink-0 cursor-col-resize hover:bg-ember" />
          </>
        )}

        <div className="min-w-0 flex-1">
          <EditorPane
            tabs={tabs}
            active={active}
            onSelect={setActive}
            onClose={closeTab}
            onChange={(p, v) => setTabs((ts) => ts.map((t) => (t.path === p ? { ...t, content: v } : t)))}
            onSave={save}
            onToggleDiff={(p) => setTabs((ts) => ts.map((t) => (t.path === p ? { ...t, showDiff: !t.showDiff } : t)))}
          />
        </div>

        {showChat && (
          <>
            <div onMouseDown={dragRight} className="w-1 shrink-0 cursor-col-resize hover:bg-ember" />
            <div style={{ width: rightW }} className="shrink-0 border-l">
              <ChatPanel
                messages={messages}
                busy={busy}
                disabled={!root}
                onSend={sendChat}
                onOpenFile={openFile}
                onUndo={undo}
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
