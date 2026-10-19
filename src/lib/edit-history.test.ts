import { describe, expect, it } from "vitest";
import { EditHistory } from "./edit-history";

describe("folder session history", () => {
  it("undoes all changes back to the beginning without a fixed cap", async () => {
    const history = new EditHistory(); let value = 0;
    for (let i = 0; i < 250; i++) {
      const before = value; value++;
      history.record({ undo: () => { value = before; }, redo: () => { value = before + 1; } });
    }
    while (history.canUndo) await history.undo();
    expect(value).toBe(0);
    while (history.canRedo) await history.redo();
    expect(value).toBe(250);
  });
  it("rewinds newer edits before undoing an older AI batch", async () => {
    const history = new EditHistory(); let value = "initial";
    for (const [id, next] of [[1, "AI"], [2, "text"], [3, "annotation"]] as const) {
      const before = value; value = next;
      history.record({ id, undo: () => { value = before; }, redo: () => { value = next; } });
    }
    await history.undoThrough(1);
    expect(value).toBe("initial"); expect(history.canUndo).toBe(false);
  });
  it("discards redo only after a new edit", async () => {
    const history = new EditHistory(); let value = 1;
    history.record({ undo: () => { value = 0; }, redo: () => { value = 1; } });
    await history.undo(); expect(history.canRedo).toBe(true);
    value = 2; history.record({ undo: () => { value = 0; }, redo: () => { value = 2; } });
    expect(history.canRedo).toBe(false); await history.undo(); expect(value).toBe(0);
  });
  it("keeps a failed restoration available for retry", async () => {
    const history = new EditHistory();
    history.record({ undo: () => { throw new Error("permission"); }, redo: () => {} });
    await expect(history.undo()).rejects.toThrow("permission");
    expect(history.canUndo).toBe(true); expect(history.busy).toBe(false);
  });
});