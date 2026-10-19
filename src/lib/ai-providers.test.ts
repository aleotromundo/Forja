import { describe, expect, it } from "vitest";
import { buildSlots, extractJson, parseKeys, rotateSlots } from "./ai-providers";

describe("ai provider rotation", () => {
  it("parses comma separated keys from env vars", () => {
    expect(parseKeys("a,b", "b c")).toEqual(["a", "b", "c"]);
  });

  it("interleaves providers and keeps Lovable AI as last fallback", () => {
    const slots = buildSlots({
      GROQ_API_KEYS: "g1,g2",
      GEMINI_API_KEY: "m1",
      OPENROUTER_API_KEYS: "o1",
      LOVABLE_API_KEY: "l",
    });
    expect(slots.map((s) => s.key)).toEqual(["g1", "m1", "o1", "g2", "l"]);
  });

  it("rotates the starting provider on each request", () => {
    const slots = buildSlots({ GROQ_API_KEYS: "g1,g2", GEMINI_API_KEY: "m1", LOVABLE_API_KEY: "l" });
    expect(rotateSlots(slots, 1).map((s) => s.key)).toEqual(["m1", "g2", "g1", "l"]);
    expect(rotateSlots(slots, 3).map((s) => s.key)).toEqual(["g1", "m1", "g2", "l"]);
  });

  it("extracts JSON wrapped in code fences", () => {
    expect(extractJson('ok ```json\n{"reply":"hi"}\n```')).toEqual({ reply: "hi" });
  });
});
