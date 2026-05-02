import { FileText, FolderOpen, GitBranch, Inbox, LayoutGrid, Lightbulb, ListChecks, ListOrdered, MessageSquareText, Plus, RefreshCw, Search, Sliders, Sparkles, Triangle, type LucideIcon } from "lucide-react";
import { useMemo, type ButtonHTMLAttributes, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import type { Ticket, WaymarkProject, WorkspaceData } from "../types";
import { projectColor, projectMark, projectStatusKind, type MainTab, type NavId } from "../app/model";
import { Btn, cx } from "./primitives";

export function WorkspaceToolbar({
  workspace,
  project,
  rootPath,
  style,
  onRefresh,
  onOpenFolder,
  onOpenConfig,
}: {
  workspace: WorkspaceData | null;
  project: WaymarkProject | null;
  rootPath: string;
  style: CSSProperties;
  onRefresh: () => void;
  onOpenFolder: () => void;
  onOpenConfig: () => void;
}) {
  return (
    <div
      className="app-toolbar grid items-center border-b border-line bg-surface-rail select-none min-w-0 overflow-hidden"
      style={style}
    >
      <div data-tauri-drag-region className="app-toolbar-brand flex items-center gap-2 px-3.5 min-w-0">
        <Triangle size={12} className="text-accent shrink-0" fill="currentColor" strokeWidth={0} />
        <span className="text-[12px] font-semibold text-ink truncate">Waymark</span>
      </div>
      <div data-tauri-drag-region className="app-toolbar-path flex items-center justify-center gap-2 font-mono text-[11px] text-ink-faint min-w-0 px-3 overflow-hidden">
        <span className="truncate min-w-0 text-ink-soft" title={rootPath}>{rootPath}</span>
        <span className="text-ink-mute shrink-0">/</span>
        <span className="text-ink-soft shrink-0 truncate">
          {project?.config.name ?? workspace?.config.name ?? "No workspace"}
        </span>
        {project ? (
          <>
            <span className="text-ink-mute shrink-0">·</span>
            <span className="text-ink-mute shrink-0">{project.config.stage}</span>
          </>
        ) : null}
      </div>
      <div className="app-toolbar-actions flex items-center justify-end gap-1 px-2.5 min-w-0 whitespace-nowrap">
        <span className="h-[22px] px-2 rounded-[3px] text-[11px] text-ink-faint border border-line-soft bg-surface-2 inline-flex items-center gap-1.5">
          <GitBranch size={12} /> main
        </span>
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
  return (
    <button
      {...rest}
      className="h-[22px] px-2 rounded-[3px] text-[11px] text-ink-soft border border-transparent hover:border-line-soft hover:bg-surface-3 hover:text-ink inline-flex items-center gap-1.5"
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
  onRefresh: () => void;
  onSeed: () => void;
  onCreateWorkspace: () => void;
  onChooseWorkspace: () => void;
  onRequestProject: () => void;
}) {
  const counts = useMemo(() => aggregateNavCounts(workspace), [workspace]);
  const navItems: { id: NavId; label: string; icon: LucideIcon; count: number }[] = [
    { id: "home", label: "Overview", icon: LayoutGrid, count: workspace?.projects.length ?? 0 },
    { id: "queue", label: "Queue", icon: ListChecks, count: counts.active },
    { id: "decisions", label: "Decisions", icon: ListOrdered, count: counts.decisions },
    { id: "threads", label: "Threads", icon: MessageSquareText, count: counts.threads },
    { id: "ideas", label: "Ideas", icon: Lightbulb, count: counts.ideas },
    { id: "files", label: "Files", icon: FileText, count: counts.files },
    { id: "inbox", label: "Inbox", icon: Inbox, count: counts.warnings },
  ];

  return (
    <aside className="sidebar-shell bg-surface-rail border-r border-line flex flex-col min-h-0">
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3 border-b border-line-soft">
        <Triangle size={14} className="text-accent shrink-0" fill="currentColor" strokeWidth={0} />
        <span className="font-semibold text-[13.5px] tracking-[-0.01em]">Waymark</span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-mute">0.1.0</span>
      </div>

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
            <Sparkles size={11} /> Seed
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
  onClick,
}: {
  label: string;
  count: number;
  icon: LucideIcon;
  active: boolean;
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
      <span>{label}</span>
      <span
        className={cx(
          "ml-auto font-mono text-[10.5px] px-1.5 rounded-[3px] leading-[15px]",
          active ? "bg-[oklch(0.78_0.135_75_/_0.18)] text-accent" : "bg-surface-3 text-ink-mute",
        )}
      >
        {count}
      </span>
    </button>
  );
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
  return (
    <button
      onClick={onClick}
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
        <span className="font-mono text-[10px] text-ink-mute">{active}</span>
      </span>
    </button>
  );
}

function aggregateNavCounts(workspace: WorkspaceData | null) {
  if (!workspace) return { active: 0, decisions: 0, threads: 0, ideas: 0, files: 0, warnings: 0 };
  let active = 0;
  let decisions = 0;
  let threads = 0;
  let ideas = 0;
  let files = 0;
  let warnings = workspace.warnings.length;
  for (const project of workspace.projects) {
    for (const ticket of project.tickets) {
      if (ticket.status === "now" || ticket.status === "next" || ticket.status === "blocked") active += 1;
      files += ticket.linked_files?.length ?? 0;
    }
    decisions += project.decisions.length;
    threads += project.threads.length;
    ideas += project.ideas.length;
    files += (project.config.repos?.length ?? 0) + Object.keys(project.config.links ?? {}).length + project.links.length;
    files += project.decisions.length + project.ideas.length;
    warnings += project.warnings.length;
  }
  return { active, decisions, threads, ideas, files, warnings };
}

/* ------------------------------ main header ----------------------------- */

export function MainHeader({
  project,
  workspace,
  tab,
  onTab,
  selectedTicket,
  selectedCount,
  handoffDisabled,
  search,
  onSearch,
  searchInputRef,
  gapsOnly,
  onToggleGaps,
  onCapture,
  onSendHandoff,
}: {
  project: WaymarkProject | null;
  workspace: WorkspaceData | null;
  tab: MainTab;
  onTab: (value: MainTab) => void;
  selectedTicket: Ticket | null;
  selectedCount: number;
  handoffDisabled: boolean;
  search: string;
  onSearch: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  gapsOnly: boolean;
  onToggleGaps: () => void;
  onCapture: () => void;
  onSendHandoff: () => void;
}) {
  const counts = project
    ? {
        tickets: project.tickets.filter((t) => t.status !== "done" && t.status !== "idea").length,
        decisions: project.decisions.length,
        threads: project.threads.length,
      }
    : { tickets: 0, decisions: 0, threads: 0 };
  const handoffLabel =
    selectedCount > 0 ? `Handoff ${selectedCount}` : selectedTicket ? `Handoff: ${selectedTicket.title}` : "Handoff";

  return (
    <>
      <div className="flex items-center gap-3.5 px-[18px] h-[46px] border-b border-line shrink-0 min-w-0 overflow-hidden">
        <h1 className="m-0 text-[14px] font-semibold tracking-[-0.005em] text-ink flex items-center gap-2.5 shrink-0 min-w-0 max-w-[40%]">
          <span
            className="shrink-0"
            style={{ color: project ? projectColor(project.config.slug, 0) : "var(--color-accent)" }}
          >
            <Triangle size={13} fill="currentColor" strokeWidth={0} />
          </span>
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
        <nav className="flex h-full items-center ml-auto shrink-0 min-w-0 overflow-x-auto scrollbar-none">
          <Tab id="overview" active={tab === "overview"} onClick={onTab}>Overview</Tab>
          <Tab id="tickets" active={tab === "tickets"} onClick={onTab}>
            Tickets <TabBadge>{counts.tickets}</TabBadge>
          </Tab>
          <Tab id="decisions" active={tab === "decisions"} onClick={onTab}>
            Decisions <TabBadge>{counts.decisions}</TabBadge>
          </Tab>
          <Tab id="threads" active={tab === "threads"} onClick={onTab}>
            Threads <TabBadge>{counts.threads}</TabBadge>
          </Tab>
          <Tab id="files" active={tab === "files"} onClick={onTab}>Files</Tab>
        </nav>
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
          <span className="kbd">⌘K</span>
        </div>
        <Btn
          variant={gapsOnly ? "default" : "ghost"}
          title="Show only tickets with missing context"
          onClick={onToggleGaps}
          aria-pressed={gapsOnly}
        >
          <Sliders size={13} /> Filters
        </Btn>
        <Btn variant="ghost" onClick={onCapture}>
          <Plus size={13} /> Capture
        </Btn>
        <Btn variant="primary" onClick={onSendHandoff} disabled={handoffDisabled}>
          <Sparkles size={11} /> <span className="max-w-[180px] truncate">{handoffLabel}</span> <span className="kbd bg-[oklch(0_0_0_/_0.22)] border-[oklch(0_0_0_/_0.3)] text-accent-ink">⌘↵</span>
        </Btn>
      </div>
    </>
  );
}

function Tab({
  id,
  active,
  children,
  onClick,
}: {
  id: MainTab;
  active: boolean;
  children: ReactNode;
  onClick: (id: MainTab) => void;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={cx(
        "relative h-full inline-flex items-center gap-1.5 px-2 text-[11.5px] whitespace-nowrap shrink-0 cursor-pointer",
        active
          ? "text-ink after:content-[''] after:absolute after:left-2.5 after:right-2.5 after:-bottom-px after:h-0.5 after:bg-accent after:rounded-t-[2px]"
          : "text-ink-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function TabBadge({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] bg-surface-row-selected border border-line px-1 rounded-[3px] text-ink-faint leading-[14px]">
      {children}
    </span>
  );
}
