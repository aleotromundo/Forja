import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateResponse } from "@lovable.dev/ai-gateway";
import { buildSlots, extractJson, prioritizeSlots } from "./ai-providers";
import { LEAD_ROLE, enforceMode, modeInstructions, pickTeam, specialistPrompt } from "./agents";
import { MAX_CONTEXT_CHARS, MAX_CONTEXT_FILE_CHARS, MAX_CONTEXT_FILES } from "./chat-context";
import { isSafeRelativePath } from "./paths";

const InputSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(40000) }))
    .min(1)
    .max(40),
  files: z
    .array(z.object({ path: z.string(), content: z.string().max(MAX_CONTEXT_FILE_CHARS) }))
    .max(MAX_CONTEXT_FILES)
    .superRefine((files, ctx) => {
      const total = files.reduce((sum, file) => sum + file.content.length, 0);
      if (total > MAX_CONTEXT_CHARS)
        ctx.addIssue({
          code: z.ZodIssueCode.too_big,
          maximum: MAX_CONTEXT_CHARS,
          type: "string",
          inclusive: true,
          message: "El contexto supera el límite permitido.",
        });
    }),
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

export interface AiStatus {
  connected: boolean;
  providers: string[];
}

const PROVIDER_TIMEOUT_MS = 8_000;
const PROVIDER_BUDGET_MS = 12_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function withTimeout<T>(operation: Promise<T>, provider: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${provider} no respondió en ${PROVIDER_TIMEOUT_MS / 1000}s`)),
      PROVIDER_TIMEOUT_MS,
    );
    operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const EDIT_REQUEST =
  /\b(modific[aá]|cambi[aá]|reemplaz[aá]|agreg[aá]|añad[ií]|cre[aá]|elimin[aá]|borr[aá]|correg[ií]|arregl[aá]|implement[aá]|hac[eé]|actualiz[aá]|refactoriz[aá]|aplic[aá])\b/i;

function naturalizeReply(text: string) {
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/^\s*#{1,6}\s+/gm, "")
        .replace(/^\s*[-*]\s+/gm, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__([^_\n]+)__/g, "$1")
        .replace(/\n{3,}/g, "\n\n");
    })
    .join("")
    .trim();
}

export const getAiStatus = createServerFn({ method: "GET" }).handler((): AiStatus => {
  const slots = buildSlots(process.env as Record<string, string | undefined>);
  return {
    connected: slots.length > 0,
    providers: [...new Set(slots.map((slot) => slot.provider))],
  };
});

const SYSTEM = `Sos Forja, un asistente de programación integrado en un editor tipo VS Code.
El usuario trabaja sobre una carpeta local. Recibís la lista de archivos del proyecto y el contenido de los archivos relevantes.
Cuando el usuario pida cambios, modificá los archivos directamente.
Respondé SIEMPRE y SOLO con un objeto JSON válido con esta forma:
{"delegate": false, "reply": "explicación breve en el idioma del usuario (markdown permitido)", "edits": [{"path": "ruta/relativa.ext", "action": "write", "content": "CONTENIDO COMPLETO DEL ARCHIVO"}]}
Reglas:
- "content" debe ser el archivo COMPLETO final, nunca fragmentos ni "...".
- Para borrar un archivo usá {"path": "...", "action": "delete"}.
- Podés crear archivos nuevos con rutas nuevas.
- Si solo es una pregunta, devolvé "edits": [].
- Hacé cambios quirúrgicos: modificá solamente los archivos y las líneas necesarias para cumplir el pedido.
- No refactorices, reformatees ni limpies código no relacionado. No cambies nombres, dependencias, arquitectura o estilos existentes sin pedirlo.
- Antes de editar, identificá qué puede romperse: imports, tipos, contratos, rutas, estado, estilos y comportamiento relacionado.
- Conservá la API y el comportamiento existente fuera del alcance solicitado. Si necesitás tocar un segundo archivo para mantener consistencia, explicá por qué.
- Si el pedido es ambiguo o requiere decidir entre alternativas incompatibles, no inventes: hacé una pregunta breve antes de editar.
- Después de editar, revisá mentalmente los usos del código cambiado y ejecutá o recomendá la validación más cercana.
- Escribí la respuesta como una persona: español natural, directo y amable, con párrafos cortos.
- No uses listas con guiones o asteriscos, títulos Markdown ni separadores salvo que sean realmente necesarios.
- No repitas la consigna ni cierres con frases genéricas. Para un saludo o una consulta simple, respondé en una o dos frases.
- Reservá Markdown para nombres de archivos, comandos y bloques de código; no llenes la respuesta de negritas.
- Usá rutas relativas exactamente como aparecen en la lista.
- Cuando expliques una parte concreta del código, citá la ruta y la línea así: src/lib/archivo.ts:42. Los números "N| " que aparecen al inicio de cada línea del contexto son solo referencias: nunca los copies dentro del "content" de un edit.`;

const RECEIVER_ROLE = `ROL: sos el receptor principal de Forja y el único interlocutor inicial.
Primero decidí si el pedido necesita trabajo real sobre el proyecto.
Poné "delegate": false para saludos, preguntas generales, explicaciones, ideas o conversaciones que no requieren analizar varios archivos.
Poné "delegate": true solamente si hace falta inspeccionar o modificar el proyecto, preparar un plan técnico con contexto del código o resolver un trabajo complejo.
En MODO MODIFICAR, si el usuario pide modificar, cambiar, reemplazar, agregar, eliminar, corregir, implementar o aplicar algo en el código, poné siempre "delegate": true. No devuelvas código para copiar en "reply": el líder debe devolver edits para que Forja pueda aplicarlos.
Cuando "delegate" sea false, respondé directamente y no pidas especialistas. Cuando sea true, no inventes una respuesta final todavía: indicá brevemente que vas a delegar el trabajo.`;

export const askForja = createServerFn({ method: "POST" })
  .validator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<AiResult> => {
    const slots = prioritizeSlots(buildSlots(process.env as Record<string, string | undefined>));
    if (slots.length === 0) {
      throw new Error(
        "No hay claves de IA configuradas. Agregá GROQ_API_KEYS, GEMINI_API_KEYS u OPENROUTER_API_KEYS.",
      );
    }

    let context =
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
      const providerDeadlines = new Map<string, number>();
      for (const slot of order) {
        const deadline = providerDeadlines.get(slot.provider) ?? Date.now() + PROVIDER_BUDGET_MS;
        providerDeadlines.set(slot.provider, deadline);
        if (Date.now() >= deadline) continue;
        try {
          let text = "";
          if (slot.provider === "lovable") {
            const r = await withTimeout(
              generateResponse({
                model: "openai/gpt-6-astra",
                instructions: `${system}\n\n${context}`,
                input: convo
                  .map((m) => `${m.role === "user" ? "USUARIO" : "ASISTENTE"}: ${m.content}`)
                  .join("\n\n"),
              }),
              slot.provider,
            );
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
            const models =
              slot.provider === "gemini"
                ? [...new Set([slot.model, "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"])]
                : [slot.model];
            let res: Response | undefined;
            let model = slot.model;
            for (const candidate of models) {
              if (Date.now() >= deadline) break;
              model = candidate;
              for (let attempt = 0; attempt < 2; attempt++) {
                if (Date.now() >= deadline) break;
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
                res = await fetch(slot.url, {
                  method: "POST",
                  headers,
                  signal: controller.signal,
                  body: JSON.stringify({
                    model: candidate,
                    messages: [
                      { role: "system", content: system },
                      { role: "system", content: context },
                      ...convo,
                    ],
                    temperature: json ? 0.2 : 0.4,
                  }),
                }).finally(() => clearTimeout(timer));
                if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === 1) break;
                await wait(700);
              }
              if (res?.ok || res?.status !== 503 || candidate === models.at(-1)) break;
            }
            if (!res) throw new Error(`${slot.provider} no devolvió una respuesta`);
            if (!res.ok) {
              const body = await res.text();
              const reason =
                res.status === 503
                  ? "alta demanda temporal"
                  : res.status === 429
                    ? "límite de solicitudes o cuota"
                    : "respuesta de error";
              errors.push(
                `${slot.envVar} (${slot.provider} · ${model}) [${res.status} · ${reason}]: ${body.slice(0, 200)}`,
              );
              console.error(
                `AI provider failed ${slot.envVar} / ${slot.provider} / ${model} [${res.status}]: ${body.slice(0, 500)}`,
              );
              continue;
            }
            const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
            text = j.choices?.[0]?.message?.content ?? "";
            if (text) return { text, provider: slot.provider, model };
          }
          if (text) return { text, provider: slot.provider, model: slot.model };
        } catch (err) {
          const error = err as Error;
          errors.push(
            `${slot.envVar} (${slot.provider} · ${slot.model}): ${error.name === "AbortError" ? `no respondió en ${PROVIDER_TIMEOUT_MS / 1000}s` : error.message}`,
          );
        }
      }
      throw new Error(`Todos los proveedores fallaron:\n${errors.join("\n")}`);
    };

    const lastUser = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const requestsWebSearch =
      /\b(busca|buscá|internet|web|online|documentación actual|actualizado|actualizada)\b/i.test(
        lastUser,
      );
    if (requestsWebSearch) {
      const webSlot = slots.find(
        (slot) => slot.provider === "groq" && slot.model === "openai/gpt-oss-20b",
      );
      if (webSlot) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
          const webResponse = await fetch(webSlot.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${webSlot.key}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: webSlot.model,
              messages: [
                {
                  role: "system",
                  content:
                    "Buscá en Internet lo necesario para responder la consulta. Devolvé un resumen breve con las fuentes o URLs relevantes.",
                },
                { role: "user", content: lastUser },
              ],
              temperature: 0.2,
              tool_choice: "required",
              tools: [{ type: "browser_search" }],
            }),
          }).finally(() => clearTimeout(timer));
          if (webResponse.ok) {
            const result = (await webResponse.json()) as {
              choices?: { message?: { content?: string } }[];
            };
            const webText = result.choices?.[0]?.message?.content;
            if (webText) context += `\n\nRESULTADO DE BÚSQUEDA WEB:\n${webText.slice(0, 12_000)}`;
          }
        } catch {
          // The code task can continue with local project context if search is unavailable.
        }
      }
    }
    const receiver = await call(
      `${SYSTEM}\n\n${RECEIVER_ROLE}\n${modeInstructions(data.mode)}`,
      data.messages,
      slots,
      true,
    );
    const route = extractJson(receiver.text) as {
      delegate?: unknown;
      reply?: unknown;
      edits?: unknown;
    } | null;
    const editIntent = data.mode === "edit" && EDIT_REQUEST.test(lastUser);
    if (!route || (route.delegate !== true && !editIntent)) {
      return {
        reply: naturalizeReply(typeof route?.reply === "string" ? route.reply : receiver.text),
        edits: [],
        provider: receiver.provider,
        model: receiver.model,
        team: [],
      };
    }

    // The receiver decided that project work is needed: specialists now work in parallel.
    const team = pickTeam(lastUser, 2);
    const notes = await Promise.all(
      team.map((agent) =>
        call(
          specialistPrompt(agent, data.mode),
          data.messages.slice(-6),
          prioritizeSlots(slots),
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

    // The receiver returns as lead and integrates the specialists' notes.
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
        reply: naturalizeReply(lead.text),
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
            isSafeRelativePath(e.path) &&
            (e.action === "delete" || typeof e.content === "string"),
        )
      : [];
    return {
      reply: naturalizeReply(typeof parsed.reply === "string" ? parsed.reply : "Listo."),
      edits: enforceMode(
        data.mode,
        edits.map((e) => ({ ...e, action: e.action === "delete" ? "delete" : "write" })),
      ),
      provider: lead.provider,
      model: lead.model,
      team: teamNames,
    };
  });
