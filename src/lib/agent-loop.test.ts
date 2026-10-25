import { describe, expect, it } from "vitest";
import { runAgentLoop, type ModelStep } from "./agent-loop";

function scripted(steps: ModelStep[]) {
  let i = 0;
  return async () => steps[i++] ?? { type: "final" as const, reply: "fin" };
}

describe("agent loop", () => {
  it("returns the final reply when no tools are needed", async () => {
    const result = await runAgentLoop([], {
      ask: scripted([{ type: "final", reply: "hola", provider: "groq", model: "m" }]),
      runTool: async () => ({}),
      approve: async () => true,
    });
    expect(result.reply).toBe("hola");
    expect(result.actions).toEqual([]);
  });

  it("runs a read tool without asking and feeds the result back", async () => {
    const seen: unknown[][] = [];
    const messages: unknown[] = [];
    const result = await runAgentLoop(messages, {
      ask: async (m) => {
        seen.push([...m]);
        return seen.length === 1
          ? {
              type: "tool_calls",
              assistantMessage: { role: "assistant", tool_calls: [] },
              calls: [{ id: "1", name: "read_file", args: { path: "a.ts" } }],
            }
          : { type: "final", reply: "listo" };
      },
      runTool: async () => ({ content: "x" }),
      approve: async () => {
        throw new Error("no debería pedir aprobación");
      },
    });
    expect(result.reply).toBe("listo");
    expect(messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "1" });
  });

  it("asks before writing and records the action when approved", async () => {
    let asked = 0;
    const result = await runAgentLoop([], {
      ask: scripted([
        {
          type: "tool_calls",
          assistantMessage: {},
          calls: [{ id: "w", name: "write_file", args: { path: "x.md", content: "hola" } }],
        },
        { type: "final", reply: "escrito" },
      ]),
      runTool: async () => ({ ok: true }),
      approve: async (calls) => {
        asked += calls.length;
        return true;
      },
    });
    expect(asked).toBe(1);
    expect(result.actions).toEqual([{ path: "x.md", action: "write" }]);
  });

  it("tells the model when the user rejects a write and does not run it", async () => {
    const messages: unknown[] = [];
    let ran = false;
    await runAgentLoop(messages, {
      ask: scripted([
        {
          type: "tool_calls",
          assistantMessage: {},
          calls: [{ id: "w", name: "delete_path", args: { path: "src" } }],
        },
        { type: "final", reply: "ok" },
      ]),
      runTool: async () => {
        ran = true;
        return {};
      },
      approve: async () => false,
    });
    expect(ran).toBe(false);
    expect(JSON.stringify(messages)).toContain("no aprobó");
  });

  it("injects user messages sent during the run before the next step", async () => {
    const messages: unknown[] = [];
    let step = 0;
    let pending = ["agregá también el footer"];
    await runAgentLoop(messages, {
      drain: () => {
        const out = pending;
        pending = [];
        return out;
      },
      ask: async () =>
        step++ === 0
          ? {
              type: "tool_calls",
              assistantMessage: {},
              calls: [{ id: "r", name: "list_files", args: {} }],
            }
          : { type: "final", reply: "ok" },
      runTool: async () => ({ files: [] }),
      approve: async () => true,
    });
    expect(messages).toContainEqual({ role: "user", content: "agregá también el footer" });
  });

  it("stops when the user presses stop", async () => {
    let stop = false;
    const result = await runAgentLoop([], {
      shouldStop: () => stop,
      ask: async () => {
        stop = true;
        return {
          type: "tool_calls",
          assistantMessage: {},
          calls: [{ id: "r", name: "list_files", args: {} }],
        };
      },
      runTool: async () => {
        throw new Error("no debería ejecutar herramientas después de detener");
      },
      approve: async () => true,
    });
    expect(result.stopped).toBe(true);
  });

  it("stops at the round limit", async () => {
    const result = await runAgentLoop([], {
      maxRounds: 2,
      ask: async () => ({
        type: "tool_calls",
        assistantMessage: {},
        calls: [{ id: "r", name: "list_files", args: {} }],
      }),
      runTool: async () => ({ files: [] }),
      approve: async () => true,
    });
    expect(result.limitReached).toBe(true);
  });
});
