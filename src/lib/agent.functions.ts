import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prioritizeSlots } from "./ai-providers";
import { enabledSlots } from "./ai.functions";
import { AGENT_SYSTEM, AGENT_TOOLS } from "./agent-tools";
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

const TIMEOUT_MS = 60_000;
// El plan gratis de Groq rechaza pedidos grandes por tokens por minuto.
const GROQ_SAFE_TOKENS = 6_000;

const AgentInput = z.object({
  messages: z.array(z.any()).min(1).max(200),
});

/** Un paso del agente: el modelo pide herramientas o responde con texto final. */
export const askAgent = createServerFn({ method: "POST" })
  .inputValidator(AgentInput)
  .handler(async ({ data }): Promise<AgentStepWire> => {
    const slots = prioritizeSlots(enabledSlots(process.env as Record<string, string | undefined>));
    if (!slots.length) throw new Error("No hay claves de IA configuradas en Vercel.");

    const messages = [{ role: "system", content: AGENT_SYSTEM }, ...data.messages];
    const approxTokens = JSON.stringify(messages).length / 3.5 + 1500;
    const errors: string[] = [];

    for (const slot of slots) {
      if (slot.provider === "groq" && approxTokens > GROQ_SAFE_TOKENS) continue;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(slot.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${slot.key}` },
          body: JSON.stringify({
            model: slot.model,
            messages,
            tools: AGENT_TOOLS,
            tool_choice: "auto",
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text();
          errors.push(`${slot.envVar} (${slot.provider} · ${slot.model}) [${res.status}]: ${body.slice(0, 200)}`);
          continue;
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string | null; tool_calls?: unknown[] } }[];
        };
        const message = json.choices?.[0]?.message;
        if (!message) {
          errors.push(`${slot.envVar} (${slot.provider} · ${slot.model}): respuesta vacía`);
          continue;
        }
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
            return {
              id: call.id ?? `call_${i}`,
              name: call.function?.name ?? "",
              args,
            };
          });
          return {
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
          };
        }
        return {
          type: "final",
          reply: (message.content ?? "").trim() || "Listo.",
          assistantMessage: {},
          calls: [],
          provider: slot.provider,
          model: slot.model,
        };
      } catch (error) {
        errors.push(
          `${slot.envVar} (${slot.provider} · ${slot.model}): ${
            (error as Error).name === "AbortError" ? `no respondió en ${TIMEOUT_MS / 1000}s` : (error as Error).message
          }`,
        );
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`Todos los proveedores fallaron:\n${errors.join("\n")}`);
  });
