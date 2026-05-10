import { useMemo, type ReactNode } from "react";
import { useModalState } from "../hooks/useModalState";
import { createRequiredContext } from "./createRequiredContext";
import { useFeedbackActions } from "./FeedbackProvider";

type ModalContextValue = ReturnType<typeof useModalState>;
type ModalStateContextValue = Pick<
  ModalContextValue,
  "captureOpen" | "createProjectOpen" | "createWorkspaceOpen" | "fileModalMode" | "repoOnboardingOpen"
>;
type ModalActionsContextValue = Omit<ModalContextValue, keyof ModalStateContextValue>;

const [ModalStateContext, useModalStateValue] =
  createRequiredContext<ModalStateContextValue>("useModalStateValue");
const [ModalActionsContext, useModalActions] =
  createRequiredContext<ModalActionsContextValue>("useModalActions");

export { useModalActions };

export function useModals() {
  const state = useModalStateValue();
  const actions = useModalActions();

  return useMemo(
    () => ({
      ...state,
      ...actions,
    }),
    [actions, state],
  );
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const feedback = useFeedbackActions();
  const modals = useModalState(feedback.setNotice);
  const state = useMemo<ModalStateContextValue>(
    () => ({
      captureOpen: modals.captureOpen,
      createProjectOpen: modals.createProjectOpen,
      createWorkspaceOpen: modals.createWorkspaceOpen,
      fileModalMode: modals.fileModalMode,
      repoOnboardingOpen: modals.repoOnboardingOpen,
    }),
    [
      modals.captureOpen,
      modals.createProjectOpen,
      modals.createWorkspaceOpen,
      modals.fileModalMode,
      modals.repoOnboardingOpen,
    ],
  );
  const actions = useMemo<ModalActionsContextValue>(
    () => ({
      closeCapture: modals.closeCapture,
      closeCreateProject: modals.closeCreateProject,
      closeCreateWorkspace: modals.closeCreateWorkspace,
      closeFileModal: modals.closeFileModal,
      closeRepoOnboarding: modals.closeRepoOnboarding,
      openCapture: modals.openCapture,
      openCreateProject: modals.openCreateProject,
      openCreateWorkspace: modals.openCreateWorkspace,
      openFileModal: modals.openFileModal,
      openLinkModal: modals.openLinkModal,
      openRepoOnboarding: modals.openRepoOnboarding,
    }),
    [
      modals.closeCapture,
      modals.closeCreateProject,
      modals.closeCreateWorkspace,
      modals.closeFileModal,
      modals.closeRepoOnboarding,
      modals.openCapture,
      modals.openCreateProject,
      modals.openCreateWorkspace,
      modals.openFileModal,
      modals.openLinkModal,
      modals.openRepoOnboarding,
    ],
  );

  return (
    <ModalActionsContext.Provider value={actions}>
      <ModalStateContext.Provider value={state}>
        {children}
      </ModalStateContext.Provider>
    </ModalActionsContext.Provider>
  );
}
