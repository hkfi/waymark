import { AlertTriangle, Check, Plus, Triangle } from "lucide-react";
import { isTauri, openPath } from "../tauri";
import {
  CaptureModal,
  CreateProjectModal,
  CreateWorkspaceModal,
  EmptyState,
  FileLinkModal,
  TicketEditModal,
} from "../components/modals";
import { Inspector } from "../components/inspector";
import { Btn, Notice } from "../components/primitives";
import { MainHeader, PaneResizeHandle, Sidebar, WorkspaceToolbar } from "../components/shell";
import { CockpitContent } from "../components/views";
import {
  useFeedback,
  useFilters,
  useLayout,
  useModals,
  useNavigation,
  useProjectActions,
  useSelection,
  useWorkspace,
} from "./AppProvider";

export function AppShell() {
  const layout = useLayout();

  return (
    <div className="app-frame w-screen h-screen bg-surface grid grid-rows-[36px_1fr] overflow-hidden">
      <ToolbarRegion />
      <div
        className="app-shell grid grid-cols-shell xl:grid-cols-shell-wide h-full min-h-0 min-w-0 overflow-hidden"
        style={layout.shellStyle}
      >
        <SidebarRegion />
        <PaneResizeHandle
          side="left"
          value={layout.left.value}
          min={layout.left.min}
          max={layout.left.max}
          onPointerDown={layout.left.beginResize}
          onReset={layout.left.reset}
        />
        <MainRegion />
        <PaneResizeHandle
          side="right"
          value={layout.right.value}
          min={layout.right.min}
          max={layout.right.max}
          onPointerDown={layout.right.beginResize}
          onReset={layout.right.reset}
        />
        <InspectorRegion />
      </div>
      <ModalRegion />
    </div>
  );
}

function ToolbarRegion() {
  const feedback = useFeedback();
  const layout = useLayout();
  const workspace = useWorkspace();

  return (
    <WorkspaceToolbar
      workspace={workspace.data}
      project={workspace.selectedProject}
      rootPath={workspace.rootPath}
      style={layout.shellStyle}
      onRefresh={() => workspace.refresh()}
      onOpenFolder={() => {
        if (!isTauri()) {
          feedback.setNotice("Run Waymark through Tauri to open the workspace folder.");
          return;
        }
        openPath(workspace.rootPath);
      }}
      onOpenConfig={() => {
        if (!isTauri()) {
          feedback.setNotice("Run Waymark through Tauri to open waymark.yaml.");
          return;
        }
        openPath(`${workspace.rootPath}/waymark.yaml`);
      }}
    />
  );
}

function SidebarRegion() {
  const modals = useModals();
  const navigation = useNavigation();
  const workspace = useWorkspace();

  return (
    <Sidebar
      workspace={workspace.data}
      rootPath={workspace.rootPath}
      onRootPathChange={workspace.setRootPath}
      selectedSlug={workspace.selectedProject?.config.slug ?? null}
      onSelectProject={workspace.selectProject}
      nav={navigation.nav}
      onNav={navigation.setNav}
      onRefresh={() => workspace.refresh()}
      onSeed={workspace.seedWorkspace}
      onCreateWorkspace={modals.openCreateWorkspace}
      onChooseWorkspace={workspace.chooseWorkspace}
      onRequestProject={modals.openCreateProject}
    />
  );
}

function MainRegion() {
  return (
    <main className="app-main bg-surface flex flex-col min-w-0 min-h-0 overflow-hidden">
      <MainHeaderRegion />
      <MainContentRegion />
    </main>
  );
}

function MainHeaderRegion() {
  const actions = useProjectActions();
  const feedback = useFeedback();
  const filters = useFilters();
  const modals = useModals();
  const navigation = useNavigation();
  const selection = useSelection();
  const workspace = useWorkspace();
  const selectedProject = workspace.selectedProject;

  return (
    <MainHeader
      project={selectedProject}
      workspace={workspace.data}
      tab={navigation.tab}
      onTab={navigation.setTab}
      selectedTicket={selection.selectedTicket}
      selectedCount={selection.multi.length}
      handoffDisabled={!selectedProject || (!selection.selectedTicket && selection.multi.length === 0)}
      search={filters.search}
      onSearch={filters.setSearch}
      searchInputRef={filters.searchInputRef}
      gapsOnly={filters.gapsOnly}
      onToggleGaps={filters.toggleGapsOnly}
      onCapture={() => {
        if (!isTauri()) {
          feedback.setNotice("Run Waymark through Tauri to capture tickets into YAML.");
          return;
        }
        modals.openCapture();
      }}
      onSendHandoff={actions.sendHandoff}
    />
  );
}

