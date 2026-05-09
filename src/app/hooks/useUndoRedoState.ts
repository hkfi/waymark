import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pathExists, readTextFile, removeFile, writeTextFile } from "../../tauri";
import {
  createHistoryController,
  type HistoryEntry,
  type HistoryFile,
  type TransactionNotice,
} from "../history";
import type { FeedbackNoticeAction } from "./useFeedbackState";

export type { HistoryEntry, HistoryFile, TransactionNotice };

export type RecordTransaction = <T>(
  label: string,
  paths: string[],
  mutator: () => Promise<T>,
  notice?: TransactionNotice<T>,
) => Promise<T>;

type UndoRedoDeps = {
  scopeKey: string | null;
  refresh: () => Promise<void>;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  setActionNotice: (value: string, action: FeedbackNoticeAction | null) => void;
};

export function useUndoRedoState({
  scopeKey,
  refresh,
  setError,
  setNotice,
  setActionNotice,
}: UndoRedoDeps) {
  const controllerRef = useRef(
    createHistoryController({
      files: {
        pathExists,
        readTextFile,
        writeTextFile,
        removeFile,
      },
    }),
  );
  const [version, setVersion] = useState(0);
  const undoEntryRef = useRef<(entry: HistoryEntry) => Promise<void>>(async () => undefined);
  const redoEntryRef = useRef<(entry: HistoryEntry) => Promise<void>>(async () => undefined);
  const controller = controllerRef.current;

  const updateStacks = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    controller.reset();
    updateStacks();
  }, [controller, scopeKey, updateStacks]);

  const undoEntry = useCallback(
    async (entry: HistoryEntry) => {
      try {
        await controller.undo(entry);
        updateStacks();
        await refresh();
        setActionNotice(`Undid ${entry.label}.`, {
          label: "Redo",
          onClick: () => {
            void redoEntryRef.current(entry);
          },
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [controller, refresh, setActionNotice, setError, updateStacks],
  );

  const redoEntry = useCallback(
    async (entry: HistoryEntry) => {
      try {
        await controller.redo(entry);
        updateStacks();
        await refresh();
        setActionNotice(`Redid ${entry.label}.`, {
          label: "Undo",
          onClick: () => {
            void undoEntryRef.current(entry);
          },
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [controller, refresh, setActionNotice, setError, updateStacks],
  );

  useEffect(() => {
    undoEntryRef.current = undoEntry;
    redoEntryRef.current = redoEntry;
  }, [redoEntry, undoEntry]);

  const recordTransaction = useCallback<RecordTransaction>(
    async (label, paths, mutator, notice) => {
      const { result, entry, message } = await controller.recordTransaction(label, paths, mutator, notice);
      updateStacks();
      if (message) {
        if (entry) {
          setActionNotice(message, {
            label: "Undo",
            onClick: () => {
              void undoEntry(entry);
            },
          });
        } else {
          setNotice(message);
        }
      }

      return result;
    },
    [controller, setActionNotice, setNotice, undoEntry, updateStacks],
  );

  const undo = useCallback(async () => {
    const entry = controller.state().undoStack[0];
    if (!entry) return;
    await undoEntry(entry);
  }, [controller, undoEntry]);

  const redo = useCallback(async () => {
    const entry = controller.state().redoStack[0];
    if (!entry) return;
    await redoEntry(entry);
  }, [controller, redoEntry]);

  return useMemo(
    () => {
      const { undoStack, redoStack } = controller.state();
      return {
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undoLabel: undoStack[0]?.label ?? null,
        redoLabel: redoStack[0]?.label ?? null,
        recordTransaction,
        undo,
        redo,
      };
    },
    [controller, recordTransaction, redo, undo, version],
  );
}
