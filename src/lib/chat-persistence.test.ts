import { beforeEach, describe, expect, it } from "vitest";
import { loadChatHistory, saveChatHistory } from "./chat-persistence";

describe("chat persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips messages by project name", () => {
    saveChatHistory("Forja", [{ role: "user", content: "Hola" }]);
    expect(loadChatHistory("Forja")).toEqual([{ role: "user", content: "Hola" }]);
  });

  it("keeps only the most recent messages and bounds content", () => {
    saveChatHistory(
      "Forja",
      Array.from({ length: 100 }, (_, index) => ({ role: "user" as const, content: `${index}` })),
    );
    const restored = loadChatHistory("Forja");
    expect(restored).toHaveLength(80);
    expect(restored[0]?.content).toBe("20");

    saveChatHistory("Forja", [{ role: "assistant", content: "x".repeat(50_000) }]);
    expect(loadChatHistory("Forja")[0]?.content).toHaveLength(40_000);
  });

  it("ignores malformed stored data", () => {
    localStorage.setItem("forja:chat-history:v1:Forja", "not-json");
    expect(loadChatHistory("Forja")).toEqual([]);
    localStorage.setItem("forja:chat-history:v1:Forja", JSON.stringify([{ role: "user" }]));
    expect(loadChatHistory("Forja")).toEqual([]);
  });
});
