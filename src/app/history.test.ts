import { describe, expect, it } from "vitest";
import { createHistoryController, type FileAccess } from "./history";

function createMemoryFiles(initial: Record<string, string | null> = {}) {
  const files = new Map<string, string>();
  for (const [path, value] of Object.entries(initial)) {
    if (value !== null) files.set(path, value);
  }

  const access: FileAccess = {
    pathExists: async (path) => files.has(path),
    readTextFile: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`Missing ${path}`);
      return value;
    },
    writeTextFile: async (path, contents) => {
      files.set(path, contents);
    },
    removeFile: async (path) => {
      if (!files.has(path)) throw new Error(`Missing ${path}`);
      files.delete(path);
    },
  };

  return {
    access,
    files,
    read: (path: string) => files.get(path) ?? null,
    write: (path: string, contents: string) => files.set(path, contents),
  };
}

function createController(files: FileAccess) {
  let index = 0;
  return createHistoryController({
    files,
    now: () => new Date("2026-05-09T00:00:00.000Z"),
    id: () => `history-${index += 1}`,
  });
}

describe("history controller", () => {
  it("undoes and redoes changed files", async () => {
    const fs = createMemoryFiles({ "tickets.yaml": "before" });
    const history = createController(fs.access);

    const recorded = await history.recordTransaction(
      "Update ticket",
      ["tickets.yaml"],
      async () => fs.write("tickets.yaml", "after"),
      "Updated ticket.",
    );

    expect(recorded.entry?.label).toBe("Update ticket");
    expect(recorded.message).toBe("Updated ticket.");
    expect(fs.read("tickets.yaml")).toBe("after");

    await history.undo();
    expect(fs.read("tickets.yaml")).toBe("before");

    await history.redo();
    expect(fs.read("tickets.yaml")).toBe("after");
  });

  it("undoes created files by removing them and redoes by recreating them", async () => {
    const fs = createMemoryFiles();
    const history = createController(fs.access);

    await history.recordTransaction(
      "Create note",
      ["ideas/new-note.md"],
      async () => fs.write("ideas/new-note.md", "# New note\n"),
    );

    expect(fs.read("ideas/new-note.md")).toBe("# New note\n");
    await history.undo();
    expect(fs.read("ideas/new-note.md")).toBeNull();
    await history.redo();
    expect(fs.read("ideas/new-note.md")).toBe("# New note\n");
  });

  it("undoes deleted files by restoring them and redoes by removing them again", async () => {
    const fs = createMemoryFiles({ "ideas/old.md": "# Old\n" });
    const history = createController(fs.access);

    await history.recordTransaction(
      "Delete note",
      ["ideas/old.md"],
      async () => fs.files.delete("ideas/old.md"),
    );

    expect(fs.read("ideas/old.md")).toBeNull();
    await history.undo();
    expect(fs.read("ideas/old.md")).toBe("# Old\n");
    await history.redo();
    expect(fs.read("ideas/old.md")).toBeNull();
  });

  it("blocks undo when a changed file no longer matches the after snapshot", async () => {
    const fs = createMemoryFiles({ "tickets.yaml": "before" });
    const history = createController(fs.access);

    await history.recordTransaction(
      "Update ticket",
      ["tickets.yaml"],
      async () => fs.write("tickets.yaml", "after"),
    );

    fs.write("tickets.yaml", "external edit");

    await expect(history.undo()).rejects.toThrow("Cannot undo: tickets.yaml changed since this action.");
    expect(fs.read("tickets.yaml")).toBe("external edit");
    expect(history.state().undoStack).toHaveLength(1);
    expect(history.state().redoStack).toHaveLength(0);
  });

  it("blocks redo when a changed file no longer matches the before snapshot", async () => {
    const fs = createMemoryFiles({ "tickets.yaml": "before" });
    const history = createController(fs.access);

    await history.recordTransaction(
      "Update ticket",
      ["tickets.yaml"],
      async () => fs.write("tickets.yaml", "after"),
    );
    await history.undo();
    fs.write("tickets.yaml", "external edit");

    await expect(history.redo()).rejects.toThrow("Cannot redo: tickets.yaml changed since this action.");
    expect(fs.read("tickets.yaml")).toBe("external edit");
    expect(history.state().undoStack).toHaveLength(0);
    expect(history.state().redoStack).toHaveLength(1);
  });

  it("clears redo when recording a new transaction", async () => {
    const fs = createMemoryFiles({ "tickets.yaml": "one", "links.yaml": "alpha" });
    const history = createController(fs.access);

    await history.recordTransaction(
      "Update ticket",
      ["tickets.yaml"],
      async () => fs.write("tickets.yaml", "two"),
    );
    await history.undo();
    expect(history.state().redoStack).toHaveLength(1);

    await history.recordTransaction(
      "Update link",
      ["links.yaml"],
      async () => fs.write("links.yaml", "beta"),
    );

    expect(history.state().undoStack.map((entry) => entry.label)).toEqual(["Update link"]);
    expect(history.state().redoStack).toHaveLength(0);
  });

  it("keeps only the latest twenty undo entries", async () => {
    const fs = createMemoryFiles({ "tickets.yaml": "0" });
    const history = createController(fs.access);

    for (let index = 1; index <= 22; index += 1) {
      await history.recordTransaction(
        `Change ${index}`,
        ["tickets.yaml"],
        async () => fs.write("tickets.yaml", String(index)),
      );
    }

    expect(history.state().undoStack).toHaveLength(20);
    expect(history.state().undoStack[0].label).toBe("Change 22");
    expect(history.state().undoStack[19].label).toBe("Change 3");
  });
});
