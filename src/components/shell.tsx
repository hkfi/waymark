import { AlertTriangle, Bot, Download, FileText, FolderOpen, GitBranch, LayoutGrid, ListChecks, ListOrdered, Plus, RefreshCw, Search, Sparkles, type LucideIcon } from "lucide-react";
import { useMemo, type ButtonHTMLAttributes, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { AppUpdateStatus, Ticket, WaymarkProject, WorkspaceData } from "../types";
import { projectColor, projectMark, projectStatusKind, type NavId } from "../app/model";
import { NAV_SHORTCUTS } from "../app/hooks/useKeyboardShortcuts";
import { Btn, CommandShortcutBadge, cx, LetterMark } from "./primitives";
import { ticketWarnings } from "../workspace";

export function WorkspaceToolbar({
  workspace,
  project,
  rootPath,
  style,
  updateStatus,
  updateVersion,
  updateProgress,
  onInstallUpdate,
  onRefresh,
  onOpenFolder,
  onOpenConfig,
}: {
  workspace: WorkspaceData | null;
  project: WaymarkProject | null;
  rootPath: string;
  style: CSSProperties;
  updateStatus: AppUpdateStatus;
  updateVersion: string | null;
  updateProgress: number | null;
  onInstallUpdate: () => void;
  onRefresh: () => void;
  onOpenFolder: () => void;
  onOpenConfig: () => void;
}) {
  const updateLabel = updateStatus === "installing"
    ? updateProgress === null
      ? "Updating"
      : `Updating ${Math.round(updateProgress * 100)}%`
    : updateStatus === "restarting"
      ? "Restarting"
      : updateVersion
        ? `Update ${updateVersion}`
        : "Update";
  const showUpdate = updateStatus === "available" || updateStatus === "installing" || updateStatus === "restarting";

  return (
    <div
      data-tauri-drag-region
      className="app-toolbar grid items-center border-b border-line bg-surface-rail select-none min-w-0 overflow-hidden"
      style={style}
    >
      <div data-tauri-drag-region className="app-toolbar-brand min-w-0" aria-hidden="true" />
      <div data-tauri-drag-region className="app-toolbar-path flex items-center justify-center gap-2 font-mono text-[11px] text-ink-faint min-w-0 px-3 overflow-hidden">
        <span data-tauri-drag-region className="truncate min-w-0 text-ink-soft" title={rootPath}>{rootPath}</span>
        <span data-tauri-drag-region className="text-ink-mute shrink-0">/</span>
        <span data-tauri-drag-region className="text-ink-soft shrink-0 truncate">
          {project?.config.name ?? workspace?.config.name ?? "No workspace"}
        </span>
        {project ? (
          <>
            <span data-tauri-drag-region className="text-ink-mute shrink-0">·</span>
            <span data-tauri-drag-region className="text-ink-mute shrink-0">{project.config.stage}</span>
          </>
        ) : null}
      </div>
      <div data-tauri-drag-region className="app-toolbar-actions flex items-center justify-end gap-1 px-2.5 min-w-0 whitespace-nowrap">
        <span data-tauri-drag-region className="h-[22px] px-2 rounded-[3px] text-[11px] text-ink-faint border border-line-soft bg-surface-2 inline-flex items-center gap-1.5">
          <GitBranch size={12} className="pointer-events-none" /> main
        </span>
        {showUpdate ? (
          <ToolbarButton
            onClick={onInstallUpdate}
            disabled={updateStatus !== "available"}
            title={updateVersion ? `Install Waymark ${updateVersion}` : "Install app update"}
            className="border-[oklch(0.74_0.13_150_/_0.35)] bg-[oklch(0.74_0.13_150_/_0.12)] text-lane-done hover:bg-[oklch(0.74_0.13_150_/_0.18)]"
          >
            {updateStatus === "available" ? (
              <Download size={12} />
            ) : (
              <RefreshCw size={12} className="animate-spin" />
            )}
            {updateLabel}
          </ToolbarButton>
        ) : null}
        <ToolbarButton onClick={onRefresh} title="Reload workspace">
          <RefreshCw size={12} /> Reload
        </ToolbarButton>
        <ToolbarButton onClick={onOpenFolder} title="Open workspace folder">
          <FolderOpen size={12} /> Folder
        </ToolbarButton>
        <ToolbarButton onClick={onOpenConfig} title="Open waymark.yaml">
          <FileText size={12} /> Config
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...buttonProps } = rest;

  return (
    <button
      {...buttonProps}
      className={cx(
        "h-[22px] px-2 rounded-[3px] text-[11px] text-ink-soft border border-transparent hover:border-line-soft hover:bg-surface-3 hover:text-ink inline-flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-default",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PaneResizeHandle({
  side,
  value,
  min,
  max,
  onPointerDown,
  onReset,
}: {
  side: "left" | "right";
  value: number;
  min: number;
  max: number;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onReset: () => void;
}) {
  return (
    <div
      role="separator"
      aria-label={`${side === "left" ? "Left sidebar" : "Inspector"} width`}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "Enter") onReset();
      }}
      className={cx("pane-resizer", side)}
    />
  );
}

/* -------------------------------- sidebar ------------------------------- */

export function Sidebar({
  workspace,
  rootPath,
  onRootPathChange,
  selectedSlug,
  onSelectProject,
  nav,
  onNav,
  showShortcutHints,
  onRefresh,
  onSeed,
  onCreateWorkspace,
  onChooseWorkspace,
  onRequestProject,
}: {
  workspace: WorkspaceData | null;
  rootPath: string;
  onRootPathChange: (value: string) => void;
  selectedSlug: string | null;
  onSelectProject: (slug: string) => void;
  nav: NavId;
  onNav: (id: NavId) => void;
  showShortcutHints: boolean;
  onRefresh: () => void;
  onSeed: () => void;
  onCreateWorkspace: () => void;
  onChooseWorkspace: () => void;
  onRequestProject: () => void;
}) {
  const counts = useMemo(() => aggregateNavCounts(workspace), [workspace]);
  const navItems: { id: NavId; label: string; icon: LucideIcon; count?: number }[] = [
    { id: "home", label: "Overview", icon: LayoutGrid, count: workspace?.projects.length ?? 0 },
    { id: "tickets", label: "Tickets", icon: ListChecks, count: counts.active },
    { id: "memory", label: "Memory", icon: ListOrdered, count: counts.memory },
    { id: "context", label: "Context", icon: FileText, count: counts.context },
  ];

  return (
    <aside className="sidebar-shell bg-surface-rail border-r border-line flex flex-col min-h-0">
      <div className="px-2.5 py-2.5 border-b border-line-soft whitespace-nowrap overflow-hidden">
        <div className="text-[10px] uppercase tracking-[0.09em] text-ink-mute mx-1 my-1 font-medium">
          Workspace
        </div>
        <div className="flex items-center gap-2 h-[26px] px-2 rounded-[3px] bg-surface-3 border border-line-soft font-mono text-[11px] text-ink-soft">
          <span
            className={cx(
              "w-1.5 h-1.5 rounded-full shrink-0",
              workspace
                ? "bg-lane-done shadow-[0_0_0_2px_oklch(0.74_0.13_150_/_0.18)]"
                : "bg-ink-mute",
            )}
          />
          <input
            value={rootPath}
            onChange={(event) => onRootPathChange(event.target.value)}
            spellCheck={false}
            aria-label="Current workspace path"
            className="flex-1 min-w-0 bg-transparent border-0 outline-0 p-0 font-inherit truncate"
          />
          <button
            onClick={onChooseWorkspace}
            className="w-[18px] h-[18px] grid place-items-center rounded-[3px] text-ink-faint hover:bg-surface-4 hover:text-ink"
            aria-label="Choose workspace folder"
            title="Choose workspace folder"
          >
            <FolderOpen size={12} />
          </button>
        </div>
        <div className="flex gap-1.5 mt-1.5 px-1 whitespace-nowrap overflow-hidden">
          <span className="font-mono text-[10.5px] text-ink-faint inline-flex items-center gap-1 shrink-0">
            <GitBranch size={11} /> main
          </span>
          <span className="ml-auto font-mono text-[10.5px] text-ink-mute shrink-0">
            {workspace ? `${workspace.projects.length} projects` : "not loaded"}
          </span>
        </div>
        <div className="flex gap-1 mt-1.5">
          <SidebarChipButton onClick={onRefresh}>
            <RefreshCw size={11} /> Reload
          </SidebarChipButton>
          <SidebarChipButton onClick={onCreateWorkspace} title="Create a workspace in a separate folder">
            <Plus size={11} /> New…
          </SidebarChipButton>
          <SidebarChipButton onClick={onSeed}>
            <Sparkles size={11} /> Sample
          </SidebarChipButton>
        </div>
      </div>

      <nav className="p-2 border-b border-line-soft flex flex-col gap-px">
        {navItems.map((item) => (
          <NavItem
            key={item.id}
            label={item.label}
            count={item.count}
            icon={item.icon}
            active={nav === item.id}
            shortcut={navShortcutLabel(item.id)}
            showShortcut={showShortcutHints}
            onClick={() => onNav(item.id)}
          />
        ))}
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-1.5 pb-3">
        <div className="flex items-center gap-1.5 px-1.5 pt-2 pb-1.5">
          <div className="text-[10px] uppercase tracking-[0.09em] text-ink-mute flex-1 font-medium">
            Projects
          </div>
          <button
            onClick={onRequestProject}
            className="w-[18px] h-[18px] grid place-items-center rounded-[3px] text-ink-faint hover:bg-surface-3 hover:text-ink"
            aria-label="New project"
            title="Create project"
          >
            <Plus size={12} />
          </button>
        </div>
        {workspace?.projects.map((project, index) => {
          const kind = projectStatusKind(project);
          const active = project.tickets.filter(
            (ticket) => ticket.status === "now" || ticket.status === "next",
          ).length;
          return (
            <ProjectRow
              key={project.config.slug}
              project={project}
              index={index}
              active={active}
              kind={kind}
              selected={project.config.slug === selectedSlug}
              onClick={() => onSelectProject(project.config.slug)}
            />
          );
        })}
        {!workspace?.projects.length ? (
          <div className="px-1.5 py-2.5 text-ink-mute text-[12px]">No projects yet.</div>
        ) : null}
      </div>

      <div className="border-t border-line-soft px-3 py-2 flex items-center gap-2 text-[11px] text-ink-faint whitespace-nowrap overflow-hidden">
        <span
          className={cx(
            "w-1.5 h-1.5 rounded-full shrink-0",
            workspace
              ? counts.warnings > 0
                ? "bg-warn shadow-[0_0_0_3px_oklch(0.82_0.14_90_/_0.16)]"
                : "bg-lane-done shadow-[0_0_0_3px_oklch(0.74_0.13_150_/_0.18)]"
              : "bg-ink-mute",
          )}
        />
        <span className="shrink-0 text-ink-soft">{workspace ? "Workspace loaded" : "No workspace"}</span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-mute truncate">
          {workspace
            ? `${workspace.projects.length} project${workspace.projects.length === 1 ? "" : "s"}${counts.warnings ? ` · ${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}` : ""}`
            : "Open or create"}
        </span>
        <button
          onClick={onRefresh}
          className="w-[18px] h-[18px] grid place-items-center rounded-[3px] text-ink-faint hover:bg-surface-3 hover:text-ink shrink-0"
          aria-label="Reload workspace"
          title="Reload workspace"
        >
          <RefreshCw size={11} />
        </button>
      </div>
    </aside>
  );
}

function SidebarChipButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="h-[22px] px-2 rounded-[3px] text-[11px] text-ink-faint border border-line-soft bg-surface-2 hover:bg-surface-4 hover:text-ink inline-flex items-center gap-1"
    >
      {children}
    </button>
  );
}

