import { useState } from "react";
import { ChevronRight, File, FilePlus, Folder, FolderOpen, FolderPlus, RefreshCw, Trash2 } from "lucide-react";
import type { FileNode } from "@/lib/fs";
import { cn } from "@/lib/utils";

interface Props {
  rootName: string;
  tree: FileNode[];
  activePath: string | null;
  changed: Set<string>;
  onOpen: (path: string) => void;
  onNewFile: (dir: string) => void;
  onNewFolder: (dir: string) => void;
  onDelete: (path: string) => void;
  onRefresh: () => void;
}

export function Explorer(p: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selectedDir, setSelectedDir] = useState("");

  const render = (nodes: FileNode[], depth: number) =>
    nodes.map((n) => {
      const isOpen = open[n.path];
      const pad = { paddingLeft: 8 + depth * 12 };
      if (n.kind === "directory") {
        return (
          <div key={n.path}>
            <div
              className={cn(
                "group flex h-6 cursor-pointer items-center gap-1 pr-2 text-[13px] hover:bg-accent",
                selectedDir === n.path && "bg-accent/60",
              )}
              style={pad}
              onClick={() => {
                setOpen((o) => ({ ...o, [n.path]: !o[n.path] }));
                setSelectedDir(n.path);
              }}
            >
              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-90")} />
              {isOpen ? <FolderOpen className="h-4 w-4 shrink-0 text-ember" /> : <Folder className="h-4 w-4 shrink-0 text-ember" />}
              <span className="truncate">{n.name}</span>
              <button
                className="ml-auto hidden text-muted-foreground hover:text-destructive group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  p.onDelete(n.path);
                }}
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {isOpen && n.children && render(n.children, depth + 1)}
          </div>
        );
      }
      return (
        <div
          key={n.path}
          className={cn(
            "group flex h-6 cursor-pointer items-center gap-1.5 pr-2 text-[13px] hover:bg-accent",
            p.activePath === n.path && "bg-accent text-accent-foreground",
          )}
          style={{ paddingLeft: 22 + depth * 12 }}
          onClick={() => {
            p.onOpen(n.path);
            setSelectedDir(n.path.split("/").slice(0, -1).join("/"));
          }}
        >
          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", p.changed.has(n.path) && "text-added")}>{n.name}</span>
          {p.changed.has(n.path) && <span className="ml-1 text-[10px] font-semibold text-added">M</span>}
          <button
            className="ml-auto hidden text-muted-foreground hover:text-destructive group-hover:block"
            onClick={(e) => {
              e.stopPropagation();
              p.onDelete(n.path);
            }}
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    });

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Explorador</span>
        <div className="flex gap-1.5">
          <button title="Nuevo archivo" onClick={() => p.onNewFile(selectedDir)} className="hover:text-foreground">
            <FilePlus className="h-4 w-4" />
          </button>
          <button title="Nueva carpeta" onClick={() => p.onNewFolder(selectedDir)} className="hover:text-foreground">
            <FolderPlus className="h-4 w-4" />
          </button>
          <button title="Refrescar" onClick={p.onRefresh} className="hover:text-foreground">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        className="cursor-pointer px-3 pb-1 text-xs font-bold uppercase tracking-wide"
        onClick={() => setSelectedDir("")}
      >
        {p.rootName}
      </div>
      <div className="flex-1 overflow-auto pb-4 font-mono">{render(p.tree, 0)}</div>
    </div>
  );
}
