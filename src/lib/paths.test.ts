import { describe, expect, it } from "vitest";
import { isSafeRelativePath } from "./paths";

describe("isSafeRelativePath", () => {
  it("accepts normal project-relative paths", () => {
    expect(isSafeRelativePath("src/components/App.tsx")).toBe(true);
    expect(isSafeRelativePath(".env.example")).toBe(true);
  });

  it("rejects absolute and traversal paths", () => {
    expect(isSafeRelativePath("/tmp/secret.txt")).toBe(false);
    expect(isSafeRelativePath("../secret.txt")).toBe(false);
    expect(isSafeRelativePath("src/../../secret.txt")).toBe(false);
    expect(isSafeRelativePath("src/./App.tsx")).toBe(false);
  });

  it("rejects Windows separators, drives and empty segments", () => {
    expect(isSafeRelativePath("..\\secret.txt")).toBe(false);
    expect(isSafeRelativePath("C:/secret.txt")).toBe(false);
    expect(isSafeRelativePath("src//App.tsx")).toBe(false);
    expect(isSafeRelativePath("src/unsafe\0.txt")).toBe(false);
  });
});
