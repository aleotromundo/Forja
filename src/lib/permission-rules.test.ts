import { describe, expect, it } from "vitest";
import {
  allowAlwaysRules,
  decide,
  DEFAULT_RULES,
  loadProjectRules,
  resourceOf,
  saveProjectRules,
  wildcardMatch,
} from "./permission-rules";

describe("wildcardMatch", () => {
  it("usa * y ? sin distinguir mayúsculas", () => {
    expect(wildcardMatch("*.env*", "config/.env.local")).toBe(true);
    expect(wildcardMatch("src/?.ts", "src/a.ts")).toBe(true);
    expect(wildcardMatch("src/?.ts", "src/ab.ts")).toBe(false);
    expect(wildcardMatch("*RM -RF*", "rm -rf /")).toBe(true);
  });
});

describe("decide", () => {
  it("lectura sin aprobación", () => {
    expect(decide({ name: "read_file", args: { path: "a.ts" } }).effect).toBe("allow");
  });

  it("escritura normal pide aprobación", () => {
    expect(decide({ name: "write_file", args: { path: "src/app.ts" } }).effect).toBe("ask");
  });

  it("bloquea escribir en secretos y en .git", () => {
    expect(decide({ name: "write_file", args: { path: ".env.local" } }).effect).toBe("deny");
    expect(decide({ name: "write_file", args: { path: ".git/config" } }).effect).toBe("deny");
  });

  it("bloquea comandos peligrosos y permite las validaciones normales con aprobación", () => {
    expect(decide({ name: "run_command", args: { command: "git push origin main" } }).effect).toBe(
      "deny",
    );
    expect(decide({ name: "run_command", args: { command: "rm -rf node_modules" } }).effect).toBe(
      "deny",
    );
    expect(decide({ name: "run_command", args: { command: "pnpm run test" } }).effect).toBe("ask");
  });

  it("descargas solo por https", () => {
    expect(decide({ name: "download_file", args: { url: "http://x.com/a.png" } }).effect).toBe(
      "deny",
    );
    expect(decide({ name: "download_file", args: { url: "https://x.com/a.png" } }).effect).toBe(
      "ask",
    );
  });

  it("gana la última regla que coincide", () => {
    const rules = [
      { action: "write_file", resource: "*", effect: "allow" as const },
      { action: "write_file", resource: "docs/*", effect: "deny" as const },
    ];
    expect(decide({ name: "write_file", args: { path: "docs/x.md" } }, rules).effect).toBe("deny");
    expect(decide({ name: "write_file", args: { path: "src/x.ts" } }, rules).effect).toBe("allow");
  });

  it("usa el valor por defecto si ninguna regla coincide", () => {
    expect(decide({ name: "otra_cosa", args: {} }, DEFAULT_RULES, "allow").effect).toBe("allow");
  });
});

describe("resourceOf", () => {
  it("toma la ruta, el comando o la URL según la herramienta", () => {
    expect(resourceOf("write_file", { path: "a.ts" })).toBe("a.ts");
    expect(resourceOf("run_command", { command: " pnpm test " })).toBe("pnpm test");
    expect(resourceOf("download_file", { url: "https://x" })).toBe("https://x");
  });
});

describe("aprobar siempre", () => {
  it("una regla allow guardada no anula un bloqueo", () => {
    const rules = [...DEFAULT_RULES, ...allowAlwaysRules(["write_file", "run_command"])];
    expect(decide({ name: "write_file", args: { path: "src/a.ts" } }, rules).effect).toBe("allow");
    expect(decide({ name: "write_file", args: { path: ".env" } }, rules).effect).toBe("deny");
    expect(decide({ name: "run_command", args: { command: "git push" } }, rules).effect).toBe(
      "deny",
    );
  });

  it("guarda y recupera reglas por proyecto", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveProjectRules(storage, "mi-proyecto", allowAlwaysRules(["write_file"]));
    expect(loadProjectRules(storage, "mi-proyecto")).toEqual([
      { action: "write_file", resource: "*", effect: "allow" },
    ]);
    expect(loadProjectRules(storage, "otro")).toEqual([]);
    store.set("x", "{roto");
    expect(loadProjectRules({ getItem: () => "{roto" }, "p")).toEqual([]);
  });
});
