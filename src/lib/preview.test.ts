import { describe, expect, it } from "vitest";
import { inspectHtml, replaceElementText, resolvePreviewPath } from "./preview";

describe("preview source editing", () => {
  it("changes only the selected occurrence and escapes markup", () => {
    const source = "<h1>Hola</h1><p>Hola</p>";
    const target = inspectHtml(source).elements.find((item) => item.tag === "p");
    expect(replaceElementText(source, target?.id ?? "missing", "<Forja> & vos")).toBe(
      "<h1>Hola</h1><p>&lt;Forja&gt; &amp; vos</p>",
    );
  });
  it("refuses to overwrite nested elements", () => {
    const source = "<p>Hola <strong>vos</strong></p>";
    const target = inspectHtml(source).elements.find((item) => item.tag === "p");
    expect(() => replaceElementText(source, target?.id ?? "missing", "nuevo")).toThrow();
  });
  it("resolves local assets relative to the HTML file", () => {
    expect(resolvePreviewPath("pages/index.html", "../assets/logo.png")).toBe("assets/logo.png");
    expect(resolvePreviewPath("pages/index.html", "https://example.com/logo.png")).toBeNull();
  });
});
