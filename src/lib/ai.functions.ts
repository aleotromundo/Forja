import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateResponse } from "@lovable.dev/ai-gateway";
import { buildSlots, extractJson, rotateSlots } from "./ai-providers";
import { LEAD_ROLE, enforceMode, modeInstructions, pickTeam, specialistPrompt } from "./agents";

const InputSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(40000) }))
    .min(1)
    .max(40),
  files: z.array(z.object({ path: z.string(), content: z.string() })).max(40),
  tree: z.array(z.string()).max(3000),
  activePath: z.string().nullable(),
  mode: z.enum(["plan", "edit"]).default("edit"),
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
  team: string[];
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
- Usá rutas relativas exactamente como aparecen en la lista.
- Cuando expliques una parte concreta del código, citá la ruta y la línea así: src/lib/archivo.ts:42. Los números "N| " que aparecen al inicio de cada línea del contexto son solo referencias: nunca los copies dentro del "content" de un edit.`;

let counter = 0;

export const askForja = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<AiResult> => {
    const slots = rotateSlots(
      buildSlots(process.env as Record<string, string | undefined>),
      counter++,
    );
    if (slots.length === 0) {
      throw new Error(
        "No hay claves de IA configuradas. Agregá GROQ_API_KEYS, GEMINI_API_KEYS u OPENROUTER_API_KEYS.",
      );
    }

    const context =
      `ARCHIVOS DEL PROYECTO:\n${data.tree.join("\n")}\n\n` +
      (data.activePath ? `ARCHIVO ACTIVO: ${data.activePath}\n\n` : "") +
      data.files
        .map(
          (f) =>
            `===== ${f.path} =====\n${f.content
              .split("\n")
              .map((line, i) => `${i + 1}| ${line}`)
              .join("\n")}`,
        )
        .join("\n\n");

    type Msg = { role: "system" | "user" | "assistant"; content: string };
    const call = async (system: string, convo: Msg[], order: typeof slots, json: boolean) => {
      const errors: string[] = [];
      for (const slot of order) {
        try {
          let text = "";
          if (slot.provider === "lovable") {
            const r = await generateResponse({
              model: "openai/gpt-6-astra",
              instructions: `${system}\n\n${context}`,
              input: convo
                .map((m) => `${m.role === "user" ? "USUARIO" : "ASISTENTE"}: ${m.content}`)
                .join("\n\n"),
            });
            for (const item of r.output ?? []) {
              if (item.type === "message")
                for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
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
              body: JSON.stringify({
                model: slot.model,
                messages: [
                  { role: "system", content: system },
                  { role: "system", content: context },
                  ...convo,
                ],
                temperature: json ? 0.2 : 0.4,
              }),
            });
            if (!res.ok) {
              const body = await res.text();
              errors.push(`${slot.provider} [${res.status}]: ${body.slice(0, 200)}`);
              console.error(
                `AI provider failed ${slot.provider} [${res.status}]: ${body.slice(0, 500)}`,
              );
              continue;
            }
            const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
            text = j.choices?.[0]?.message?.content ?? "";
          }
          if (text) return { text, provider: slot.provider, model: slot.model };
        } catch (err) {
          errors.push(`${slot.provider}: ${(err as Error).message}`);
        }
      }
      throw new Error(`Todos los proveedores fallaron:\n${errors.join("\n")}`);
    };

    // 1) Specialists work in parallel, each starting on a different key/provider.
    const lastUser = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const team = pickTeam(lastUser);
    const notes = await Promise.all(
      team.map((agent, i) =>
        call(
          specialistPrompt(agent, data.mode),
          data.messages.slice(-6),
          rotateSlots(slots, i + 1),
          false,
        )
          .then((r) => ({ agent, text: r.text.slice(0, 4000) }))
          .catch(() => null),
      ),
    );
    const done = notes.filter((n): n is NonNullable<typeof n> => n !== null);
    const teamNotes = done.length
      ? `\n\nAPORTES DEL EQUIPO (integralos con criterio en tu respuesta y tus edits):\n` +
        done.map((n) => `--- ${n.agent.name} ---\n${n.text}`).join("\n\n")
      : "";

    // 2) The lead integrates everything and returns the JSON with edits.
    const lead = await call(
      `${SYSTEM}\n\n${LEAD_ROLE}\n${modeInstructions(data.mode)}${teamNotes}`,
      data.messages,
      slots,
      true,
    );
    const teamNames = done.map((n) => n.agent.name);
    const parsed = extractJson(lead.text) as { reply?: unknown; edits?: unknown } | null;
    if (!parsed)
      return {
        reply: lead.text,
        edits: [],
        provider: lead.provider,
        model: lead.model,
        team: teamNames,
      };
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
      edits: enforceMode(
        data.mode,
        edits.map((e) => ({ ...e, action: e.action === "delete" ? "delete" : "write" })),
      ),
      provider: lead.provider,
      model: lead.model,
      team: teamNames,
    };
  });
