export type HistoryFile = {
  path: string;
  before: string | null;
  after: string | null;
  beforeHash: string;
  afterHash: string;
};

export type HistoryEntry = {
  id: string;
  label: string;
  createdAt: string;
  files: HistoryFile[];
};

export type FileAccess = {
  pathExists: (path: string) => Promise<boolean>;
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, contents: string) => Promise<void>;
  removeFile: (path: string) => Promise<void>;
};

export type TransactionNotice<T> =
  | string
  | ((result: T, entry: HistoryEntry | null) => string | null);

export type RecordTransaction = <T>(
  label: string,
  paths: string[],
  mutator: () => Promise<T>,
  notice?: TransactionNotice<T>,
) => Promise<{ result: T; entry: HistoryEntry | null; message: string | null }>;

export type HistoryControllerState = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
};

type HistoryControllerOptions = {
  files: FileAccess;
  limit?: number;
  now?: () => Date;
  id?: () => string;
};

const DEFAULT_HISTORY_LIMIT = 20;

export function createHistoryController({
  files,
  limit = DEFAULT_HISTORY_LIMIT,
  now = () => new Date(),
  id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
}: HistoryControllerOptions) {
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];

  function state(): HistoryControllerState {
    return {
      undoStack,
      redoStack,
    };
  }

  function reset() {
    undoStack = [];
    redoStack = [];
  }

  async function recordTransaction<T>(
    label: string,
    paths: string[],
    mutator: () => Promise<T>,
    notice?: TransactionNotice<T>,
  ) {
    const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
    if (!uniquePaths.length) {
      const result = await mutator();
      return {
        result,
        entry: null,
        message: transactionNoticeMessage(notice, result, null),
      };
    }

    const before = await snapshotPaths(files, uniquePaths);
    const result = await mutator();
    const after = await snapshotPaths(files, uniquePaths);
    const changedFiles = uniquePaths
      .map<HistoryFile>((path) => ({
        path,
        before: before.get(path) ?? null,
        after: after.get(path) ?? null,
        beforeHash: hashSnapshot(before.get(path) ?? null),
        afterHash: hashSnapshot(after.get(path) ?? null),
      }))
      .filter((file) => file.before !== file.after);

    const entry = changedFiles.length
      ? {
          id: id(),
          label,
          createdAt: now().toISOString(),
          files: changedFiles,
        }
      : null;

    if (entry) {
      undoStack = [entry, ...undoStack].slice(0, limit);
      redoStack = [];
    }

    return {
      result,
      entry,
      message: transactionNoticeMessage(notice, result, entry),
    };
  }

  async function undo(entry = undoStack[0]) {
    if (!entry) return null;
    await ensureCurrentMatches(files, entry, "after", "undo");
    await restoreEntry(files, entry, "before");
    undoStack = undoStack.filter((candidate) => candidate.id !== entry.id);
    redoStack = [entry, ...redoStack.filter((candidate) => candidate.id !== entry.id)].slice(0, limit);
    return entry;
  }

  async function redo(entry = redoStack[0]) {
    if (!entry) return null;
    await ensureCurrentMatches(files, entry, "before", "redo");
    await restoreEntry(files, entry, "after");
    redoStack = redoStack.filter((candidate) => candidate.id !== entry.id);
    undoStack = [entry, ...undoStack.filter((candidate) => candidate.id !== entry.id)].slice(0, limit);
    return entry;
  }

  return {
    state,
    reset,
    recordTransaction,
    undo,
    redo,
  };
}

async function restoreEntry(files: FileAccess, entry: HistoryEntry, target: "before" | "after") {
  const paths = target === "before" ? [...entry.files].reverse() : entry.files;
  for (const file of paths) {
    const snapshot = file[target];
    if (snapshot === null) {
      if (await files.pathExists(file.path)) {
        await files.removeFile(file.path);
      }
    } else {
      await files.writeTextFile(file.path, snapshot);
    }
  }
}

async function ensureCurrentMatches(
  files: FileAccess,
  entry: HistoryEntry,
  expected: "before" | "after",
  verb: "undo" | "redo",
) {
  for (const file of entry.files) {
    const current = await snapshotPath(files, file.path);
    if (current !== file[expected]) {
      throw new Error(`Cannot ${verb}: ${file.path} changed since this action.`);
    }
  }
}

async function snapshotPaths(files: FileAccess, paths: string[]) {
  const snapshots = new Map<string, string | null>();
  for (const path of paths) {
    snapshots.set(path, await snapshotPath(files, path));
  }
  return snapshots;
}

async function snapshotPath(files: FileAccess, path: string) {
  if (!(await files.pathExists(path))) return null;
  return files.readTextFile(path);
}

function transactionNoticeMessage<T>(
  notice: TransactionNotice<T> | undefined,
  result: T,
  entry: HistoryEntry | null,
) {
  if (!notice) return null;
  return typeof notice === "function" ? notice(result, entry) : notice;
}

function hashSnapshot(snapshot: string | null) {
  const value = snapshot ?? "<missing>";
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