function NavItem({
  label,
  count,
  icon: Icon,
  active,
  shortcut,
  showShortcut,
  onClick,
}: {
  label: string;
  count?: number;
  icon: LucideIcon;
  active: boolean;
  shortcut?: string;
  showShortcut: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex items-center gap-2.5 h-[26px] px-2 rounded-[3px] text-[12.5px] cursor-pointer w-full text-left",
        active
          ? "bg-accent-soft text-accent-fg shadow-[inset_2px_0_0_var(--color-accent)]"
          : "text-ink-soft hover:bg-surface-3 hover:text-ink",
      )}
    >
      <span className={cx("w-3.5 inline-flex shrink-0", active ? "text-accent" : "text-ink-faint")}>
        <Icon size={13} />
      </span>
      <span className="min-w-0 truncate">{label}</span>
      <span className="ml-auto inline-grid grid-flow-col auto-cols-max items-center gap-1.5 shrink-0">
        {typeof count === "number" && count > 0 ? (
          <span
            className={cx(
              "font-mono text-[10.5px] px-1.5 rounded-[3px] leading-[15px]",
              active ? "bg-[oklch(0.78_0.135_75_/_0.18)] text-accent" : "bg-surface-3 text-ink-mute",
            )}
          >
            {count}
          </span>
        ) : null}
        {showShortcut && shortcut ? (
          <CommandShortcutBadge value={shortcut} tone={active ? "active" : "subtle"} />
        ) : null}
      </span>
    </button>
  );
}

