// Local folder access through the browser File System Access API.
import { agentCall } from "./local-agent";

type TauriGlobal = {
  core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
};
declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

export function isDesktopBridge() {
  return typeof window !== "undefined" && typeof window.__TAURI__?.core?.invoke === "function";
}

export function desktopInvoke<T>(command: string, args?: Record<string, unknown>) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("La app de escritorio no está disponible.");
  return invoke(command, args) as Promise<T>;
}

export interface FileNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileNode[];
}

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  ".turbo",
  ".vercel",
]);
const MAX_FILES = 3000;

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
};

export function isSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Handle virtual para el modo escritorio: usa el agente local sin pedir otro selector. */
export function createAgentDirectoryHandle(name: string): FileSystemDirectoryHandle {
  return new AgentDirectoryHandle(name, "") as unknown as FileSystemDirectoryHandle;
}

class AgentDirectoryHandle {
  readonly kind = "directory" as const;
  constructor(
    readonly name: string,
    private readonly base: string,
  ) {}

  async *values(): AsyncGenerator<AgentFileHandle | AgentDirectoryHandle> {
    const result = isDesktopBridge()
      ? { files: await desktopInvoke<Array<{ path: string }>>("desktop_tree") }
      : ((await agentCall("/fs/tree", {})) as { files?: Array<{ path: string }> });
    const prefix = this.base ? `${this.base}/` : "";
    const entries = new Map<string, "file" | "directory">();
    for (const file of result.files ?? []) {
      if (!file.path.startsWith(prefix)) continue;
      const relative = file.path.slice(prefix.length);
      const [entry, ...rest] = relative.split("/");
      if (!entry) continue;
      entries.set(entry, rest.length ? "directory" : "file");
    }
    for (const [entry, kind] of entries) {
      const path = this.base ? `${this.base}/${entry}` : entry;
      yield kind === "file"
        ? new AgentFileHandle(entry, path)
        : new AgentDirectoryHandle(entry, path);
    }
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const path = this.base ? `${this.base}/${name}` : name;
    if (options?.create) {
      if (isDesktopBridge()) await desktopInvoke("desktop_mkdir", { path });
      else await agentCall("/fs/mkdir", { path });
    }
    return new AgentDirectoryHandle(name, path);
  }

  async getFileHandle(name: string) {
    return new AgentFileHandle(name, this.base ? `${this.base}/${name}` : name);
  }

  async removeEntry(name: string) {
    const path = this.base ? `${this.base}/${name}` : name;
    if (isDesktopBridge()) await desktopInvoke("desktop_delete", { path });
    else await agentCall("/fs/delete", { path });
  }
}

class AgentFileHandle {
  readonly kind = "file" as const;
  constructor(
    readonly name: string,
    private readonly path: string,
  ) {}

  async getFile() {
    const content = isDesktopBridge()
      ? await desktopInvoke<string>("desktop_read", { path: this.path })
      : (((await agentCall("/fs/read", { path: this.path })) as { content?: string }).content ??
        "");
    const blob = new Blob([content], { type: "text/plain" });
    return new File([blob], this.name, { type: "text/plain" });
  }

  async createWritable() {
    let content = "";
    return {
      write: async (value: string | ArrayBuffer) => {
        content = typeof value === "string" ? value : new TextDecoder().decode(value);
      },
      close: async () => {
        if (isDesktopBridge()) await desktopInvoke("desktop_write", { path: this.path, content });
        else await agentCall("/fs/write", { path: this.path, content });
      },
    };
  }
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).showDirectoryPicker({ mode: "readwrite" });
}

export async function readTree(root: FileSystemDirectoryHandle): Promise<FileNode[]> {
  let count = 0;
  async function walk(dir: FileSystemDirectoryHandle, base: string): Promise<FileNode[]> {
    const out: FileNode[] = [];
    for await (const h of (dir as DirHandle).values()) {
      if (count >= MAX_FILES) break;
      const path = base ? `${base}/${h.name}` : h.name;
      if (h.kind === "directory") {
        if (IGNORE.has(h.name)) continue;
        out.push({
          name: h.name,
          path,
          kind: "directory",
          children: await walk(h as FileSystemDirectoryHandle, path),
        });
      } else {
        count++;
        out.push({ name: h.name, path, kind: "file" });
      }
    }
    return out.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1,
    );
  }
  return walk(root, "");
}

export function flatten(nodes: FileNode[]): string[] {
  const out: string[] = [];
  const rec = (ns: FileNode[]) =>
    ns.forEach((n) => (n.kind === "file" ? out.push(n.path) : rec(n.children ?? [])));
  rec(nodes);
  return out;
}

async function getDir(root: FileSystemDirectoryHandle, parts: string[], create: boolean) {
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
  return dir;
}

function split(path: string) {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop()!;
  return { parts, name };
}

export async function readFile(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const { parts, name } = split(path);
  const dir = await getDir(root, parts, false);
  const fh = await dir.getFileHandle(name);
  return (await fh.getFile()).text();
}

export async function writeFile(root: FileSystemDirectoryHandle, path: string, content: string) {
  const { parts, name } = split(path);
  const dir = await getDir(root, parts, true);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

export async function createDir(root: FileSystemDirectoryHandle, path: string) {
  await getDir(root, path.split("/").filter(Boolean), true);
}

export async function removeEntry(root: FileSystemDirectoryHandle, path: string) {
  const { parts, name } = split(path);
  const dir = await getDir(root, parts, false);
  await dir.removeEntry(name, { recursive: true });
}

export async function moveEntry(root: FileSystemDirectoryHandle, from: string, to: string) {
  const source = await getEntry(root, from);
  const { parts, name } = split(to);
  const destination = await getDir(root, parts, true);
  await copyEntry(source, destination, name);
  await removeEntry(root, from);
}

async function getEntry(root: FileSystemDirectoryHandle, path: string) {
  const { parts, name } = split(path);
  const dir = await getDir(root, parts, false);
  try {
    return await dir.getFileHandle(name);
  } catch {
    return dir.getDirectoryHandle(name);
  }
}

async function copyEntry(
  source: FileSystemFileHandle | FileSystemDirectoryHandle,
  destination: FileSystemDirectoryHandle,
  name: string,
) {
  if (source.kind === "file") {
    const file = await source.getFile();
    const target = await destination.getFileHandle(name, { create: true });
    const writable = await target.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    return;
  }
  const target = await destination.getDirectoryHandle(name, { create: true });
  for await (const child of (source as DirHandle).values()) {
    await copyEntry(
      child.kind === "file"
        ? await source.getFileHandle(child.name)
        : await source.getDirectoryHandle(child.name),
      target,
      child.name,
    );
  }
}

export async function fileExists(root: FileSystemDirectoryHandle, path: string) {
  try {
    await readFile(root, path);
    return true;
  } catch {
    return false;
  }
}

const LANGS: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  md: "markdown",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  sh: "shell",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
  sql: "sql",
  svg: "xml",
  toml: "ini",
  vue: "html",
  svelte: "html",
  kt: "kotlin",
  swift: "swift",
  dart: "dart",
};

export function languageOf(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGS[ext] ?? "plaintext";
}

const BINARY =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|mov|wasm|lock|exe|bin)$/i;
export function isTextFile(path: string) {
  return !BINARY.test(path);
}
