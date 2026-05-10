import type { ReactNode } from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useFeedback } from "./FeedbackProvider";
import { useFilters } from "./FilterProvider";
import { useLayout } from "./LayoutProvider";
import { useModals } from "./ModalProvider";
import { useNavigation } from "./NavigationProvider";
import { useProjectActions } from "./ProjectActionsProvider";
import { useSelection } from "./SelectionProvider";
import { useUndoRedo } from "./UndoRedoProvider";
import { useWorkspace } from "./WorkspaceProvider";

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const feedback = useFeedback();
  const filters = useFilters();
  const layout = useLayout();
  const modals = useModals();
  const navigation = useNavigation();
  const projectActions = useProjectActions();
  const selection = useSelection();
  const undoRedo = useUndoRedo();
  const workspace = useWorkspace();

  useKeyboardShortcuts({
    project: workspace.selectedProject,
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
    refreshWorkspace: workspace.refresh,
    chooseWorkspace: workspace.chooseWorkspace,
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
    undo: undoRedo.undo,
    redo: undoRedo.redo,
    setNotice: feedback.setNotice,
  });

  return <>{children}</>;
}
