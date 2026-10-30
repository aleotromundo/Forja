#!/usr/bin/env node
// Agente local de Forja: deja que la app web lea y cambie la carpeta de tu proyecto,
// use git y ejecute comandos permitidos. Sin dependencias. Escucha solo en 127.0.0.1
// y exige un token. No hace push, no instala paquetes y no ejecuta comandos arbitrarios.
//
// Uso:  node agent/forja-agent.mjs --root "C:\ruta\a\tu\proyecto"
import http from "node:http";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const MAX_BODY = 2_000_000;
const MAX_OUT = 20_000;
const MAX_READ = 300_000;
const MAX_TREE = 3000;
const TIMEOUT_MS = 300_000;
const IGNORED = new Set([".git", "node_modules", ".output", ".wrangler", ".tanstack", ".nitro", "dist"]);

// Comandos que se pueden pedir con run_command. Cada entrada es el inicio permitido.
export const ALLOWED_COMMANDS = [
  ["git", "status"],
  ["git", "diff"],
  ["git", "log"],
  ["npm", "run"],
  ["npm", "test"],
  ["pnpm", "run"],
  ["pnpm", "test"],
  ["pnpm", "exec", "tsc"],
  ["pnpm", "exec", "vitest"],
  ["pnpm", "exec", "prettier"],
  ["bun", "run"],
  ["bun", "test"],
  ["npx", "tsc"],
  ["npx", "vitest"],
  ["npx", "prettier"],
];
const INTERPRETERS = {
  node: { test: /\.m?js$/i, label: ".js o .mjs" },
  python: { test: /\.py$/i, label: ".py" },
  python3: { test: /\.py$/i, label: ".py" },
};
const FORBIDDEN = /[&|;<>`$()'"\\*?{}\n\r]/;

export function resolveInside(root, rel) {
  if (typeof rel !== "string" || rel.length > 500 || rel.includes("\0")) throw new Error("Ruta inválida.");
  if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.startsWith("\\")) {
    throw new Error("Ruta absoluta no permitida.");
  }
  const parts = rel.split(/[\\/]+/).filter((p) => p !== "" && p !== ".");
  if (parts.some((p) => p === "..")) throw new Error("No se permite salir de la carpeta del proyecto.");
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Ruta fuera del proyecto.");
  return full;
}

export function parseCommand(line) {
  if (typeof line !== "string" || line.length > 300) throw new Error("Comando inválido.");
  if (FORBIDDEN.test(line)) throw new Error("El comando tiene caracteres no permitidos.");
  const parts = line.trim().split(/\s+/).filter(Boolean);
  // Solo "node <script.js|mjs>" o "python|python3 <script.py>": un archivo, sin opciones extra.
  const interpreter = INTERPRETERS[parts[0]];
  if (interpreter) {
    const script = parts[1] ?? "";
    if (parts.length !== 2 || !interpreter.test.test(script) || script.startsWith("-") || script.includes("..")) {
      throw new Error(`Solo se puede ejecutar ${parts[0]} con un archivo ${interpreter.label} del proyecto.`);
    }
    return parts;
  }
  const allowed = ALLOWED_COMMANDS.some((prefix) => prefix.every((p, i) => parts[i] === p));
  if (!allowed) throw new Error(`Comando no permitido: ${parts.slice(0, 2).join(" ") || "(vacío)"}`);
  return parts;
}

function runProcess(cwd, file, args, { shell = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      shell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_PAGER: "cat", CI: "1" },
    });
    let out = "";
    let timedOut = false;
    const add = (chunk) => {
      if (out.length < MAX_OUT * 2) out += chunk.toString();
    };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, output: error.message, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: timedOut ? -2 : code,
        output: timedOut
          ? `${out.slice(0, MAX_OUT)}\n\nComando detenido: superó el límite de ${TIMEOUT_MS / 1000}s.`
          : out.slice(0, MAX_OUT),
        timedOut,
      });
    });
  });
}

async function checkReal(realRoot, full) {
  let real;
  try {
    real = await fs.realpath(full);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    throw new Error("Ruta fuera del proyecto (enlace simbólico).");
  }
}

async function walk(root, dir = root, out = []) {
  if (out.length >= MAX_TREE) return out;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= MAX_TREE) break;
    if (IGNORED.has(entry.name) || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, full, out);
    else if (entry.isFile()) {
      const stat = await fs.stat(full);
      out.push({
        path: path.relative(root, full).split(path.sep).join("/"),
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
  }
  return out;
}

function looksText(buffer) {
  return !buffer.subarray(0, 1000).includes(0);
}

export function createAgent({ root, token }) {
  if (!token || token.length < 16) throw new Error("El token debe tener al menos 16 caracteres.");
  const realRoot = fsSync.realpathSync(path.resolve(root));
  const expected = Buffer.from(`Bearer ${token}`);

  const authorized = (req) => {
    const given = Buffer.from(String(req.headers.authorization ?? ""));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  };

  const safe = async (rel) => {
    const full = resolveInside(realRoot, rel);
    await checkReal(realRoot, full);
    return full;
  };

  const handlers = {
    "/health": async () => ({ ok: true, project: path.basename(realRoot) }),

    "/fs/tree": async () => ({ files: await walk(realRoot) }),

    "/fs/read": async ({ path: rel }) => {
      const full = await safe(rel);
      const stat = await fs.stat(full);
      if (stat.size > MAX_READ) throw new Error("El archivo es demasiado grande para leerlo completo.");
      const buffer = await fs.readFile(full);
      if (!looksText(buffer)) throw new Error("No es un archivo de texto.");
      return { path: rel, content: buffer.toString("utf8") };
    },

    "/fs/write": async ({ path: rel, content }) => {
      if (typeof content !== "string" || content.length > MAX_READ * 4) throw new Error("Contenido inválido.");
      const full = await safe(rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf8");
      return { ok: true, path: rel };
    },

    "/fs/mkdir": async ({ path: rel }) => {
      await fs.mkdir(await safe(rel), { recursive: true });
      return { ok: true, path: rel };
    },

    "/fs/delete": async ({ path: rel }) => {
      if (!rel || rel === "." || rel === "/") throw new Error("No se puede borrar la carpeta del proyecto.");
      await fs.rm(await safe(rel), { recursive: true, force: false });
      return { ok: true, path: rel };
    },

    "/fs/move": async ({ path: from, toPath }) => {
      const source = await safe(from);
      const target = await safe(toPath);
      if (fsSync.existsSync(target)) throw new Error("El destino ya existe.");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(source, target);
      return { ok: true, path: from, toPath };
    },

    "/fs/search": async ({ query }) => {
      if (typeof query !== "string" || query.length < 2) throw new Error("La búsqueda necesita al menos 2 caracteres.");
      const needle = query.toLowerCase();
      const matches = [];
      for (const file of (await walk(realRoot)).filter((f) => f.size <= MAX_READ)) {
        const buffer = await fs.readFile(path.join(realRoot, file.path));
        if (!looksText(buffer)) continue;
        const lines = buffer.toString("utf8").split("\n");
        lines.forEach((line, i) => {
          if (matches.length < 100 && line.toLowerCase().includes(needle)) {
            matches.push({ path: file.path, line: i + 1, text: line.trim().slice(0, 200) });
          }
        });
        if (matches.length >= 100) break;
      }
      return { matches };
    },

    "/git/status": async () => runProcess(realRoot, "git", ["status", "--short", "--branch"]),
    "/git/log": async () => runProcess(realRoot, "git", ["log", "--oneline", "-n", "20"]),
    "/git/diff": async ({ path: rel }) => {
      const args = ["diff"];
      if (rel) {
        const full = await safe(rel);
        args.push("--", path.relative(realRoot, full));
      }
      return runProcess(realRoot, "git", args);
    },
    "/git/commit": async ({ message }) => {
      if (typeof message !== "string" || !message.trim() || message.length > 200 || message.startsWith("-")) {
        throw new Error("Mensaje de commit inválido.");
      }
      const added = await runProcess(realRoot, "git", ["add", "-A"]);
      if (added.code !== 0) return added;
      return runProcess(realRoot, "git", ["commit", "-m", message.trim()]);
    },

    "/shell/run": async ({ command }) => {
      const parts = parseCommand(command);
      const [file, ...args] = parts;
      if (INTERPRETERS[file]) {
        // El script tiene que estar dentro del proyecto (y no ser un enlace que salga de él).
        const full = await safe(args[0]);
        if (!fsSync.existsSync(full)) throw new Error("El script no existe.");
        return runProcess(realRoot, file, [path.relative(realRoot, full)]);
      }
      // En Windows npm y npx son scripts .cmd: hace falta shell, y ya validamos que no haya metacaracteres.
      const useShell = process.platform === "win32";
      return runProcess(realRoot, file, args, { shell: useShell });
    },
  };

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader("Vary", "Origin");
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const send = (status, body) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    if (!authorized(req)) return send(401, { error: "Token incorrecto o ausente." });

    const route = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const handler = handlers[route];
    if (!handler) return send(404, { error: "Ruta no existe." });

    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) return send(413, { error: "Pedido demasiado grande." });
    }
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return send(400, { error: "JSON inválido." });
    }
    try {
      send(200, { result: await handler(body) });
    } catch (error) {
      send(400, { error: error.message });
    }
  });
}

function parseArgs(argv) {
  const args = { root: process.cwd(), port: 7878, token: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = argv[++i];
    else if (argv[i] === "--port") args.port = Number(argv[++i]);
    else if (argv[i] === "--token") args.token = argv[++i];
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const token = args.token ?? crypto.randomBytes(24).toString("base64url");
  const server = createAgent({ root: args.root, token });
  server.listen(args.port, "127.0.0.1", () => {
    console.log(`Forja agente escuchando en http://127.0.0.1:${args.port}`);
    console.log(`Carpeta del proyecto: ${path.resolve(args.root)}`);
    console.log(`Token (pegalo en Forja): ${token}`);
    console.log("Dejá esta ventana abierta mientras uses Forja. Ctrl+C para cortar.");
  });
}
