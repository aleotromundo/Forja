import { expect, it } from "vitest";
import {
  asksUserForProjectFile,
  collectChatContext,
  findMentionedProjectFiles,
  MAX_CONTEXT_CHARS,
} from "./chat-context";

it("detects explicitly mentioned project paths and unique filenames", () => {
  const files = ["src/components/forja/Workbench.tsx", "src/lib/Workbench.tsx", "src/App.tsx"];
  expect(findMentionedProjectFiles("Revisá `src/components/forja/Workbench.tsx`", files)).toEqual([
    "src/components/forja/Workbench.tsx",
  ]);
  expect(findMentionedProjectFiles("Revisá `SRC/COMPONENTS/FORJA/WORKBENCH.TSX`", files)).toEqual([
    "src/components/forja/Workbench.tsx",
  ]);
  expect(findMentionedProjectFiles("Mirá App.tsx", files)).toEqual(["src/App.tsx"]);
  expect(findMentionedProjectFiles("Mirá Workbench.tsx", files)).toEqual([]);
});

it("recognizes requests that ask the user to open or paste a project file", () => {
  expect(
    asksUserForProjectFile(
      "¿Podés abrir el archivo src/components/forja/Workbench.tsx y compartir su contenido?",
    ),
  ).toBe(true);
  expect(asksUserForProjectFile("Could you paste the file contents?")).toBe(true);
  expect(asksUserForProjectFile("Ya revisé Workbench.tsx y encontré el problema.")).toBe(false);
});

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
