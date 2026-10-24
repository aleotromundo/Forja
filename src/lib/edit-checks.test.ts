import { describe, expect, it } from "vitest";
import { editProblems, missingReactImports } from "./edit-checks";

describe("edit checks", () => {
  it("detects a hook used without import", () => {
    expect(missingReactImports("function A(){ useEffect(() => {}, []); }")).toEqual(["useEffect"]);
  });

  it("accepts a hook that is imported", () => {
    expect(
      missingReactImports('import { useEffect } from "react";\nuseEffect(() => {}, []);'),
    ).toEqual([]);
  });

  it("reports problems only for write edits in code files", () => {
    const problems = editProblems([
      { path: "src/a.tsx", action: "write", content: "useState(0)" },
      { path: "README.md", action: "write", content: "useState(0)" },
      { path: "src/b.ts", action: "delete" },
    ]);
    expect(problems).toEqual(["src/a.tsx: usa useState sin importarlo de \"react\""]);
  });
});
