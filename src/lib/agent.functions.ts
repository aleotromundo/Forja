import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prioritizeSlots, type ProviderSlot } from "./ai-providers";
import { enabledSlots } from "./ai.functions";
import { AGENT_SYSTEM, AGENT_TOOLS } from "./agent-tools";
import { friendlyFailure, logFailure } from "./friendly-errors";

const TIMEOUT_MS = 60_000;
// El plan gratis de Groq rechaza pedidos grandes por tokens por minuto.
const GROQ_SAFE_TOKENS = 6_000;
// Errores temporales del proveedor: vale la pena reintentar el mismo.
const TRANSIENT = new Set([500, 502, 503, 504]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const AgentInput = z.object({
  messages: z.array(z.any()).min(1).max(200),
  system: z.string().max(6000).optional(),
  noTools: z.boolean().optional(),
});

/** Forma plana para cruzar el servidor (el serializador no acepta uniones). */
export interface AgentStepWire {
  type: "final" | "tool_calls";
  reply: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assistantMessage: any;
  calls: { id: string; name: string; args: any }[];
  provider: string;
  model: string;
}

type SlotOutcome =
  | { kind: "ok"; step: AgentStepWire }
  | { kind: "fail"; error: string; transient: boolean };

async function callSlot(
  slot: ProviderSlot,
  messages: unknown[],
  tools: typeof AGENT_TOOLS | undefined,
): Promise<SlotOutcome> {
  const label = `${slot.envVar} (${slot.provider} · ${slot.model})`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(slot.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${slot.key}` },
      body: JSON.stringify({
        model: slot.model,
        messages,
        ...(tools ? { tools, tool_choice: "auto" } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        kind: "fail",
        error: `${label} [${res.status}]: ${body.slice(0, 200)}`,
        transient: TRANSIENT.has(res.status),
      };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: unknown[] } }[];
    };
    const message = json.choices?.[0]?.message;
    if (!message) return { kind: "fail", error: `${label}: respuesta vacía`, transient: false };

    const rawCalls = (message.tool_calls ?? []) as {
      id?: string;
      function?: { name?: string; arguments?: string };
    }[];
    if (rawCalls.length > 0) {
      const calls = rawCalls.map((call, i) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          args = {};
        }
        return { id: call.id ?? `call_${i}`, name: call.function?.name ?? "", args };
      });
      return {
        kind: "ok",
        step: {
          type: "tool_calls",
          reply: "",
          assistantMessage: {
            role: "assistant",
            content: message.content ?? "",
            tool_calls: rawCalls,
          },
          calls,
          provider: slot.provider,
          model: slot.model,
        },
      };
    }
    return {
      kind: "ok",
      step: {
        type: "final",
        reply: (message.content ?? "").trim() || "Listo.",
        assistantMessage: {},
        calls: [],
        provider: slot.provider,
        model: slot.model,
      },
    };
  } catch (error) {
    const timedOut = (error as Error).name === "AbortError";
    return {
      kind: "fail",
      error: `${label}: ${timedOut ? `no respondió en ${TIMEOUT_MS / 1000}s` : (error as Error).message}`,
      // Una demora larga no se reintenta: en Vercel el tiempo de la función es limitado.
      transient: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Un paso del agente: el modelo pide herramientas o responde con texto final. */
export const askAgent = createServerFn({ method: "POST" })
  .inputValidator(AgentInput)
  .handler(async ({ data }): Promise<AgentStepWire> => {
    const slots = prioritizeSlots(enabledSlots(process.env as Record<string, string | undefined>));
    if (!slots.length) throw new Error("No hay claves de IA configuradas en Vercel.");

    const messages = [{ role: "system", content: data.system ?? AGENT_SYSTEM }, ...data.messages];
    const tools = data.noTools ? undefined : AGENT_TOOLS;
    const approxTokens = JSON.stringify(messages).length / 3.5 + 1500;
    const errors: string[] = [];

    for (const slot of slots) {
      if (slot.provider === "groq" && approxTokens > GROQ_SAFE_TOKENS) continue;
      for (let attempt = 0; attempt < 3; attempt++) {
        const outcome = await callSlot(slot, messages, tools);
        if (outcome.kind === "ok") return outcome.step;
        errors.push(outcome.error);
        if (!outcome.transient || attempt === 2) break;
        await wait(attempt === 0 ? 1500 : 4000);
      }
    }
    logFailure("agent", errors);
    throw new Error(friendlyFailure(errors));
  });