function MainContentRegion() {
  const feedback = useFeedback();
  const filters = useFilters();
  const modals = useModals();
  const navigation = useNavigation();
  const selection = useSelection();
  const workspace = useWorkspace();
  const selectedProject = workspace.selectedProject;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-[18px] pt-3.5 pb-7">
      <FeedbackNotices />
      {!workspace.data ? (
        <EmptyState
          tauri={isTauri()}
          rootPath={workspace.rootPath}
          onRootPath={workspace.setRootPath}
          onChooseWorkspace={workspace.chooseWorkspace}
          onSeed={workspace.seedWorkspace}
          onRefresh={() => workspace.refresh()}
          onCreateWorkspace={modals.openCreateWorkspace}
        />
      ) : !selectedProject ? (
        <NoProjectState onCreateProject={modals.openCreateProject} />
      ) : (
        <CockpitContent
          nav={navigation.nav}
          tab={navigation.tab}
          project={selectedProject}
          workspace={workspace.data}
          selectedTicketId={selection.selectedTicketId}
          selectedTicket={selection.selectedTicket}
          onSelectTicket={selection.selectTicket}
          onSelectThread={selection.selectThread}
          onSelectNote={selection.selectNote}
          multi={selection.multi}
          toggleMulti={selection.toggleMulti}
          search={filters.search}
          gapsOnly={filters.gapsOnly}
          onNav={navigation.setNav}
          onAddFile={() => {
            if (!isTauri()) {
              feedback.setNotice("Run Waymark through Tauri to add file context.");
              return;
            }
            modals.openFileModal();
          }}
          onAddLink={() => {
            if (!isTauri()) {
              feedback.setNotice("Run Waymark through Tauri to add links.");
              return;
            }
            modals.openLinkModal();
          }}
        />
      )}
    </div>
  );
}

function FeedbackNotices() {
  const feedback = useFeedback();

  return (
    <>
      {feedback.notice ? (
        <Notice tone="ok">
          <Check size={13} /> {feedback.notice}
        </Notice>
      ) : null}
      {feedback.error ? (
        <Notice tone="err">
          <AlertTriangle size={13} /> {feedback.error}
        </Notice>
      ) : null}
      {!isTauri() ? (
        <Notice tone="warn">
          <AlertTriangle size={13} />
          Run with <code>pnpm tauri dev</code> to load and write the local Markdown/YAML workspace.
        </Notice>
      ) : null}
    </>
  );
}

function NoProjectState({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <div className="grid place-items-center gap-3.5 py-16 px-8 text-center text-ink-faint">
      <Triangle size={28} className="text-accent" />
      <h2 className="m-0 text-[18px] font-semibold tracking-[-0.01em] text-ink">
        No projects in this workspace
      </h2>
      <p className="m-0 max-w-[460px] text-[13px] leading-[1.55]">
        Create a project to add its readable <code>project.yaml</code>, tickets, links, and thread files.
      </p>
      <Btn variant="primary" onClick={onCreateProject}>
        <Plus size={13} /> Create project
      </Btn>
    </div>
  );
}

function InspectorRegion() {
  const actions = useProjectActions();
  const selection = useSelection();
  const workspace = useWorkspace();

  return (
    <Inspector
      mode={selection.inspectorMode}
      onMode={selection.setInspectorMode}
      project={workspace.selectedProject}
      ticket={selection.selectedTicket}
      thread={selection.selectedThread}
      note={selection.selectedNote}
      multi={selection.multi}
      workspace={workspace.data}
      onSendHandoff={actions.sendHandoff}
      onStatus={actions.changeStatus}
      onEditTicket={selection.editTicket}
    />
  );
}

function ModalRegion() {
  const actions = useProjectActions();
  const modals = useModals();
  const selection = useSelection();
  const workspace = useWorkspace();
  const selectedProject = workspace.selectedProject;

  return (
    <>
      {modals.captureOpen && selectedProject ? (
        <CaptureModal
          project={selectedProject}
          onClose={modals.closeCapture}
          onCreated={actions.capture}
        />
      ) : null}
      {modals.createWorkspaceOpen ? (
        <CreateWorkspaceModal
          tauri={isTauri()}
          onClose={modals.closeCreateWorkspace}
          onChooseWorkspace={workspace.chooseDirectory}
          onCreate={workspace.createWorkspace}
        />
      ) : null}
      {modals.createProjectOpen ? (
        <CreateProjectModal
          tauri={isTauri()}
          workspace={workspace.data}
          onClose={modals.closeCreateProject}
          onCreate={workspace.createProject}
        />
      ) : null}
      {selection.editingTicket && selectedProject ? (
        <TicketEditModal
          ticket={selection.editingTicket}
          onClose={selection.clearEditingTicket}
          onSave={actions.saveTicket}
        />
      ) : null}
      {modals.fileModalMode && selectedProject ? (
        <FileLinkModal
          mode={modals.fileModalMode}
          project={selectedProject}
          selectedTicket={selection.selectedTicket}
          onClose={modals.closeFileModal}
          onAddFile={actions.addFile}
          onAddLink={actions.addLink}
        />
      ) : null}
    </>
  );
}
