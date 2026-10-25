import { APPROVAL_REQUIRED, FILE_ACTIONS } from "./agent-tools";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ModelStep =
  | { type: "final"; reply: string; provider?: string; model?: string }
  | {
      type: "tool_calls";
      assistantMessage: Record<string, unknown>;
      calls: ToolCall[];
      provider?: string;
      model?: string;
    };

export interface AgentLoopDeps {
  ask: (messages: unknown[]) => Promise<ModelStep>;
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  approve: (calls: ToolCall[]) => Promise<boolean>;
  maxRounds?: number;
}

export interface AgentAction {
  path: string;
  action: "write" | "mkdir" | "delete" | "move";
  toPath?: string;
}

export interface AgentLoopResult {
  reply: string;
  provider: string | undefined;
  model: string | undefined;
  actions: AgentAction[];
  limitReached: boolean;
}

const MAX_TOOL_CHARS = 12_000;

/** Ejecuta pasos hasta que el modelo responda sin herramientas o se llegue al límite. */
export async function runAgentLoop(
  messages: unknown[],
  deps: AgentLoopDeps,
): Promise<AgentLoopResult> {
  const actions: AgentAction[] = [];
  const maxRounds = deps.maxRounds ?? 25;
  let provider: string | undefined;
  let model: string | undefined;

  for (let round = 0; round < maxRounds; round++) {
    const step = await deps.ask(messages);
    provider = step.provider;
    model = step.model;
    if (step.type === "final") {
      return { reply: step.reply, provider, model, actions, limitReached: false };
    }

    messages.push(step.assistantMessage);
    const needsApproval = step.calls.filter((call) => APPROVAL_REQUIRED.has(call.name));
    const approved = needsApproval.length === 0 || (await deps.approve(needsApproval));

    for (const call of step.calls) {
      let content: string;
      if (!approved && needsApproval.includes(call)) {
        content = JSON.stringify({ error: "El usuario no aprobó esta acción." });
      } else {
        try {
          const result = await deps.runTool(call.name, call.args);
          content = JSON.stringify(result ?? { ok: true }).slice(0, MAX_TOOL_CHARS);
          const kind = FILE_ACTIONS[call.name];
          if (kind && !(result && typeof result === "object" && "error" in result)) {
            const path = String(call.args["path"] ?? "");
            const toPath = typeof call.args["toPath"] === "string" ? call.args["toPath"] : undefined;
            actions.push({ path, action: kind, ...(toPath ? { toPath } : {}) });
          }
        } catch (error) {
          content = JSON.stringify({ error: (error as Error).message }).slice(0, MAX_TOOL_CHARS);
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }

  return {
    reply: 'Llegué al límite de pasos del agente; escribí "seguí" para continuar.',
    provider,
    model,
    actions,
    limitReached: true,
  };
}
