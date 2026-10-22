export interface HistoryEntry {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  id?: number;
}

/** Folder-session history; no fixed entry limit. */
export class EditHistory {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  busy = false;
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  record(entry: HistoryEntry) {
    if (this.busy) return;
    this.past.push(entry);
    this.future = [];
  }
  clear() {
    this.past = [];
    this.future = [];
  }
  async undo() {
    const entry = this.past.at(-1);
    if (!entry || this.busy) return;
    this.busy = true;
    try {
      await entry.undo();
      this.past.pop();
      this.future.push(entry);
    } finally {
      this.busy = false;
    }
  }
  async redo() {
    const entry = this.future.at(-1);
    if (!entry || this.busy) return;
    this.busy = true;
    try {
      await entry.redo();
      this.future.pop();
      this.past.push(entry);
    } finally {
      this.busy = false;
    }
  }
  async undoThrough(id: number) {
    if (!this.past.some((entry) => entry.id === id) || this.busy) return;
    while (this.past.length) {
      const last = this.past.at(-1);
      await this.undo();
      if (last?.id === id) break;
    }
  }
}
