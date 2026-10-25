import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  action: "write" | "delete" | "mkdir" | "move" | "open";
  content?: string;
  toPath?: string;
}
export interface AiResult {
  reply: string;
  edits: AiEdit[];
  provider: string;
  model: string;
  team: string[];
  more?: boolean;
}

export interface AiStatus {
  connected: boolean;
  providers: string[];
}

const PROVIDER_TIMEOUT_MS = 60_000;
const GROQ_SAFE_TOKENS = 6_000;
const PROVIDER_BUDGET_MS = 90_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MODEL_FALLBACK_STATUS = new Set([400, 404, 429, 500, 502, 503, 504]);

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

function enabledSlots(env: Record<string, string | undefined>) {
  const slots = buildSlots(env);
  const allowed = (env["FORJA_ENABLED_PROVIDERS"] ?? "groq,gemini")
    .split(/[\s,;]+/)
    .filter((provider): provider is "groq" | "gemini" | "openrouter" =>
      ["groq", "gemini", "openrouter"].includes(provider as never),
    );
  const providers = allowed.length ? allowed : ["groq", "gemini"];
  const active = slots.filter((slot) => providers.includes(slot.provider));
  // A stale or incomplete provider selector must never disable every configured key.
  return active.length ? active : slots;
}

const EDIT_REQUEST =
  /\b(modific[aá]|cambi[aá]|reemplaz[aá]|agreg[aá]|añad[ií]|cre[aá]|elimin[aá]|borr[aá]|correg[ií]|arregl[aá]|implement[aá]|hac[eé]|actualiz[aá]|refactoriz[aá]|aplic[aá]|continu[aá]|abr[ií])(?![\wáéíóúñ])/i;

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
  const slots = enabledSlots(process.env as Record<string, string | undefined>);
  return {
    connected: slots.length > 0,
    providers: [...new Set(slots.map((slot) => slot.provider))],
  };
});

const SYSTEM = `Sos Forja, un asistente de programación integrado en un editor tipo VS Code.
El usuario trabaja sobre una carpeta local. Recibís la lista de archivos del proyecto y el contenido de los archivos relevantes.
Cuando el usuario pida cambios, modificá los archivos directamente.
Respondé SIEMPRE y SOLO con un objeto JSON válido con esta forma:
{"delegate": false, "reply": "explicación breve en el idioma del usuario (markdown permitido)", "edits": [{"path": "ruta/relativa.ext", "action": "write|delete|mkdir|move", "content": "CONTENIDO COMPLETO DEL ARCHIVO", "toPath": "ruta/destino"}], "continuar": false}
Reglas:
- "content" debe ser el archivo COMPLETO final, nunca fragmentos ni "...".
- Para borrar un archivo usá {"path": "...", "action": "delete"}.
- Podés crear archivos nuevos con rutas nuevas.
- Para crear una carpeta usá {"path": "ruta/de/carpeta", "action": "mkdir"}.
- Para mover o renombrar usá {"path": "ruta/origen", "action": "move", "toPath": "ruta/destino"}.
- Todas las rutas deben ser relativas a la carpeta autorizada, sin segmentos de traversal, sin rutas absolutas y sin salir del workspace.
- Si solo es una pregunta, devolvé "edits": [].
- Si el usuario pidió un cambio, aplicalo con "edits" en esta misma respuesta. No pidas permiso ni confirmación para editar, salvo que el pedido sea ambiguo.
- Nunca escribas en "reply" tu razonamiento, planes internos ni JSON. "reply" es solo la explicación para el usuario.
- Nunca mandes un "write" con "content" vacío.
- Si el pedido necesita varios pasos, hacé solo el primer paso con edits y poné "continuar": true. Forja aplica tus cambios, te cuenta qué quedó hecho y te pide el siguiente paso. Cuando no quede nada, poné "continuar": false.
- Para abrir un archivo en Forja después de los cambios, usá {"path": "ruta/relativa.ext", "action": "open"}. No abre nada en tu computadora; solo lo muestra en la app.
- Memoria del proyecto: si existe .forja/memoria.md, es la memoria del proyecto y tiene que respetarse. Cuando aprendas algo duradero (decisiones, convenciones, qué está hecho y qué falta), actualizalo con un "write" que traiga el contenido completo: lo anterior más lo nuevo. Mantenelo corto.
- Nunca le pidas al usuario que pegue el contenido de un archivo. Si necesitás un archivo que no está en el contexto, nombralo con su ruta exacta en "reply": Forja lo carga y te responde de nuevo. Si podés crearlo o reemplazarlo completo sin verlo, hacelo y explicá la decisión.
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
    const slots = prioritizeSlots(enabledSlots(process.env as Record<string, string | undefined>));
    if (slots.length === 0) {
      throw new Error(
        "No hay claves de IA disponibles en este deployment. Revisá GROQ_API_KEY(S), GEMINI_API_KEY(S), OPENROUTER_API_KEY(S) en Vercel.",
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
      // Estimación gruesa: unos 3.5 caracteres por token.
      const approxTokens =
        (system.length + context.length + convo.reduce((n, m) => n + m.content.length, 0)) / 3.5;
      const providerDeadlines = new Map<string, number>();
      for (const slot of order) {
        const deadline = providerDeadlines.get(slot.provider) ?? Date.now() + PROVIDER_BUDGET_MS;
        providerDeadlines.set(slot.provider, deadline);
        if (Date.now() >= deadline) continue;
        // Groq free tier limita ~8000 tokens por minuto: un pedido más grande siempre falla con 413.
        if (slot.provider === "groq" && approxTokens > GROQ_SAFE_TOKENS) continue;
        try {
          let text = "";
          {
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
                ? [
                    ...new Set([
                      slot.model,
                      "gemini-3-flash-preview",
                    ]),
                  ]
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
                const messages =
                  slot.provider === "gemini"
                    ? [
                        { role: "system" as const, content: `${system}\n\n${context}` },
                        ...convo.filter((message) => message.role !== "system"),
                      ]
                    : [
                        { role: "system" as const, content: system },
                        { role: "system" as const, content: context },
                        ...convo,
                      ];
                res = await fetch(slot.url, {
                  method: "POST",
                  headers,
                  signal: controller.signal,
                  body: JSON.stringify({
                    model: candidate,
                    messages,
                    ...(slot.provider === "gemini" ? {} : { temperature: json ? 0.2 : 0.4 }),
                  }),
                }).finally(() => clearTimeout(timer));
                if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === 1) break;
                await wait(700);
              }
              if (
                res?.ok ||
                !MODEL_FALLBACK_STATUS.has(res?.status ?? 0) ||
                candidate === models.at(-1)
              )
                break;
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
    const parsed = extractJson(lead.text) as {
      reply?: unknown;
      edits?: unknown;
      continuar?: unknown;
    } | null;
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
            ["write", "delete", "mkdir", "move", "open"].includes(e.action) &&
            (e.action === "delete" ||
              e.action === "mkdir" ||
              e.action === "open" ||
              (e.action === "move" &&
                typeof e.toPath === "string" &&
                isSafeRelativePath(e.toPath)) ||
              (e.action === "write" && typeof e.content === "string")),
        )
      : [];
    const safeEdits: AiEdit[] = enforceMode(
      data.mode,
      edits.map((e): AiEdit => ({
        path: e.path,
        action: e.action,
        ...(typeof e.content === "string" ? { content: e.content } : {}),
        ...(typeof e.toPath === "string" ? { toPath: e.toPath } : {}),
      })),
    );
    if (safeEdits.length > 0) {
      const verificationPrompt = `Sos el verificador de cambios de Forja. Revisá el pedido original del usuario y la propuesta del líder contra los archivos del proyecto que recibiste.
