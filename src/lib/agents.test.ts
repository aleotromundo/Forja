import { describe, expect, it } from "vitest";
import { enforceMode, pickTeam } from "./agents";

describe("agents", () => {
  it("plan mode drops every edit", () => {
    expect(enforceMode("plan", [{ path: "a" }])).toEqual([]);
  });
  it("edit mode keeps edits", () => {
    expect(enforceMode("edit", [{ path: "a" }])).toHaveLength(1);
  });
  it("always works with several agents, architect included", () => {
    const team = pickTeam("hola");
    expect(team.length).toBeGreaterThanOrEqual(2);
    expect(team[0]!.id).toBe("architect");
  });
  it("adds relevant specialists, max 3", () => {
    const ids = pickTeam("cambiá el color del botón y arreglá el error de la api").map((a) => a.id);
    expect(ids).toEqual(["architect", "ui", "logic"]);
  });
});
