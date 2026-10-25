import { describe, expect, it } from "vitest";
import { friendlyFailure } from "./friendly-errors";

describe("friendly failures", () => {
  it("never exposes raw provider text", () => {
    const msg = friendlyFailure(['GEMINI_API_KEY (gemini · x) [503 · alta demanda]: {"error":{"code":503}}']);
    expect(msg).not.toMatch(/GEMINI|\{|\[503/);
    expect(msg).toMatch(/ocupada/);
  });

  it("explains quota exhaustion", () => {
    expect(friendlyFailure(["GROQ_API_KEY (groq) [429 · límite]: x"])).toMatch(/sin cupo/);
  });

  it("falls back to a generic message", () => {
    expect(friendlyFailure(["algo raro"])).toMatch(/No pude completar/);
  });
});
