import type { ReactNode } from "react";
import { useProjectActions as useProjectActionsState } from "../hooks/useProjectActions";
import { createRequiredContext } from "./createRequiredContext";
import { useFeedbackActions } from "./FeedbackProvider";
import { useModalActions } from "./ModalProvider";
import { useSelection } from "./SelectionProvider";
import { useUndoRedo } from "./UndoRedoProvider";
import { useWorkspace } from "./WorkspaceProvider";

type ProjectActionsContextValue = ReturnType<typeof useProjectActionsState>;

const [ProjectActionsContext, useProjectActions] =
  createRequiredContext<ProjectActionsContextValue>("useProjectActions");

export { useProjectActions };

export function ProjectActionsProvider({ children }: { children: ReactNode }) {
  const feedback = useFeedbackActions();
  const modals = useModalActions();
  const selection = useSelection();
  const undoRedo = useUndoRedo();
  const workspace = useWorkspace();
  const projectActions = useProjectActionsState({
    project: workspace.selectedProject,
    selectedTicket: selection.selectedTicket,
    multi: selection.multi,
    inspectorMode: selection.inspectorMode,
    setInspectorMode: selection.setInspectorMode,
    refresh: workspace.refresh,
    clearEditingTicket: selection.clearEditingTicket,
    closeCapture: modals.closeCapture,
    closeFileModal: modals.closeFileModal,
    closeRepoOnboarding: modals.closeRepoOnboarding,
    recordTransaction: undoRedo.recordTransaction,
    setError: feedback.setError,
    setNotice: feedback.setNotice,
  });

  return (
    <ProjectActionsContext.Provider value={projectActions}>
      {children}
    </ProjectActionsContext.Provider>
  );
}
