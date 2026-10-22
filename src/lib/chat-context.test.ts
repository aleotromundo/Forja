import { expect, it } from "vitest";
import { collectChatContext, MAX_CONTEXT_CHARS } from "./chat-context";

it("sends attached file contents and chosen project files before automatic context", async () => {
  const result = await collectChatContext(
    {
      attachments: [{ path: "brief.md", content: "Requerimientos" }],
      projectPaths: ["src/main.ts"],
    },
    ["src/main.ts", "index.html"],
    async (path) => (path === "src/main.ts" ? "código sin guardar" : "HTML"),
  );
  expect(result).toEqual([
    { path: "[Adjunto de referencia] brief.md", content: "Requerimientos" },
    { path: "src/main.ts", content: "código sin guardar" },
    { path: "index.html", content: "HTML" },
  ]);
});
it("does not silently omit an unreadable selected project file", async () => {
  await expect(
    collectChatContext({ attachments: [], projectPaths: ["missing.ts"] }, [], async () => null),
  ).rejects.toThrow("missing.ts");
});
it("rejects selected context that exceeds the total limit", async () => {
  await expect(
    collectChatContext(
      {
        attachments: [{ path: "large.md", content: "x".repeat(MAX_CONTEXT_CHARS + 1) }],
        projectPaths: [],
      },
      [],
      async () => null,
    ),
  ).rejects.toThrow("espacio de contexto");
});