function navShortcutLabel(id: NavId) {
  const index = NAV_SHORTCUTS.indexOf(id);
  return index >= 0 ? String(index + 1) : undefined;
}

function ProjectRow({
  project,
  index,
  active,
  kind,
  selected,
  onClick,
}: {
  project: WaymarkProject;
  index: number;
  active: number;
  kind: "warn" | "ok" | "idle";
  selected: boolean;
  onClick: () => void;
}) {
  const dot = kind === "ok" ? "bg-lane-done" : kind === "warn" ? "bg-warn" : "bg-ink-mute";
  const activeLabel = `${active} active ticket${active === 1 ? "" : "s"}`;
  const statusLabel = kind === "warn" ? "has warnings" : kind === "ok" ? "healthy" : "idle";
  const description = `${project.config.name}: ${activeLabel} in Now or Next, ${statusLabel}.`;
  return (
    <button
      onClick={onClick}
      aria-label={description}
      title={description}
      className={cx(
        "grid grid-cols-proj items-center gap-2 h-[30px] px-2 rounded-[3px] cursor-pointer w-full text-left",
        selected
          ? "bg-surface-row-selected text-ink shadow-[inset_2px_0_0_var(--color-accent)]"
          : "text-ink-soft hover:bg-surface-3 hover:text-ink",
      )}
    >
      <span
        className="w-4 h-4 rounded-[3px] grid place-items-center text-[9px] font-bold font-mono tracking-[-0.04em] text-[oklch(0.16_0.01_250)] shrink-0"
        style={{ background: projectColor(project.config.slug, index) }}
      >
        {projectMark(project.config.slug)}
      </span>
      <span className="text-[12.5px] truncate min-w-0">{project.config.name}</span>
      <span className="flex items-center gap-1 shrink-0">
        <span className={cx("w-[5px] h-[5px] rounded-full", dot)} />
        <span
          className={cx(
            "font-mono text-[10px] leading-[16px] px-1.5 rounded-[3px] border",
            selected
              ? "border-line-soft bg-surface-2 text-ink-soft"
              : "border-transparent bg-surface-3 text-ink-mute",
          )}
        >
          {active} active
        </span>
      </span>
    </button>
  );
}

