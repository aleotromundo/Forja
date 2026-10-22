import { useEffect, useRef, useState } from "react";
import {
  Code2,
  ExternalLink,
  Globe,
  MessageSquare,
  MousePointer2,
  Pencil,
  RefreshCw,
  Send,
  Type,
  Undo2,
  Redo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readFile } from "@/lib/fs";
import {
  bridgeScript,
  inspectHtml,
  replaceElementText,
  resolvePreviewPath,
  type PreviewElement,
} from "@/lib/preview";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/lib/edit-history";

type Mode = "browse" | "select" | "text" | "draw" | "comment";
interface Props {
  root: FileSystemDirectoryHandle | null;
  files: string[];
  tabs: { path: string; content: string }[];
  active: string | null;
  onChange: (path: string, content: string, original: string) => void;
  onContext: (context: string) => void;
  onRecord: (entry: HistoryEntry) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}
interface Mark {
  x: number;
  y: number;
  text: string;
}

export function PreviewPane({
  root,
  files,
  tabs,
  active,
  onChange,
  onContext,
  onRecord,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const htmlFiles = files.filter((file) => /\.html?$/i.test(file));
  const [path, setPath] = useState(() =>
    active && /\.html?$/i.test(active)
      ? active
      : (htmlFiles.find((file) => file === "index.html") ?? htmlFiles[0] ?? ""),
  );
  const [external, setExternal] = useState(false);
  const [address, setAddress] = useState("http://localhost:3000");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [documentHtml, setDocumentHtml] = useState("");
  const [elements, setElements] = useState<PreviewElement[]>([]);
  const [mode, setMode] = useState<Mode>("browse");
  const [selected, setSelected] = useState<PreviewElement | null>(null);
  const [text, setText] = useState("");
  const [comment, setComment] = useState("");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [strokes, setStrokes] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const token = useRef(crypto.randomUUID());
  const drawingBefore = useRef<{ marks: Mark[]; strokes: string[] } | null>(null);
  const annotate = (nextMarks: Mark[], nextStrokes: string[], before = { marks, strokes }) => {
    onRecord({
      undo: () => {
        setMarks(before.marks);
        setStrokes(before.strokes);
      },
      redo: () => {
        setMarks(nextMarks);
        setStrokes(nextStrokes);
      },
    });
    setMarks(nextMarks);
    setStrokes(nextStrokes);
  };
  const tabContent = tabs.find((tab) => tab.path === path)?.content;

  useEffect(() => {
    if (!path && htmlFiles.length)
      setPath(htmlFiles.find((file) => file === "index.html") ?? htmlFiles[0] ?? "");
  }, [path, htmlFiles]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    if (external || !path || !root) return;
    setLoading(true);
    setError("");
    async function prepare() {
      if (!root) return;
      try {
        const content = tabContent ?? (await readFile(root, path));
        const inspected = inspectHtml(content);
        const doc = new DOMParser().parseFromString(inspected.html, "text/html");
        doc
          .querySelectorAll("script, base, iframe, object, embed")
          .forEach((node) => node.remove());
        doc.querySelectorAll("meta[http-equiv]").forEach((node) => node.remove());
        doc.querySelectorAll("*").forEach((node) =>
          [...node.attributes].forEach((attr) => {
            if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
          }),
        );
        const assetUrl = async (base: string, reference: string) => {
          const asset = resolvePreviewPath(base, reference);
          if (!asset) return reference;
          let dir = root;
          const parts = asset.split("/");
          const name = parts.pop();
          if (!dir || !name) return reference;
          for (const part of parts) dir = await dir.getDirectoryHandle(part);
          const blob = await (await dir.getFileHandle(name)).getFile();
          const result = URL.createObjectURL(blob);
          objectUrls.push(result);
          return result;
        };
        async function cssAssets(css: string, base: string) {
          const matches = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)];
          for (const match of matches) {
            const reference = match[1];
            if (!reference) continue;
            try {
              css = css.replace(match[0], `url("${await assetUrl(base, reference)}")`);
            } catch {
              /* Missing local asset remains visible as a browser error. */
            }
          }
          return css;
        }
        for (const style of doc.querySelectorAll("style"))
          style.textContent = await cssAssets(style.textContent ?? "", path);
        for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
          const reference = link.getAttribute("href") ?? "";
          const asset = resolvePreviewPath(path, reference);
          if (!asset) continue;
          const style = doc.createElement("style");
          style.textContent = await cssAssets(await readFile(root, asset), asset);
          link.replaceWith(style);
        }
        for (const node of doc.querySelectorAll("img, source, video, audio")) {
          const src = node.getAttribute("src");
          if (src) {
            try {
              node.setAttribute("src", await assetUrl(path, src));
            } catch {
              /* Leave missing references intact. */
            }
          }
          node.removeAttribute("srcset");
        }
        const color = getComputedStyle(document.documentElement).getPropertyValue("--ember").trim();
        if (!cancelled) {
          setSource(content);
          setElements(inspected.elements);
          setDocumentHtml(
            "<!doctype html>" + doc.documentElement.outerHTML + bridgeScript(token.current, color),
          );
        }
      } catch (err) {
        if (!cancelled) setError(`No se pudo cargar la vista previa: ${(err as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void prepare();
    return () => {
      cancelled = true;
      objectUrls.forEach((value) => URL.revokeObjectURL(value));
    };
  }, [root, path, tabContent, external, revision]);

  useEffect(() => {
    setSelected(null);
    setComment("");
  }, [path, url, external]);

  useEffect(() => {
    const updateMode = () =>
      frame.current?.contentWindow?.postMessage({ forjaPreview: token.current, mode }, "*");
    updateMode();
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.forjaPreview !== token.current
      )
        return;
      if (event.data.type === "ready") updateMode();
      if (event.data.type === "undo") onUndo();
      if (event.data.type === "redo") onRedo();
      if (event.data.type === "clipboard") {
        const element = elements.find((item) => item.id === event.data.id);
        if (!element?.editable || typeof event.data.text !== "string") return;
        try {
          onChange(path, replaceElementText(source, element.id, event.data.text), source);
          setSelected(null);
        } catch (err) {
          toast.error((err as Error).message);
        }
      }
      if (event.data.type === "selection") {
        const element = elements.find((item) => item.id === event.data.id);
        if (element) {
          setSelected(element);
          setText(element.text);
        }
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [mode, elements, path, source, onChange, onUndo, onRedo]);

  const context = () =>
    `${external ? url : path}\nElemento: ${selected ? `${selected.tag} (${selected.id})\nTexto: ${selected.text}` : "vista completa"}`;
  const sendContext = () => {
    onContext(
      `Vista previa: ${context()}${marks.length ? `\nComentarios:\n${marks.map((mark) => `- ${mark.text} (posición ${Math.round(mark.x)}%, ${Math.round(mark.y)}%)`).join("\n")}` : ""}${strokes.length ? `\nAnotación dibujada: ${strokes.join(" | ")} (coordenadas porcentuales de la vista).` : ""}`,
    );
    toast.success("Contexto agregado al chat");
  };
  const point = (event: React.PointerEvent) => {
    const rect = area.current?.getBoundingClientRect();
    return rect
      ? {
          x: ((event.clientX - rect.left) / rect.width) * 100,
          y: ((event.clientY - rect.top) / rect.height) * 100,
        }
      : { x: 0, y: 0 };
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-panel px-3 py-2">
        <Button
          variant={!external ? "secondary" : "ghost"}
          size="icon"
          title="Archivo HTML local"
          aria-label="Archivo HTML local"
          onClick={() => setExternal(false)}
        >
          <Code2 />
        </Button>
        <Button
          variant={external ? "secondary" : "ghost"}
          size="icon"
          title="Sitio en ejecución"
          aria-label="Sitio en ejecución"
          onClick={() => {
            setExternal(true);
            setMode("browse");
          }}
        >
          <Globe />
        </Button>
        {external ? (
          <form
            className="flex min-w-0 flex-1 gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const value = new URL(address);
                if (!["https:", "http:"].includes(value.protocol)) throw new Error();
                setUrl(value.href);
              } catch {
                toast.error("Ingresá una dirección http o https válida");
              }
            }}
          >
            <input
              aria-label="Dirección de vista previa"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="min-w-0 flex-1 rounded border bg-background px-2 text-xs outline-none focus:border-ring"
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              title="Abrir dirección"
              aria-label="Abrir dirección"
            >
              <ExternalLink />
            </Button>
          </form>
        ) : (
          <select
            aria-label="Archivo para vista previa"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded border bg-background px-2 text-xs"
          >
            {!htmlFiles.length && <option value="">Sin archivos HTML</option>}
            {htmlFiles.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="ghost"
          size="icon"
          title="Actualizar vista previa"
          aria-label="Actualizar vista previa"
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw className={cn(loading && "animate-spin")} />
        </Button>
      </div>
      {external && (
        <div className="border-b px-3 py-2 text-xs text-muted-foreground">
          Sitio externo: permite dibujar y comentar; seleccionar y editar texto requiere un archivo
          HTML local. Algunos sitios bloquean su vista embebida.
        </div>
      )}
      <div ref={area} className="relative min-h-0 flex-1 overflow-hidden">
        {error ? (
          <div role="alert" className="p-6 text-sm text-destructive">
            {error}
          </div>
        ) : (external ? url : documentHtml) ? (
          <iframe
            ref={frame}
            key={external ? `${url}-${revision}` : "local"}
            title="Vista previa del proyecto"
            src={external ? url : undefined}
            srcDoc={external ? undefined : documentHtml}
            sandbox="allow-scripts"
            className="h-full w-full border-0 bg-preview-paper"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <Globe className="h-9 w-9 text-ember" />
            <span>
              {loading
                ? "Cargando vista previa…"
                : root
                  ? "No hay un archivo HTML para mostrar. Podés abrir la dirección de tu sitio en ejecución."
                  : "Abrí una carpeta para ver tu proyecto."}
            </span>
          </div>
        )}
        {(mode === "draw" || (mode === "comment" && !selected)) && (
          <div
            className="absolute inset-0 z-10 cursor-crosshair"
            onPointerDown={(event) => {
              const pos = point(event);
              if (mode === "comment") {
                annotate([...marks, { ...pos, text: "" }], strokes);
                return;
              }
              drawingBefore.current = { marks, strokes };
              event.currentTarget.setPointerCapture(event.pointerId);
              setDrawing(true);
              setStrokes((items) => [...items, `M ${pos.x} ${pos.y}`]);
            }}
            onPointerMove={(event) => {
              if (!drawing) return;
              const pos = point(event);
              setStrokes((items) =>
                items.map((stroke, index) =>
                  index === items.length - 1 ? `${stroke} L ${pos.x} ${pos.y}` : stroke,
                ),
              );
            }}
            onPointerUp={() => {
              setDrawing(false);
              if (drawingBefore.current) annotate(marks, strokes, drawingBefore.current);
              drawingBefore.current = null;
            }}
            onPointerCancel={() => {
              setDrawing(false);
              if (drawingBefore.current) {
                setStrokes(drawingBefore.current.strokes);
                drawingBefore.current = null;
              }
            }}
          />
        )}
        <svg
          className="pointer-events-none absolute inset-0 z-10 h-full w-full text-ember"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-label="Anotaciones dibujadas"
        >
          {strokes.map((stroke, index) => (
            <path
              key={index}
              d={stroke}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {marks.map((mark, index) => (
          <span
            key={index}
            title={mark.text || "Comentario pendiente"}
            style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
            className="pointer-events-none absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-primary text-xs text-primary-foreground"
          >
            {index + 1}
          </span>
        ))}
        <div
          role="toolbar"
          aria-label="Herramientas de vista previa"
          className="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-md border bg-popover p-1.5 shadow-preview"
        >
          {(
            [
              { id: "browse", icon: Globe, label: "Navegar" },
              { id: "select", icon: MousePointer2, label: "Seleccionar elemento" },
              { id: "text", icon: Type, label: "Editar texto actual" },
              { id: "draw", icon: Pencil, label: "Dibujar anotación" },
              { id: "comment", icon: MessageSquare, label: "Añadir comentario" },
            ] as const
          ).map((tool) => (
            <Button
              key={tool.id}
              variant={mode === tool.id ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 shrink-0"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={mode === tool.id}
              disabled={external && (tool.id === "select" || tool.id === "text")}
              onClick={() => {
                setMode(tool.id);
                if (tool.id === "comment") setSelected(null);
              }}
            >
              <tool.icon />
            </Button>
          ))}
          <span className="mx-1 h-5 border-l" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="Deshacer (Ctrl+Z)"
            aria-label="Deshacer cambio de vista previa"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="Rehacer (Ctrl+Shift+Z)"
            aria-label="Rehacer cambio de vista previa"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="Enviar contexto al chat"
            aria-label="Enviar contexto al chat"
            disabled={!root || (!selected && !marks.some((mark) => mark.text) && !strokes.length)}
            onClick={sendContext}
          >
            <Send />
          </Button>
        </div>
        {(selected || (mode === "comment" && marks.length > 0)) && (
          <div className="absolute right-3 top-3 z-30 w-64 max-w-[calc(100%-24px)] rounded-md border bg-popover p-3 shadow-preview">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs text-ember">
                {selected ? `<${selected.tag}>` : "Comentario"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Cerrar selección"
                onClick={() => {
                  setSelected(null);
                  setMode("browse");
                }}
              >
                <X />
              </Button>
            </div>
            {mode === "text" && selected ? (
              <>
                <textarea
                  aria-label="Texto del elemento"
                  rows={3}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  disabled={!selected.editable}
                  className="w-full resize-none rounded border bg-background p-2 text-xs"
                />
                <Button
                  className="mt-2 w-full"
                  size="sm"
                  disabled={!selected.editable || text === selected.text}
                  onClick={() => {
                    try {
                      onChange(path, replaceElementText(source, selected.id, text), source);
                      setSelected({ ...selected, text });
                      toast.success(
                        "Texto actualizado; guardá el archivo para escribirlo en tu carpeta",
                      );
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                >
                  Aplicar texto
                </Button>
                {!selected.editable && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Contiene otros elementos. Enviá la selección al chat para cambiarlo.
                  </p>
                )}
              </>
            ) : mode === "comment" ? (
              <>
                <textarea
                  aria-label="Comentario de vista previa"
                  rows={3}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Escribí tu comentario…"
                  className="w-full resize-none rounded border bg-background p-2 text-xs"
                />
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  disabled={!comment.trim()}
                  onClick={() => {
                    const value = comment.trim();
                    if (selected)
                      annotate(
                        [
                          ...marks,
                          { x: 50, y: 25, text: `${selected.tag}: ${selected.text}\n${value}` },
                        ],
                        strokes,
                      );
                    else
                      annotate(
                        marks.map((mark, index) =>
                          index === marks.length - 1 ? { ...mark, text: value } : mark,
                        ),
                        strokes,
                      );
                    setComment("");
                    setSelected(null);
                    setMode("browse");
                  }}
                >
                  Añadir comentario
                </Button>
              </>
            ) : (
              <>
                <p className="mb-3 max-h-32 overflow-auto whitespace-pre-wrap text-xs">
                  {selected?.text.slice(0, 500)}
                </p>
                <Button size="sm" className="w-full" onClick={sendContext}>
                  <Send /> Usar en el chat
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
