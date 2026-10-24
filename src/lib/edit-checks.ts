// Revisiones simples y deterministas de los cambios que propone la IA,
// antes de aplicarlos a la carpeta.

const REACT_HOOKS = [
  "useState",
  "useEffect",
  "useRef",
  "useMemo",
  "useCallback",
  "useContext",
  "useReducer",
  "useLayoutEffect",
] as const;

/** Hooks de React que el archivo usa pero no importa desde "react". */
export function missingReactImports(content: string): string[] {
  const missing: string[] = [];
  for (const hook of REACT_HOOKS) {
    const used = new RegExp(`\\b${hook}\\s*\\(`).test(content);
    if (!used) continue;
    const imported = new RegExp(
      `import\\s*\\{[^}]*\\b${hook}\\b[^}]*\\}\\s*from\\s*["']react["']`,
    ).test(content);
    const declared = new RegExp(`function\\s+${hook}\\b|const\\s+${hook}\\s*=`).test(content);
    if (!imported && !declared) missing.push(hook);
  }
  return missing;
}

/** Problemas que impiden aplicar un cambio, con el archivo y el motivo. */
export function editProblems(edits: { path: string; action: string; content?: string }[]) {
  const problems: string[] = [];
  for (const edit of edits) {
    if (edit.action !== "write" || typeof edit.content !== "string") continue;
    if (!/\.(tsx?|jsx?)$/.test(edit.path)) continue;
    for (const hook of missingReactImports(edit.content)) {
      problems.push(`${edit.path}: usa ${hook} sin importarlo de "react"`);
    }
  }
  return problems;
}