function aggregateNavCounts(workspace: WorkspaceData | null) {
  if (!workspace) return { active: 0, memory: 0, context: 0, warnings: 0 };
  let active = 0;
  let memory = 0;
  let context = 0;
  let warnings = workspace.warnings.length;
  for (const project of workspace.projects) {
    for (const ticket of project.tickets) {
      if (ticket.status === "now" || ticket.status === "next" || ticket.status === "blocked") active += 1;
      context += ticket.linked_files?.length ?? 0;
    }
    memory += project.decisions.length + project.threads.length + project.ideas.length;
    context += (project.config.repos?.length ?? 0) + project.links.length;
    context += project.decisions.length + project.ideas.length;
    warnings += project.warnings.length;
  }
  return { active, memory, context, warnings };
}

/* ------------------------------ main header ----------------------------- */

export function MainHeader({
  project,
  workspace,
  selectedTicket,
  selectedCount,
  handoffDisabled,
  search,
  onSearch,
  searchInputRef,
  showGapsFilter,
  gapsOnly,
  onToggleGaps,
  onCapture,
  onOpenAssistant,
  onSendHandoff,
}: {
  project: WaymarkProject | null;
  workspace: WorkspaceData | null;
  selectedTicket: Ticket | null;
  selectedCount: number;
  handoffDisabled: boolean;
  search: string;
  onSearch: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  showGapsFilter: boolean;
  gapsOnly: boolean;
  onToggleGaps: () => void;
  onCapture: () => void;
  onOpenAssistant: () => void;
  onSendHandoff: () => void;
}) {
  const handoffLabel =
    selectedCount > 0 ? `Handoff ${selectedCount}` : selectedTicket ? `Handoff: ${selectedTicket.title}` : "Handoff";
  const gapCount = useMemo(() => {
    if (!project) return 0;
    return project.tickets.filter((ticket) => ticket.status !== "idea" && ticketWarnings(project, ticket).length > 0).length;
  }, [project]);
  const gapsTitle = gapsOnly
    ? "Showing tickets with readiness gaps. Click to show all tickets."
    : "Show only tickets with readiness gaps: missing summary, acceptance criteria, repos, files, decisions, or AI threads.";

  return (
    <>
      <div className="flex items-center gap-3.5 px-[18px] h-[46px] border-b border-line shrink-0 min-w-0 overflow-hidden">
        <h1 className="m-0 text-[14px] font-semibold tracking-[-0.005em] text-ink flex items-center gap-2.5 shrink-0 min-w-0 max-w-[40%]">
          {project ? (
            <LetterMark
              value={projectMark(project.config.slug)}
              style={{ background: projectColor(project.config.slug, 0) }}
            />
          ) : null}
          <span className="truncate">
            {project?.config.name ?? workspace?.config.name ?? "No project"}
          </span>
          <span className="font-mono text-[10.5px] text-ink-faint font-normal px-1.5 py-0.5 border border-line rounded-[3px] bg-surface-2 shrink-0">
            {project?.config.stage ?? "—"}
          </span>
        </h1>
        <div className="text-[11.5px] text-ink-faint flex-1 min-w-0 truncate">
          Focus: <b className="text-ink-soft font-medium">{project?.config.current_focus || project?.config.summary || "—"}</b>
        </div>
      </div>

      <div className="flex items-center gap-2 px-[18px] py-2.5 border-b border-line shrink-0">
        <div className="flex-1 min-w-0 flex items-center gap-2 h-7 px-2.5 bg-surface-2 border border-line-soft rounded-[5px] text-ink-faint text-[12px]">
          <Search size={13} />
          <input
            placeholder="Find ticket, decision, thread, file…"
            value={search}
            ref={searchInputRef}
            onChange={(event) => onSearch(event.target.value)}
            className="flex-1 min-w-0 bg-transparent border-0 outline-0 text-[12.5px] text-ink placeholder:text-ink-mute"
          />
          <CommandShortcutBadge value="K" tone="subtle" />
        </div>
        {showGapsFilter ? (
          <Btn
            variant={gapsOnly ? "default" : "ghost"}
            title={gapsTitle}
            onClick={onToggleGaps}
            aria-pressed={gapsOnly}
            aria-label={gapsOnly ? "Clear readiness gap filter" : "Show only tickets with readiness gaps"}
            className={cx(
              "min-w-[132px] justify-between",
              gapsOnly && "border-warn bg-[oklch(0.82_0.14_90_/_0.10)] text-warn hover:bg-[oklch(0.82_0.14_90_/_0.16)] hover:text-ink",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle size={13} />
              <span>{gapsOnly ? "Gaps only" : "Readiness gaps"}</span>
            </span>
            <span
              className={cx(
                "ml-1 inline-flex h-4 min-w-[18px] items-center justify-center rounded-[3px] border px-1 font-mono text-[10px] leading-none",
                gapsOnly
                  ? "border-[oklch(0.82_0.14_90_/_0.36)] bg-[oklch(0.82_0.14_90_/_0.13)] text-warn"
                  : "border-line-soft bg-surface-2 text-ink-mute",
              )}
            >
              {gapCount}
            </span>
          </Btn>
        ) : null}
        <Btn variant="ghost" onClick={onCapture}>
          <Plus size={13} /> Capture
        </Btn>
        <Btn variant="ai" onClick={onOpenAssistant} title="Ask Codex about this project">
          <Bot size={13} /> Ask Codex <CommandShortcutBadge value="⇧A" tone="subtle" />
        </Btn>
        <Btn variant="primary" onClick={onSendHandoff} disabled={handoffDisabled}>
          <Sparkles size={11} /> <span className="max-w-[180px] truncate">{handoffLabel}</span> <CommandShortcutBadge value="↵" tone="primary" />
        </Btn>
      </div>
    </>
  );
}
