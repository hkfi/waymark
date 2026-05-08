import { AlertTriangle, Check, Info, Plus, Triangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { isTauri, openPath } from "../tauri";
import {
  CaptureModal,
  CreateProjectModal,
  CreateWorkspaceModal,
  EmptyState,
  FileLinkModal,
  RepoOnboardingModal,
  TicketEditModal,
} from "../components/modals";
import { Inspector } from "../components/inspector";
import { Btn, cx } from "../components/primitives";
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
import { useAppUpdates } from "./hooks/useAppUpdates";
import { useCommandKeyHint } from "./hooks/useCommandKeyHint";

export function AppShell() {
  const layout = useLayout();

  return (
    <div className="app-viewport">
      <div className="app-frame bg-surface grid grid-rows-[36px_1fr] overflow-hidden" style={layout.zoom.style}>
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
        <FeedbackToasts />
      </div>
    </div>
  );
}

function ToolbarRegion() {
  const feedback = useFeedback();
  const layout = useLayout();
  const workspace = useWorkspace();
  const updates = useAppUpdates(feedback);

  return (
    <WorkspaceToolbar
      workspace={workspace.data}
      project={workspace.selectedProject}
      rootPath={workspace.rootPath}
      style={layout.shellStyle}
      updateStatus={updates.status}
      updateVersion={updates.version}
      updateProgress={updates.progress}
      onInstallUpdate={updates.installUpdate}
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
  const showShortcutHints = useCommandKeyHint();

  return (
    <Sidebar
      workspace={workspace.data}
      rootPath={workspace.rootPath}
      onRootPathChange={workspace.setRootPath}
      selectedSlug={workspace.selectedProject?.config.slug ?? null}
      onSelectProject={workspace.selectProject}
      nav={navigation.nav}
      onNav={navigation.setNav}
      showShortcutHints={showShortcutHints}
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
  const ticketScopedView = navigation.nav === "home" || navigation.nav === "tickets";
  const headerTicket = ticketScopedView ? selection.selectedTicket : null;
  const selectedCount = ticketScopedView ? selection.multi.length : 0;

  return (
    <MainHeader
      project={selectedProject}
      workspace={workspace.data}
      selectedTicket={headerTicket}
      selectedCount={selectedCount}
      handoffDisabled={!selectedProject || !ticketScopedView || (!headerTicket && selectedCount === 0)}
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
      onOpenAssistant={() => selection.openAssistant()}
      onSendHandoff={actions.sendHandoff}
    />
  );
}

function MainContentRegion() {
  const actions = useProjectActions();
  const feedback = useFeedback();
  const filters = useFilters();
  const modals = useModals();
  const navigation = useNavigation();
  const selection = useSelection();
  const workspace = useWorkspace();
  const selectedProject = workspace.selectedProject;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-[18px] pt-3.5 pb-7">
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
          onOnboardRepo={() => {
            if (!isTauri()) {
              feedback.setNotice("Run Waymark through Tauri to onboard local repos.");
              return;
            }
            modals.openRepoOnboarding();
          }}
          onToggleLinkHandoff={(link, included) =>
            actions.updateLink({
              ...link,
              include_in_handoff: !included,
            })
          }
          onDeleteLink={actions.deleteLink}
          selectedContextKey={selection.selectedContextKey}
          onSelectContext={selection.selectContext}
        />
      )}
    </div>
  );
}

function FeedbackToasts() {
  const feedback = useFeedback();

  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {feedback.notice ? (
        <Toast tone="ok" onClose={() => feedback.setNotice(null)}>
          {feedback.notice}
        </Toast>
      ) : null}
      {feedback.error ? (
        <Toast tone="err" onClose={() => feedback.setError(null)}>
          {feedback.error}
        </Toast>
      ) : null}
      {!isTauri() ? (
        <Toast tone="warn" onClose={undefined}>
          Run with <code>pnpm tauri dev</code> to load and write the local Markdown/YAML workspace.
        </Toast>
      ) : null}
    </div>
  );
}

function Toast({
  tone,
  onClose,
  children,
}: {
  tone: "ok" | "warn" | "err";
  onClose?: () => void;
  children: ReactNode;
}) {
  const Icon = tone === "ok" ? Check : tone === "warn" ? Info : AlertTriangle;
  const toneClass = {
    ok: "toast-ok",
    warn: "toast-warn",
    err: "toast-err",
  }[tone];

  return (
    <div className={cx("toast", toneClass)} role={tone === "err" ? "alert" : "status"}>
      <Icon size={14} className="toast-icon" />
      <div className="toast-body">{children}</div>
      {onClose ? (
        <button type="button" className="toast-close" onClick={onClose} aria-label="Dismiss notification">
          <X size={13} />
        </button>
      ) : null}
    </div>
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
  const navigation = useNavigation();
  const selection = useSelection();
  const workspace = useWorkspace();
  const inspectorScope =
    navigation.nav === "context" ? "context" : navigation.nav === "memory" ? "memory" : "tickets";
  const ticket = inspectorScope === "tickets" ? selection.selectedTicket : null;
  const mode =
    selection.inspectorMode === "assistant"
      ? "assistant"
      : inspectorScope === "context"
        ? "context"
        : inspectorScope === "memory"
          ? selection.inspectorMode === "thread" || selection.inspectorMode === "note"
            ? selection.inspectorMode
            : selection.selectedNote
              ? "note"
              : "thread"
          : selection.inspectorMode === "context"
            ? "ticket"
            : selection.inspectorMode;

  return (
    <Inspector
      scope={inspectorScope}
      mode={mode}
      onMode={selection.setInspectorMode}
      project={workspace.selectedProject}
      ticket={ticket}
      thread={selection.selectedThread}
      note={selection.selectedNote}
      contextRow={selection.selectedContext}
      multi={selection.multi}
      workspace={workspace.data}
      onSendHandoff={actions.sendHandoff}
      handoffOptions={actions.handoffOptions}
      selectedHandoffContextIds={actions.selectedHandoffContextIds}
      onToggleHandoffContext={actions.toggleHandoffContext}
      onStatus={actions.changeStatus}
      onEditTicket={selection.editTicket}
      onDeleteTicket={actions.deleteTicket}
      onToggleContextHandoff={(link, included) =>
        actions.updateLink({
          ...link,
          include_in_handoff: !included,
        })
      }
      onDeleteContextLink={actions.deleteLink}
      onSaved={() => workspace.refresh()}
      assistantLaunchRequest={selection.assistantLaunchRequest}
      onAssistantLaunchConsumed={selection.clearAssistantLaunchRequest}
      onAskAssistant={selection.openAssistant}
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
          onClose={modals.closeFileModal}
          onAddLink={actions.addLink}
        />
      ) : null}
      {modals.repoOnboardingOpen && selectedProject ? (
        <RepoOnboardingModal
          tauri={isTauri()}
          project={selectedProject}
          onClose={modals.closeRepoOnboarding}
          onChooseRepo={workspace.chooseDirectory}
          onAddRepo={actions.onboardRepo}
        />
      ) : null}
    </>
  );
}
