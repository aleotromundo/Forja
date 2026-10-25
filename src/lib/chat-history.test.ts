import { describe, expect, it } from "vitest";
import { recentContext } from "./chat-history";

describe("recentContext", () => {
  it("keeps the whole short conversation in order", () => {
    const msgs = [
      { role: "user" as const, content: "hola" },
      { role: "assistant" as const, content: "¿qué querés?" },
      { role: "user" as const, content: "una app de notas" },
    ];
    expect(recentContext(msgs)).toEqual(msgs);
  });

  it("always keeps the latest message even if it is huge", () => {
    const big = "x".repeat(50_000);
    const out = recentContext([{ role: "user", content: "viejo" }, { role: "user", content: big }]);
    expect(out.at(-1)?.content.length).toBeLessThanOrEqual(6001);
    expect(out.at(-1)?.role).toBe("user");
  });

  it("drops the oldest messages when the budget is exceeded", () => {
    const msgs = Array.from({ length: 100 }, (_, i) => ({
      role: "user" as const,
      content: `mensaje ${i} ` + "y".repeat(5000),
    }));
    const out = recentContext(msgs);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.at(-1)?.content.startsWith("mensaje 99")).toBe(true);
  });
});
