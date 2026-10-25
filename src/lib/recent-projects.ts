// Proyectos recientes: guarda el acceso a la carpeta (no la ruta) en IndexedDB del navegador.

export interface RecentProject {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  openedAt: string;
}

const DB = "forja";
const STORE = "recent";
const MAX = 8;

type Perm = { queryPermission(o: { mode: "readwrite" }): Promise<string>; requestPermission(o: { mode: "readwrite" }): Promise<string> };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export async function listRecent(): Promise<RecentProject[]> {
  try {
    const all = await run<RecentProject[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  } catch {
    return [];
  }
}

export async function rememberProject(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const all = await listRecent();
    for (const item of all) {
      const same = await (handle as unknown as { isSameEntry(o: FileSystemHandle): Promise<boolean> })
        .isSameEntry(item.handle)
        .catch(() => false);
      if (same) await forgetById(item.id);
    }
    const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    await run("readwrite", (s) =>
      s.put({ id, name: handle.name, handle, openedAt: new Date().toISOString() }),
    );
    const fresh = (await listRecent()).slice(MAX);
    for (const item of fresh) await forgetById(item.id);
  } catch {
    /* Si el navegador no guarda accesos, simplemente no hay recientes. */
  }
}

async function forgetById(id: string) {
  await run("readwrite", (s) => s.delete(id));
}

export async function forgetProject(id: string): Promise<void> {
  try {
    await forgetById(id);
  } catch {
    /* ignorar */
  }
}

/** Pide permiso de lectura y escritura. Tiene que llamarse desde un clic del usuario. */
export async function ensureAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const perm = handle as unknown as Perm;
  const opts = { mode: "readwrite" as const };
  try {
    if ((await perm.queryPermission(opts)) === "granted") return true;
    return (await perm.requestPermission(opts)) === "granted";
  } catch {
    return false;
  }
}
