import { describe, expect, it } from "vitest";
import { buildContext, chunkToSummarize, needsSummary } from "./conversation-memory";

const hist = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
    content: `m${i}`,
  }));

describe("conversation memory", () => {
  it("summarizes only after the trigger and keeps recent messages", () => {
    expect(needsSummary(20, null)).toBe(false);
    expect(needsSummary(40, null)).toBe(true);
    const chunk = chunkToSummarize(hist(40), null);
    expect(chunk.length).toBe(20);
    expect(chunk[0]?.content).toBe("m0");
  });

  it("prepends the summary before recent messages", () => {
    const ctx = buildContext(hist(40), { upTo: 20, text: "creamos una app de notas" });
    expect(ctx[0]?.content).toContain("creamos una app de notas");
    expect(ctx.at(-1)?.content).toBe("m39");
  });

  it("without summary returns recent history", () => {
    const ctx = buildContext(hist(5), null);
    expect(ctx.map((m) => m.content)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
  });
});
