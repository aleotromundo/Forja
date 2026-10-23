// Pure provider-rotation logic (no secrets here; env is passed in).

export type ProviderName = "groq" | "xai" | "gemini" | "openrouter" | "lovable";

export interface ProviderSlot {
  provider: ProviderName;
  key: string;
  envVar: string;
  url: string;
  model: string;
}

const DEFAULTS: Record<ProviderName, { url: string; model: string }> = {
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-20b",
  },
  xai: {
    url: "https://api.x.ai/v1/chat/completions",
    model: "grok-4.3",
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3-flash-preview",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-oss-20b",
  },
  lovable: {
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    model: "openai/gpt-6-astra",
  },
};

const MODEL_MIGRATIONS: Partial<Record<ProviderName, Record<string, string>>> = {
  groq: {
    // Retired for free/developer Groq plans on 2026-08-16.
    "llama-3.3-70b-versatile": "openai/gpt-oss-20b",
    "llama-3.1-8b-instant": "openai/gpt-oss-20b",
  },
};

/** Split "k1,k2 k3" (commas, spaces or newlines) into unique keys. */
export function parseKeys(...values: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    for (const k of (v ?? "").split(/[\s,;]+/)) {
      if (k && !out.includes(k)) out.push(k);
    }
  }
  return out;
}

type Env = Record<string, string | undefined>;

function keysForProvider(env: Env, provider: ProviderName) {
  const up = provider.toUpperCase();
  const numbered = Object.entries(env)
    .filter(([name, value]) => value && new RegExp(`^${up}_API_KEY_\\d+$`).test(name))
    .sort(([a], [b]) => Number(a.split("_").pop()) - Number(b.split("_").pop()))
    .flatMap(([name, value]) => parseKeys(value).map((key) => ({ key, envVar: name })));
  const named = [
    [`${up}_API_KEYS`, env[`${up}_API_KEYS`]],
    [`${up}_API_KEY`, env[`${up}_API_KEY`]],
  ].flatMap(([envVar, value]) =>
    parseKeys(value).map((key, index, values) => ({
      key,
      envVar: values.length > 1 ? `${String(envVar)} (clave ${index + 1})` : String(envVar),
    })),
  );
  const out: { key: string; envVar: string }[] = [];
  for (const entry of [...named, ...numbered]) {
    if (!out.some((current) => current.key === entry.key)) out.push(entry);
  }
  return out;
}

/**
 * Build slots interleaved across providers (groq#1, gemini#1, openrouter#1, groq#2, ...)
 * so that load spreads over every free provider. Lovable AI is always last (fallback).
 */
export function buildSlots(env: Env): ProviderSlot[] {
  const groups: ProviderSlot[][] = (["groq", "xai", "gemini", "openrouter"] as const).map((p) => {
    const up = p.toUpperCase();
    return keysForProvider(env, p).map(({ key, envVar }) => ({
      provider: p,
      key,
      envVar,
      url: DEFAULTS[p].url,
      model:
        MODEL_MIGRATIONS[p]?.[env[`${up}_MODEL`] ?? ""] ?? env[`${up}_MODEL`] ?? DEFAULTS[p].model,
    }));
  });
  const slots: ProviderSlot[] = [];
  const max = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < max; i++)
    for (const g of groups) {
      const s = g[i];
      if (s) slots.push(s);
    }
  if (env["LOVABLE_API_KEY"]) {
    slots.push({
      provider: "lovable",
      key: env["LOVABLE_API_KEY"],
      envVar: "LOVABLE_API_KEY",
      url: DEFAULTS.lovable.url,
      model: env["LOVABLE_MODEL"] || DEFAULTS.lovable.model,
    });
  }
  return slots;
}

/** Rotate rotatable slots to start at `start`; the lovable fallback stays last. */
export function rotateSlots(slots: ProviderSlot[], start: number): ProviderSlot[] {
  const rot = slots.filter((s) => s.provider !== "lovable");
  const tail = slots.filter((s) => s.provider === "lovable");
  if (rot.length === 0) return tail;
  const i = ((start % rot.length) + rot.length) % rot.length;
  return [...rot.slice(i), ...rot.slice(0, i), ...tail];
}

/** Keep the fastest primary provider first; rotate keys only inside each provider. */
export function prioritizeSlots(slots: ProviderSlot[]): ProviderSlot[] {
  const order: ProviderName[] = ["groq", "xai", "gemini", "openrouter", "lovable"];
  return order.flatMap((provider) => slots.filter((slot) => slot.provider === provider));
}

/** Extract the JSON object from a model reply that may contain fences or prose. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [text, fenced?.[1]];
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) candidates.push(text.slice(a, b + 1));
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim());
    } catch {
      /* try next */
    }
  }
  return null;
}
