import { describe, expect, it } from "vitest";
import { extractStreamingReply, extractStreamingWrites, firstCodeBlock } from "./ai-stream";

describe("AI response streaming helpers", () => {
  it("extracts a partially generated write without interpreting braces in file content", () => {
    const response =
      '{"reply":"Actualizando","edits":[{"path":"src/App.tsx","action":"write","content":"const view = \\"{ready}\\";\\nexport default view;';

    expect(extractStreamingWrites(response)).toEqual([
      { path: "src/App.tsx", content: 'const view = "{ready}";\nexport default view;' },
    ]);
  });

  it("ignores unsafe paths while streaming edits", () => {
    const response =
      '{"reply":"","edits":[{"path":"../outside.ts","action":"write","content":"unsafe"}]}';

    expect(extractStreamingWrites(response)).toEqual([]);
  });

  it("decodes the reply as it arrives", () => {
    expect(extractStreamingReply('{"reply":"Usá \\"estado\\" local')).toBe('Usá "estado" local');
  });

  it("returns an incomplete code fence so it can be previewed live", () => {
    expect(firstCodeBlock("Ejemplo:\n```tsx\nconst App = () => <main>Hola</main>;")).toEqual({
      language: "tsx",
      content: "const App = () => <main>Hola</main>;",
    });
  });
});
