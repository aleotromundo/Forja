import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAgent, parseCommand, resolveInside } from "./forja-agent.mjs";

const root = path.resolve("/tmp/forja-test-root");

test("resolveInside keeps paths inside the project", () => {
  assert.equal(resolveInside(root, "src/a.ts"), path.join(root, "src", "a.ts"));
  assert.throws(() => resolveInside(root, "../x"), /salir/);
  assert.throws(() => resolveInside(root, "src/../../x"), /salir/);
  assert.throws(() => resolveInside(root, "/etc/passwd"), /absoluta/);
  assert.throws(() => resolveInside(root, "C:\\Windows"), /absoluta/);
  assert.throws(() => resolveInside(root, "a\0b"), /inválida/);
});

test("parseCommand allows only read and project commands", () => {
  assert.deepEqual(parseCommand("git status"), ["git", "status"]);
  assert.deepEqual(parseCommand("npm run build"), ["npm", "run", "build"]);
  assert.throws(() => parseCommand("git push origin main"), /no permitido/);
  assert.throws(() => parseCommand("node -e 1"), /node con un archivo/);
  assert.deepEqual(parseCommand("node scripts/resumen.js"), ["node", "scripts/resumen.js"]);
  assert.throws(() => parseCommand("node scripts/x.js extra"), /node con un archivo/);
  assert.throws(() => parseCommand("node ../x.js"), /node con un archivo/);
  assert.throws(() => parseCommand("node x.txt"), /node con un archivo/);
  assert.deepEqual(parseCommand("python3 tools/resumen.py"), ["python3", "tools/resumen.py"]);
  assert.deepEqual(parseCommand("python x.py"), ["python", "x.py"]);
  assert.throws(() => parseCommand("python -c 1"), /python con un archivo/);
  assert.throws(() => parseCommand("python3 ../x.py"), /python3 con un archivo/);
  assert.throws(() => parseCommand("npm install evil"), /no permitido/);
  assert.throws(() => parseCommand("git status; rm -rf /"), /no permitidos/);
  assert.throws(() => parseCommand("npm run build && curl x"), /no permitidos/);
  assert.throws(() => parseCommand("git status $(whoami)"), /no permitidos/);
});

test("HTTP agent requires the token and works on files", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forja-agent-"));
  await fs.writeFile(path.join(dir, "hola.txt"), "hola mundo");
  const token = "token-de-prueba-largo-123";
  const server = createAgent({ root: dir, token });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (route, body, auth = `Bearer ${token}`) =>
    fetch(base + route, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body ?? {}),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));
  try {
    assert.equal((await call("/fs/tree", {}, "Bearer mal")).status, 401);
    const tree = await call("/fs/tree");
    assert.equal(tree.status, 200);
    assert.ok(tree.json.result.files.some((f) => f.path === "hola.txt"));
    const read = await call("/fs/read", { path: "hola.txt" });
    assert.equal(read.json.result.content, "hola mundo");
    assert.equal((await call("/fs/read", { path: "../x" })).status, 400);
    await call("/fs/write", { path: "carpeta/nuevo.md", content: "# hola" });
    assert.equal(await fs.readFile(path.join(dir, "carpeta", "nuevo.md"), "utf8"), "# hola");
    assert.equal((await call("/fs/delete", { path: "" })).status, 400);
    await call("/fs/move", { path: "hola.txt", toPath: "saludo.txt" });
    await fs.access(path.join(dir, "saludo.txt"));
  } finally {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
