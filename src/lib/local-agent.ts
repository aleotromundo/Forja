// Conexión de Forja (en el navegador) con el agente local que corre en la PC del usuario.

const KEY = "forja.agent.v1";
export const AGENT_URL = "http://127.0.0.1:7878";

export interface AgentSettings {
  url: string;
  token: string;
}

export function loadAgentSettings(): AgentSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AgentSettings>;
    return typeof value.token === "string" && typeof value.url === "string"
      ? (value as AgentSettings)
      : null;
  } catch {
    return null;
  }
}

export function saveAgentSettings(settings: AgentSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* Sin localStorage, la conexión dura solo esta sesión. */
  }
}

export function clearAgentSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorar */
  }
}

/** Llama a una ruta del agente local. Devuelve `result` o lanza un error legible. */
export async function agentCall(route: string, body: unknown): Promise<unknown> {
  const settings = loadAgentSettings();
  if (!settings) throw new Error("El agente local no está conectado.");
  let res: Response;
  try {
    res = await fetch(settings.url + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.token}`,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new Error("No encuentro el agente local. ¿Está corriendo en tu PC?");
  }
  const json = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!res.ok) throw new Error(json.error ?? `El agente respondió ${res.status}.`);
  return json.result;
}

export function hasAgentSettings(): boolean {
  return loadAgentSettings() !== null;
}
