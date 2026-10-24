import { describe, expect, it } from "vitest";
import { buildSlots, extractJson, parseKeys, prioritizeSlots, rotateSlots } from "./ai-providers";

describe("ai provider rotation", () => {
  it("parses comma separated keys from env vars", () => {
    expect(parseKeys("a,b", "b c")).toEqual(["a", "b", "c"]);
  });

  it("interleaves providers across free providers", () => {
    const slots = buildSlots({
      GROQ_API_KEYS: "g1,g2",
      GEMINI_API_KEY: "m1",
      OPENROUTER_API_KEYS: "o1",
    });
    expect(slots.map((s) => s.key)).toEqual(["g1", "m1", "o1", "g2"]);
  });

  it("rotates the starting provider on each request", () => {
    const slots = buildSlots({
      GROQ_API_KEYS: "g1,g2",
      GEMINI_API_KEY: "m1",
    });
    expect(rotateSlots(slots, 1).map((s) => s.key)).toEqual(["m1", "g2", "g1"]);
    expect(rotateSlots(slots, 3).map((s) => s.key)).toEqual(["g1", "m1", "g2"]);
  });

  it("prioritizes Groq instead of skipping it between requests", () => {
    const slots = buildSlots({
      GROQ_API_KEY: "g1",
      GEMINI_API_KEYS: "m1,m2",
      OPENROUTER_API_KEY: "o1",
    });
    expect(prioritizeSlots(slots).map((s) => s.key)).toEqual(["g1", "m1", "m2", "o1"]);
  });

  it("migrates retired Groq defaults to an active model", () => {
    const slots = buildSlots({ GROQ_API_KEY: "g1", GROQ_MODEL: "llama-3.3-70b-versatile" });
    expect(slots[0]?.model).toBe("openai/gpt-oss-20b");
  });

  it("accepts multiple comma-separated keys in the singular Gemini variable", () => {
    const slots = buildSlots({ GEMINI_API_KEY: "g1, g2,g3" });
    expect(slots.map((slot) => slot.key)).toEqual(["g1", "g2", "g3"]);
    expect(slots.every((slot) => slot.provider === "gemini")).toBe(true);
  });

  it("accepts independently named numbered keys", () => {
    const slots = buildSlots({ GEMINI_API_KEY_2: "g2", GEMINI_API_KEY_1: "g1" });
    expect(slots.map((slot) => slot.key)).toEqual(["g1", "g2"]);
    expect(slots.map((slot) => slot.envVar)).toEqual(["GEMINI_API_KEY_1", "GEMINI_API_KEY_2"]);
  });

  it("uses fast coding defaults across providers", () => {
    const slots = buildSlots({ GROQ_API_KEY: "g", GEMINI_API_KEY: "m", OPENROUTER_API_KEY: "o" });
    expect(slots.map((slot) => slot.model)).toEqual([
      "openai/gpt-oss-20b",
      "gemini-3-flash-preview",
      "openai/gpt-oss-20b",
    ]);
  });

  it("extracts JSON wrapped in code fences", () => {
    expect(extractJson('ok ```json\n{"reply":"hi"}\n```')).toEqual({ reply: "hi" });
  });
});