Compará exactamente qué se pidió con qué archivos y contenido se propone modificar. Verificá alcance mínimo, imports, tipos, referencias, estado, rutas, seguridad, responsive y posibles regresiones.
No escribas archivos ni propongas una solución nueva. Devolvé SOLO JSON válido con esta forma:
{"approved":true,"summary":"explicación breve","issues":["problema concreto"]}
Usá approved=false si falta algo, sobra un archivo, el contenido está incompleto, hay una regresión probable o no podés verificar el cambio con seguridad.

PEDIDO ORIGINAL:\n${lastUser}\n\nRESPUESTA DEL LÍDER:\n${typeof parsed.reply === "string" ? parsed.reply : ""}\n\nEDITS PROPUESTOS:\n${JSON.stringify(safeEdits)}`;
      try {
        const verification = await call(
          `${SYSTEM}\n\nMODO VERIFICACIÓN: no generes edits. Tu única tarea es revisar la propuesta y devolver el JSON de verificación solicitado.`,
          [{ role: "user", content: verificationPrompt }],
          prioritizeSlots(slots),
          true,
        );
        const verdict = extractJson(verification.text) as {
          approved?: unknown;
          summary?: unknown;
          issues?: unknown;
        } | null;
        const approved = verdict?.approved === true;
        const issues = Array.isArray(verdict?.issues)
          ? verdict.issues.filter((issue): issue is string => typeof issue === "string").slice(0, 5)
          : [];
        const summary = typeof verdict?.summary === "string" ? verdict.summary : "";
        if (!approved) {
          return {
            reply: naturalizeReply(
              `El verificador detuvo los cambios antes de tocar los archivos. ${summary}${
                issues.length ? `\n\nProblemas detectados:\n${issues.join("\n")}` : ""
              }`,
            ),
            edits: [],
            provider: lead.provider,
            model: lead.model,
            team: [...teamNames, "Verificador"],
          };
        }
        return {
          reply: naturalizeReply(
            `${typeof parsed.reply === "string" ? parsed.reply : "Listo."}${
              summary ? `\n\nVerificación: ${summary}` : ""
            }`,
          ),
          edits: safeEdits,
          provider: lead.provider,
          model: lead.model,
          team: [...teamNames, "Verificador"],
        };
      } catch (error) {
        return {
          reply: `No apliqué los cambios porque el verificador no pudo responder de forma segura: ${(error as Error).message}`,
          edits: [],
          provider: lead.provider,
          model: lead.model,
          team: [...teamNames, "Verificador"],
        };
      }
    }
    return {
      reply: naturalizeReply(typeof parsed.reply === "string" ? parsed.reply : "Listo."),
      edits: safeEdits,
      more: parsed.continuar === true && safeEdits.length > 0,
      provider: lead.provider,
      model: lead.model,
      team: teamNames,
    };
  });
