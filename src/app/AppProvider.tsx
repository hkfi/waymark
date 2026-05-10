import type { ReactNode } from "react";
import { FeedbackProvider, useFeedback } from "./providers/FeedbackProvider";
import { FilterProvider, useFilters } from "./providers/FilterProvider";
import { KeyboardShortcutsProvider } from "./providers/KeyboardShortcutsProvider";
import { LayoutProvider, useLayout } from "./providers/LayoutProvider";
import { ModalProvider, useModals } from "./providers/ModalProvider";
import { NavigationProvider, useNavigation } from "./providers/NavigationProvider";
import { ProjectActionsProvider, useProjectActions } from "./providers/ProjectActionsProvider";
import { SelectionProvider, useSelection } from "./providers/SelectionProvider";
import { UndoRedoProvider, useUndoRedo } from "./providers/UndoRedoProvider";
import { WorkspaceProvider, useWorkspace } from "./providers/WorkspaceProvider";

export {
  useFeedback,
  useFilters,
  useLayout,
  useModals,
  useNavigation,
  useProjectActions,
  useSelection,
  useUndoRedo,
  useWorkspace,
};

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <FeedbackProvider>
      <ModalProvider>
        <WorkspaceProvider>
          <NavigationProvider>
            <SelectionProvider>
              <FilterProvider>
                <LayoutProvider>
                  <UndoRedoProvider>
                    <ProjectActionsProvider>
                      <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>
                    </ProjectActionsProvider>
                  </UndoRedoProvider>
                </LayoutProvider>
              </FilterProvider>
            </SelectionProvider>
          </NavigationProvider>
        </WorkspaceProvider>
      </ModalProvider>
    </FeedbackProvider>
  );
}
