import type { ReactNode } from "react";
import { useUndoRedoState } from "../hooks/useUndoRedoState";
import { createRequiredContext } from "./createRequiredContext";
import { useFeedback } from "./FeedbackProvider";
import { useWorkspace } from "./WorkspaceProvider";

type UndoRedoContextValue = ReturnType<typeof useUndoRedoState>;

const [UndoRedoContext, useUndoRedo] = createRequiredContext<UndoRedoContextValue>("useUndoRedo");

export { useUndoRedo };

export function UndoRedoProvider({ children }: { children: ReactNode }) {
  const feedback = useFeedback();
  const workspace = useWorkspace();
  const undoRedo = useUndoRedoState({
    scopeKey: workspace.selectedProject?.rootPath ?? null,
    refresh: workspace.refresh,
    setError: feedback.setError,
    setNotice: feedback.setNotice,
    setActionNotice: feedback.setActionNotice,
  });

  return (
    <UndoRedoContext.Provider value={undoRedo}>
      {children}
    </UndoRedoContext.Provider>
  );
}
