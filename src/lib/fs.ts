// Local folder access through the browser File System Access API.

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

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).showDirectoryPicker({ mode: "readwrite" });
}

export async function readTree(root: FileSystemDirectoryHandle): Promise<FileNode[]> {
  let count = 0;
  async function walk(dir: FileSystemDirectoryHandle, base: string): Promise<FileNode[]> {
    const out: FileNode[] = [];
    for await (const h of (dir as DirHandle).values()) {
      if (count > MAX_FILES) break;
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
