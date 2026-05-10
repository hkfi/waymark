import type { ReactNode } from "react";
import { useSelectionState } from "../hooks/useSelectionState";
import { createRequiredContext } from "./createRequiredContext";
import { useWorkspace } from "./WorkspaceProvider";

type SelectionContextValue = ReturnType<typeof useSelectionState>;

const [SelectionContext, useSelection] = createRequiredContext<SelectionContextValue>("useSelection");

export { useSelection };

export function SelectionProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const selection = useSelectionState(workspace.selectedProject);

  return (
    <SelectionContext.Provider value={selection}>
      {children}
    </SelectionContext.Provider>
  );
}
