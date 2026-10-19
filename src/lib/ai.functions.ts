import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateResponse } from "@lovable.dev/ai-gateway";
import { buildSlots, extractJson, rotateSlots } from "./ai-providers";
import { enforceMode, getAgent, modeInstructions } from "./agents";

const InputSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(40000) }))
    .min(1)
    .max(40),
  files: z.array(z.object({ path: z.string(), content: z.string() })).max(40),
  tree: z.array(z.string()).max(3000),
  activePath: z.string().nullable(),
  mode: z.enum(["plan", "edit"]).default("edit"),
  agentId: z.string().max(40).optional(),
});

export interface AiEdit {
  path: string;
  action: "write" | "delete";
  content?: string;
}
export interface AiResult {
  reply: string;
  edits: AiEdit[];
  provider: string;
  model: string;
}

const SYSTEM = `Sos Forja, un asistente de programación integrado en un editor tipo VS Code.
El usuario trabaja sobre una carpeta local. Recibís la lista de archivos del proyecto y el contenido de los archivos relevantes.
Cuando el usuario pida cambios, modificá los archivos directamente.
Respondé SIEMPRE y SOLO con un objeto JSON válido con esta forma:
{"reply": "explicación breve en el idioma del usuario (markdown permitido)", "edits": [{"path": "ruta/relativa.ext", "action": "write", "content": "CONTENIDO COMPLETO DEL ARCHIVO"}]}
Reglas:
- "content" debe ser el archivo COMPLETO final, nunca fragmentos ni "...".
- Para borrar un archivo usá {"path": "...", "action": "delete"}.
- Podés crear archivos nuevos con rutas nuevas.
- Si solo es una pregunta, devolvé "edits": [].
- Usá rutas relativas exactamente como aparecen en la lista.`;

let counter = 0;

export const askForja = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<AiResult> => {
    const slots = rotateSlots(buildSlots(process.env as Record<string, string | undefined>), counter++);
    if (slots.length === 0) {
      throw new Error(
        "No hay claves de IA configuradas. Agregá GROQ_API_KEYS, GEMINI_API_KEYS u OPENROUTER_API_KEYS.",
      );
    }

    const context =
      `ARCHIVOS DEL PROYECTO:\n${data.tree.join("\n")}\n\n` +
      (data.activePath ? `ARCHIVO ACTIVO: ${data.activePath}\n\n` : "") +
      data.files.map((f) => `===== ${f.path} =====\n${f.content}`).join("\n\n");

    const agent = getAgent(data.agentId);
    const system = `${SYSTEM}\n\nROL: ${agent.focus}\n${modeInstructions(data.mode)}`;
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: system },
      { role: "system", content: context },
      ...data.messages,
    ];

    const errors: string[] = [];
    for (const slot of slots) {
      try {
        let text = "";
        if (slot.provider === "lovable") {
          const r = await generateResponse({
            model: "openai/gpt-6-astra",
            instructions: `${system}\n\n${context}`,
            input: data.messages
              .map((m) => `${m.role === "user" ? "USUARIO" : "ASISTENTE"}: ${m.content}`)
              .join("\n\n"),
          });
          for (const item of r.output ?? []) {
            if (item.type === "message") {
              for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
            }
          }
        } else {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${slot.key}`,
        };
        if (slot.provider === "openrouter") {
          headers["HTTP-Referer"] = "https://forja.app";
          headers["X-Title"] = "Forja";
        }
        const res = await fetch(slot.url, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: slot.model, messages, temperature: 0.2 }),
        });
        if (!res.ok) {
          const body = await res.text();
          errors.push(`${slot.provider} [${res.status}]: ${body.slice(0, 200)}`);
          console.error(`AI provider failed ${slot.provider} [${res.status}]: ${body.slice(0, 500)}`);
          continue;
        }
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        text = json.choices?.[0]?.message?.content ?? "";
        }
        const parsed = extractJson(text) as { reply?: unknown; edits?: unknown } | null;
        if (!parsed) {
          return { reply: text || "(sin respuesta)", edits: [], provider: slot.provider, model: slot.model };
        }
        const edits = Array.isArray(parsed.edits)
          ? (parsed.edits as AiEdit[]).filter(
              (e) =>
                e &&
                typeof e.path === "string" &&
                (e.action === "delete" || typeof e.content === "string"),
            )
          : [];
        return {
          reply: typeof parsed.reply === "string" ? parsed.reply : "Listo.",
          edits: enforceMode(data.mode, edits.map((e) => ({ ...e, action: e.action === "delete" ? "delete" : "write" }))),
          provider: slot.provider,
          model: slot.model,
        };
      } catch (err) {
        errors.push(`${slot.provider}: ${(err as Error).message}`);
      }
    }
    throw new Error(`Todos los proveedores fallaron:\n${errors.join("\n")}`);
  });
