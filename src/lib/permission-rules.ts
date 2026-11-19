// Permisos por recurso: cada llamada se compara con reglas `allow` / `ask` / `deny`
// sobre una acción (nombre de la herramienta) y un recurso (ruta, comando o URL).
// Gana la última regla que coincide; si ninguna coincide, se usa el valor por defecto.
// Idea tomada de OpenCode (MIT), adaptada a Forja.

export type Effect = "allow" | "ask" | "deny";

export interface Rule {
  action: string;
  resource: string;
  effect: Effect;
}

export interface Decision {
  effect: Effect;
  rule?: Rule;
}

/** Comodines: `*` cualquier secuencia, `?` un carácter. No distingue mayúsculas. */
export function wildcardMatch(pattern: string, text: string): boolean {
  const source = pattern
    .split("")
    .map((ch) => (ch === "*" ? ".*" : ch === "?" ? "." : ch.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`, "is").test(text);
}

/** Recurso que una llamada toca: ruta, comando o URL según la herramienta. */
export function resourceOf(name: string, args: Record<string, unknown>): string {
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  switch (name) {
    case "download_file":
      return str(args["url"]);
    case "download_image":
      return str(args["query"]);
    case "run_command":
      return str(args["command"]).trim();
    case "move_path":
      return str(args["path"]);
    case "git_commit":
    case "git_status":
    case "git_log":
    case "git_diff":
    case "search_text":
    case "list_files":
      return "*";
    default:
      return str(args["path"]) || "*";
  }
}

/** Reglas por defecto. Las de más abajo tienen prioridad sobre las de arriba. */
export const DEFAULT_RULES: Rule[] = [
  // Lectura: sin aprobación.
  { action: "list_files", resource: "*", effect: "allow" },
  { action: "read_file", resource: "*", effect: "allow" },
  { action: "search_text", resource: "*", effect: "allow" },
  { action: "open_file", resource: "*", effect: "allow" },
  { action: "consult_specialist", resource: "*", effect: "allow" },
  { action: "git_status", resource: "*", effect: "allow" },
  { action: "git_log", resource: "*", effect: "allow" },
  { action: "git_diff", resource: "*", effect: "allow" },
  // Cambios: piden aprobación.
  { action: "write_file", resource: "*", effect: "ask" },
  { action: "make_dir", resource: "*", effect: "ask" },
  { action: "delete_path", resource: "*", effect: "ask" },
  { action: "move_path", resource: "*", effect: "ask" },
  { action: "download_file", resource: "*", effect: "ask" },
  { action: "download_image", resource: "*", effect: "ask" },
  { action: "git_commit", resource: "*", effect: "ask" },
  { action: "run_command", resource: "*", effect: "ask" },
  // Bloqueos de seguridad.
  { action: "download_file", resource: "http://*", effect: "deny" },
  { action: "write_file", resource: ".git/*", effect: "deny" },
  { action: "write_file", resource: "*.env*", effect: "deny" },
  { action: "write_file", resource: "*.pem", effect: "deny" },
  { action: "write_file", resource: "*id_rsa*", effect: "deny" },
  { action: "delete_path", resource: ".git*", effect: "deny" },
  { action: "run_command", resource: "*git push*", effect: "deny" },
  { action: "run_command", resource: "*rm -rf*", effect: "deny" },
  { action: "run_command", resource: "*sudo *", effect: "deny" },
];

/** Decide qué pasa con una llamada. Un `deny` que coincida siempre gana; si no, la última regla que coincide; si ninguna, `fallback`. */
export function decide(
  call: { name: string; args: Record<string, unknown> },
  rules: Rule[] = DEFAULT_RULES,
  fallback: Effect = "ask",
): Decision {
  const resource = resourceOf(call.name, call.args);
  const matches = rules.filter(
    (r) => wildcardMatch(r.action, call.name) && wildcardMatch(r.resource, resource),
  );
  const denied = matches.find((r) => r.effect === "deny");
  if (denied) return { effect: "deny", rule: denied };
  const last = matches[matches.length - 1];
  return last ? { effect: last.effect, rule: last } : { effect: fallback };
}

/** Reglas «aprobar siempre» para las herramientas indicadas. Los bloqueos siguen ganando. */
export function allowAlwaysRules(tools: string[]): Rule[] {
  return [...new Set(tools)].map((action) => ({ action, resource: "*", effect: "allow" as const }));
}

export const PROJECT_RULES_PREFIX = "forja.permisos.v1:";

/** Reglas guardadas para un proyecto. Si no hay nada guardado o está dañado, devuelve []. */
export function loadProjectRules(
  storage: Pick<Storage, "getItem"> | undefined,
  project: string,
): Rule[] {
  try {
    const raw = storage?.getItem(PROJECT_RULES_PREFIX + project);
    const data = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(data) ? (data as Rule[]) : [];
  } catch {
    return [];
  }
}

export function saveProjectRules(
  storage: Pick<Storage, "setItem"> | undefined,
  project: string,
  rules: Rule[],
) {
  storage?.setItem(PROJECT_RULES_PREFIX + project, JSON.stringify(rules));
}
