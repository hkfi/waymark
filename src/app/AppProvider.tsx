import { createContext, useContext, useMemo, type Context, type ReactNode } from "react";
import type { ProjectConfig } from "../types";
import { useFeedbackState } from "./hooks/useFeedbackState";
import { useFilterState } from "./hooks/useFilterState";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useModalState } from "./hooks/useModalState";
import { useNavigationState } from "./hooks/useNavigationState";
import { usePaneLayout } from "./hooks/usePaneLayout";
import { useProjectActions as useProjectActionsState } from "./hooks/useProjectActions";
import { useSelectionState } from "./hooks/useSelectionState";
import { useWorkspaceState } from "./hooks/useWorkspaceState";

type FeedbackContextValue = ReturnType<typeof useFeedbackState>;
type FilterContextValue = ReturnType<typeof useFilterState>;
type LayoutContextValue = ReturnType<typeof usePaneLayout>;
type ModalContextValue = ReturnType<typeof useModalState>;
type NavigationContextValue = ReturnType<typeof useNavigationState>;
type ProjectActionsContextValue = ReturnType<typeof useProjectActionsState>;
type SelectionContextValue = ReturnType<typeof useSelectionState>;
type WorkspaceContextValue = ReturnType<typeof useWorkspaceState>;

const FeedbackContext = createContext<FeedbackContextValue | null>(null);
const FilterContext = createContext<FilterContextValue | null>(null);
const LayoutContext = createContext<LayoutContextValue | null>(null);
const ModalContext = createContext<ModalContextValue | null>(null);
const NavigationContext = createContext<NavigationContextValue | null>(null);
const ProjectActionsContext = createContext<ProjectActionsContextValue | null>(null);
const SelectionContext = createContext<SelectionContextValue | null>(null);
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function useRequiredContext<T>(context: Context<T | null>, name: string) {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used inside AppProvider.`);
  }
  return value;
}

export function useFeedback() {
  return useRequiredContext(FeedbackContext, "useFeedback");
}

export function useFilters() {
  return useRequiredContext(FilterContext, "useFilters");
}

export function useLayout() {
  return useRequiredContext(LayoutContext, "useLayout");
}

export function useModals() {
  return useRequiredContext(ModalContext, "useModals");
}

export function useNavigation() {
  return useRequiredContext(NavigationContext, "useNavigation");
}

export function useProjectActions() {
  return useRequiredContext(ProjectActionsContext, "useProjectActions");
}

export function useSelection() {
  return useRequiredContext(SelectionContext, "useSelection");
}

export function useWorkspace() {
  return useRequiredContext(WorkspaceContext, "useWorkspace");
}

export function AppProvider({ children }: { children: ReactNode }) {
  const feedback = useFeedbackState();
  const filters = useFilterState();
  const layout = usePaneLayout();
  const modals = useModalState(feedback.setNotice);
  const navigation = useNavigationState();
  const workspaceState = useWorkspaceState(feedback);
  const selection = useSelectionState(workspaceState.selectedProject);
  const projectActions = useProjectActionsState({
    project: workspaceState.selectedProject,
    selectedTicket: selection.selectedTicket,
    multi: selection.multi,
    inspectorMode: selection.inspectorMode,
    setInspectorMode: selection.setInspectorMode,
    refresh: workspaceState.refresh,
    clearEditingTicket: selection.clearEditingTicket,
    closeCapture: modals.closeCapture,
    closeFileModal: modals.closeFileModal,
    closeRepoOnboarding: modals.closeRepoOnboarding,
    setError: feedback.setError,
    setNotice: feedback.setNotice,
  });

  useKeyboardShortcuts({
    project: workspaceState.selectedProject,
    nav: navigation.nav,
    setNav: navigation.setNav,
    selectedTicket: selection.selectedTicket,
    selectTicket: selection.selectTicket,
    toggleMulti: selection.toggleMulti,
    editTicket: selection.editTicket,
    clearEditingTicket: selection.clearEditingTicket,
    setInspectorMode: selection.setInspectorMode,
    changeStatus: projectActions.changeStatus,
    sendHandoff: projectActions.sendHandoff,
    zoomIn: layout.zoom.zoomIn,
    zoomOut: layout.zoom.zoomOut,
    resetZoom: layout.zoom.reset,
    refreshWorkspace: workspaceState.refresh,
    chooseWorkspace: workspaceState.chooseWorkspace,
    search: filters.search,
    setSearch: filters.setSearch,
    searchInputRef: filters.searchInputRef,
    captureOpen: modals.captureOpen,
    createWorkspaceOpen: modals.createWorkspaceOpen,
    createProjectOpen: modals.createProjectOpen,
    fileModalOpen: Boolean(modals.fileModalMode),
    repoOnboardingOpen: modals.repoOnboardingOpen,
    editingTicketOpen: Boolean(selection.editingTicket),
    openCapture: modals.openCapture,
    closeCapture: modals.closeCapture,
    closeCreateWorkspace: modals.closeCreateWorkspace,
    closeCreateProject: modals.closeCreateProject,
    closeFileModal: modals.closeFileModal,
    closeRepoOnboarding: modals.closeRepoOnboarding,
    setNotice: feedback.setNotice,
  });

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
    <FeedbackContext.Provider value={feedback}>
      <WorkspaceContext.Provider value={workspace}>
        <NavigationContext.Provider value={navigation}>
          <SelectionContext.Provider value={selection}>
            <FilterContext.Provider value={filters}>
              <LayoutContext.Provider value={layout}>
                <ModalContext.Provider value={modals}>
                  <ProjectActionsContext.Provider value={projectActions}>
                    {children}
                  </ProjectActionsContext.Provider>
                </ModalContext.Provider>
              </LayoutContext.Provider>
            </FilterContext.Provider>
          </SelectionContext.Provider>
        </NavigationContext.Provider>
      </WorkspaceContext.Provider>
    </FeedbackContext.Provider>
  );
}
