import { useMemo, type ReactNode } from "react";
import type { ProjectConfig } from "../../types";
import { useWorkspaceState } from "../hooks/useWorkspaceState";
import { createRequiredContext } from "./createRequiredContext";
import { useFeedback } from "./FeedbackProvider";
import { useModals } from "./ModalProvider";

type WorkspaceContextValue = ReturnType<typeof useWorkspaceState>;

const [WorkspaceContext, useWorkspace] = createRequiredContext<WorkspaceContextValue>("useWorkspace");

export { useWorkspace };

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const feedback = useFeedback();
  const modals = useModals();
  const workspaceState = useWorkspaceState(feedback);

  const workspace = useMemo<WorkspaceContextValue>(
    () => ({
      ...workspaceState,
      createWorkspace: async (path: string, name: string) => {
        await workspaceState.createWorkspace(path, name);
        modals.closeCreateWorkspace();
      },
      createProject: async (config: ProjectConfig) => {
        await workspaceState.createProject(config);
        modals.closeCreateProject();
      },
    }),
    [modals.closeCreateProject, modals.closeCreateWorkspace, workspaceState],
  );

  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  );
}
