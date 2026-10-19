import { describe, expect, it } from "vitest";
import { enforceMode, getAgent } from "./agents";

describe("agents", () => {
  it("plan mode drops every edit", () => {
    expect(enforceMode("plan", [{ path: "a" }])).toEqual([]);
  });
  it("edit mode keeps edits", () => {
    expect(enforceMode("edit", [{ path: "a" }])).toHaveLength(1);
  });
  it("unknown agent falls back to Forja", () => {
    expect(getAgent("nope").id).toBe("core");
  });
});
