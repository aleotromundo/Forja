import { describe, expect, it } from "vitest";
import { truncateToolOutput } from "./tool-output";

describe("truncateToolOutput", () => {
  it("no toca salidas que entran en el límite", () => {
    expect(truncateToolOutput("hola", 10)).toBe("hola");
  });

  it("conserva inicio y final y avisa cuánto se omitió", () => {
    const text = "A".repeat(100) + "Z".repeat(100);
    const out = truncateToolOutput(text, 50);
    expect(out.startsWith("A")).toBe(true);
    expect(out.endsWith("Z")).toBe(true);
    expect(out).toContain("se omitieron 150 caracteres");
    expect(out.length).toBeLessThan(text.length);
  });
});
