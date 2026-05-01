import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  GitBranch,
  Inbox,
  LayoutGrid,
  Lightbulb,
  Link2,
  ListChecks,
  ListOrdered,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sliders,
  Sparkles,
  Triangle,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { isTauri, openPath } from "./tauri";
import type {
  NoteRecord,
  ThreadRecord,
  Ticket,
  TicketStatus,
  WaymarkProject,
  WorkspaceData,
} from "./types";
import {
  buildDemoWorkspace,
  buildPrompt,
  createSampleWorkspace,
  loadWorkspace,
  saveGeneratedPrompt,
  saveTickets,
  ticketWarnings,
} from "./workspace";

/* ----------------------------- domain types ----------------------------- */

type NavId = "home" | "queue" | "decisions" | "threads" | "ideas" | "inbox";
type MainTab = "overview" | "tickets" | "decisions" | "threads" | "files";
type InspectorMode = "ticket" | "prompt" | "thread";
type Lane = "now" | "next" | "later" | "blocked" | "done";

const LANES_IN_QUEUE: Lane[] = ["now", "next", "blocked", "later"];
const LANE_LABEL: Record<Lane, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
  blocked: "Blocked",
  done: "Done",
};
const PROJECT_PALETTE = [
  "oklch(0.78 0.135 75)",
  "oklch(0.74 0.13 150)",
  "oklch(0.74 0.11 235)",
  "oklch(0.74 0.12 295)",
  "oklch(0.62 0.005 250)",
];
const defaultWorkspacePath = "/Users/hirokifuruichi/code/waymark/sample-workspace";

/* -------------------------------- utils --------------------------------- */

function projectColor(slug: string, index: number) {
  if (slug.toLowerCase().startsWith("waymark")) return PROJECT_PALETTE[0];
  return PROJECT_PALETTE[index % PROJECT_PALETTE.length];
}
function projectMark(slug: string) {
  return slug.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
}
function projectStatusKind(project: WaymarkProject): "warn" | "ok" | "idle" {
  if (project.config.status === "paused" || project.config.status === "archived") return "idle";
  if (project.warnings.length > 0) return "warn";
  return "ok";
}
function activeLane(status: TicketStatus): Lane | null {
  if (status === "idea") return null;
  return status as Lane;
}
function projectFile(project: WaymarkProject, ticket: Ticket) {
  if (ticket.linked_files?.length) return ticket.linked_files[0];
  return `${project.config.slug}/tickets/${ticket.id}.yaml`;
}
function ticketHasFlag(ticket: Ticket, kind: "ac" | "decision" | "thread") {
  if (kind === "ac") return (ticket.acceptance_criteria?.length ?? 0) > 0;
  if (kind === "decision") return (ticket.linked_decisions?.length ?? 0) > 0;
  return (ticket.linked_threads?.length ?? 0) > 0;
}
function tokenEstimate(prompt: string) {
  return Math.max(120, Math.round(prompt.length / 4));
}

type Activity = { t: string; kind: string; proj: string; text: string };

function buildActivity(workspace: WorkspaceData, project: WaymarkProject | null): Activity[] {
  const rows: Activity[] = [];
  const slug = project?.config.slug ?? "";
  for (const decision of project?.decisions.slice(0, 2) ?? []) {
    rows.push({ t: decision.date ?? "—", kind: "decision", proj: projectMark(slug), text: decision.title });
  }
  for (const thread of (project?.threads ?? []).slice(0, 2)) {
    rows.push({ t: thread.status, kind: "thread", proj: projectMark(slug), text: thread.title });
  }
  for (const ticket of (project?.tickets ?? []).slice(0, 3)) {
    rows.push({ t: ticket.status, kind: ticket.status, proj: projectMark(slug), text: ticket.title });
  }
  if (rows.length === 0) {
    for (const proj of workspace.projects.slice(0, 4)) {
      rows.push({
        t: proj.config.stage,
        kind: "ticket",
        proj: projectMark(proj.config.slug),
        text: proj.config.current_focus || proj.config.summary,
      });
    }
  }
  return rows.slice(0, 6);
}

/* --------------------------- shared primitives -------------------------- */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Pin({ kind, className }: { kind: string; className?: string }) {
  return <span className={cx("lane-pin", kind, className)} />;
}

function StatusChip({ status }: { status: TicketStatus }) {
  const label = status === "idea" ? "IDEA" : status.toUpperCase();
  return <span className={cx("status-chip", status)}>{label}</span>;
}

function Btn({
  variant = "default",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" }) {
  const base =
    "h-7 px-2.5 rounded-[5px] inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap border disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    default:
      "border-line bg-surface-2 text-ink-soft hover:bg-surface-4 hover:text-ink",
    primary:
      "border-accent-deep bg-accent text-accent-ink font-semibold hover:brightness-110",
    ghost:
      "border-transparent bg-transparent text-ink-faint hover:bg-surface-2 hover:text-ink",
  };
  return (
    <button {...rest} className={cx(base, variants[variant], className)}>
      {children}
    </button>
  );
}

function SectionHead({ children, more }: { children: ReactNode; more?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-2 px-0.5 min-w-0">
      <h2 className="m-0 text-[11px] uppercase tracking-[0.10em] text-ink-faint font-semibold flex items-center gap-2 whitespace-nowrap shrink-0">
        {children}
      </h2>
      <div className="flex-1 h-px bg-line-soft" />
      {more}
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("border border-line rounded-[5px] bg-surface-2 overflow-hidden", className)}>
      {children}
    </div>
  );
}

function Flag({
  tone = "default",
  title,
  children,
}: {
  tone?: "default" | "ok" | "muted";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    default: "bg-surface-row-selected border-line text-ink-faint",
    ok: "text-lane-done border-[oklch(0.74_0.13_150_/_0.25)] bg-[oklch(0.74_0.13_150_/_0.10)]",
    muted: "bg-surface-row-selected border-line text-ink-mute",
  } as const;
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-0.5 h-4 px-1 rounded-[3px] border font-mono text-[9.5px] shrink-0",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------- table primitives --------------------------- */

type CellTone = "ink" | "soft" | "faint" | "mute";

const CELL_TONE: Record<CellTone, string> = {
  ink: "text-ink",
  soft: "text-ink-soft",
  faint: "text-ink-faint",
  mute: "text-ink-mute",
};

function Cell({
  children,
  mono,
  size = 12,
  tone = "soft",
  align = "start",
  truncate = true,
  title,
  className,
  style,
}: {
  children: ReactNode;
  mono?: boolean;
  /** font-size in px */
  size?: number;
  tone?: CellTone;
  align?: "start" | "end";
  truncate?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      title={title}
      style={{ fontSize: size, ...style }}
      className={cx(
        "min-w-0 leading-tight",
        CELL_TONE[tone],
        mono && "font-mono",
        align === "end" && "text-right",
        truncate && "truncate",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Container for a row inside a Card-like table. The grid template comes from the
 * caller (e.g. `grid-cols-ticket`) so Tailwind can statically detect the class.
 */
function DataRow({
  cols,
  height = 32,
  paddingX = 14,
  gap = 10,
  selected,
  className,
  onClick,
  children,
}: {
  /** Tailwind class for grid template columns (e.g. "grid-cols-ticket"). */
  cols: string;
  height?: number;
  paddingX?: number;
  gap?: number;
  selected?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "grid items-center border-b border-line-soft last:border-b-0",
        cols,
        onClick && "cursor-pointer hover:bg-surface-row-hover",
        selected && "bg-surface-row-selected shadow-[inset_2px_0_0_var(--color-accent)]",
        className,
      )}
      style={{ height, paddingLeft: paddingX, paddingRight: paddingX, columnGap: gap }}
    >
      {children}
    </div>
  );
}

/* --------------------------------- App --------------------------------- */

export default function App() {
  const [rootPath, setRootPath] = useState(defaultWorkspacePath);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [nav, setNav] = useState<NavId>("home");
  const [tab, setTab] = useState<MainTab>("overview");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("ticket");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedProject = useMemo(() => {
    if (!workspace) return null;
    return (
      workspace.projects.find((project) => project.config.slug === selectedSlug) ??
      workspace.projects[0] ??
      null
    );
  }, [selectedSlug, workspace]);

  const selectedTicket = useMemo(() => {
    if (!selectedProject) return null;
    return selectedProject.tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  }, [selectedProject, selectedTicketId]);

  async function refresh(path = rootPath) {
    setError(null);
    try {
      const next = await loadWorkspace(path);
      setWorkspace(next);
      setSelectedSlug((current) => current ?? next.projects[0]?.config.slug ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleSeed() {
    if (!isTauri()) {
      setError("Run Waymark through Tauri to seed a local workspace.");
      return;
    }
    await createSampleWorkspace(rootPath);
    setNotice(`Created sample workspace at ${rootPath}`);
    await refresh(rootPath);
  }

  useEffect(() => {
    if (isTauri()) {
      refresh().catch((caught) => setError(String(caught)));
      return;
    }
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
      setWorkspace(buildDemoWorkspace());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProject) {
      setSelectedTicketId(null);
      setMulti([]);
      return;
    }
    setMulti((current) =>
      current.filter((id) => selectedProject.tickets.some((ticket) => ticket.id === id)),
    );
    setSelectedTicketId((current) => {
      if (current && selectedProject.tickets.some((ticket) => ticket.id === current)) return current;
      return selectedProject.tickets[0]?.id ?? null;
    });
  }, [selectedProject]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  function toggleMulti(id: string) {
    setMulti((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleHandoff() {
    if (!selectedProject) return;
    const project = selectedProject;
    const ids = multi.length ? multi : selectedTicket ? [selectedTicket.id] : [];
    const tickets = project.tickets.filter((ticket) => ids.includes(ticket.id));
    if (tickets.length === 0) {
      setError("Select a ticket to send to an agent.");
      return;
    }
    setInspectorMode("prompt");
    try {
      const saved: string[] = [];
      for (const ticket of tickets) {
        const prompt = buildPrompt(project, ticket, ["repos", "files", "decisions", "threads", "links"]);
        saved.push(await saveGeneratedPrompt(project, ticket, prompt));
      }
      const promptForCopy = tickets
        .map((ticket) => buildPrompt(project, ticket, ["repos", "files", "decisions", "threads", "links"]))
        .join("\n\n---\n\n");
      try {
        await navigator.clipboard.writeText(promptForCopy);
      } catch {
        /* clipboard not always available */
      }
      setNotice(`Saved ${saved.length} prompt${saved.length === 1 ? "" : "s"} and copied to clipboard.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleStatusChange(ticket: Ticket, status: TicketStatus) {
    if (!selectedProject) return;
    await saveTickets(
      selectedProject,
      selectedProject.tickets.map((candidate) =>
        candidate.id === ticket.id ? { ...candidate, status } : candidate,
      ),
    );
    setNotice(`Moved ${ticket.title} to ${LANE_LABEL[status as Lane] ?? status}.`);
    await refresh();
  }

  return (
    <div className="w-screen h-screen bg-surface grid grid-rows-[36px_1fr] overflow-hidden">
      <Titlebar workspace={workspace} project={selectedProject} rootPath={rootPath} />
      <div className="grid grid-cols-shell xl:grid-cols-shell-wide h-full min-h-0 min-w-0 overflow-hidden">
        <Sidebar
          workspace={workspace}
          rootPath={rootPath}
          onRootPathChange={setRootPath}
          selectedSlug={selectedProject?.config.slug ?? null}
          onSelectProject={setSelectedSlug}
          nav={nav}
          onNav={setNav}
          onRefresh={() => refresh()}
          onSeed={handleSeed}
        />
        <main className="bg-surface flex flex-col min-w-0 min-h-0 overflow-hidden">
          <MainHeader
            project={selectedProject}
            workspace={workspace}
            tab={tab}
            onTab={setTab}
            handoffDisabled={!selectedProject || (!selectedTicket && multi.length === 0)}
            search={search}
            onSearch={setSearch}
            onCapture={() => setCaptureOpen(true)}
            onSendHandoff={handleHandoff}
          />
          <div className="flex-1 min-h-0 overflow-y-auto px-[18px] pt-3.5 pb-7">
            {notice ? <Notice tone="ok"><Check size={13} /> {notice}</Notice> : null}
            {error ? <Notice tone="err"><AlertTriangle size={13} /> {error}</Notice> : null}
            {!isTauri() ? (
              <Notice tone="warn">
                <AlertTriangle size={13} />
                Run with <code>pnpm tauri dev</code> to load and write the local Markdown/YAML workspace.
              </Notice>
            ) : null}

            {!workspace ? (
              <EmptyState
                tauri={isTauri()}
                rootPath={rootPath}
                onRootPath={setRootPath}
                onSeed={handleSeed}
                onRefresh={() => refresh()}
              />
            ) : !selectedProject ? (
              <div className="grid place-items-center gap-3.5 py-16 px-8 text-center text-ink-faint">
                <Triangle size={28} className="text-accent" />
                <h2 className="m-0 text-[18px] font-semibold tracking-[-0.01em] text-ink">
                  No projects in this workspace
                </h2>
                <p className="m-0 max-w-[460px] text-[13px] leading-[1.55]">
                  Add a <code>project.yaml</code> under <code>{workspace.config.projects_dir}/</code> and refresh.
                </p>
              </div>
            ) : (
              <>
                <Stats project={selectedProject} />
                <Queue
                  project={selectedProject}
                  selectedKey={selectedTicketId}
                  onSelect={(ticket) => {
                    setSelectedTicketId(ticket.id);
                    setInspectorMode("ticket");
                  }}
                  multi={multi}
                  toggleMulti={toggleMulti}
                  search={search}
                />
                <Decisions decisions={selectedProject.decisions} />
                <IdeasAndActivity project={selectedProject} workspace={workspace} />
              </>
            )}
          </div>
        </main>
        <Inspector
          mode={inspectorMode}
          onMode={setInspectorMode}
          project={selectedProject}
          ticket={selectedTicket}
          multi={multi}
          workspace={workspace}
          onSendHandoff={handleHandoff}
          onStatus={handleStatusChange}
        />
      </div>

      {captureOpen && selectedProject ? (
        <CaptureModal
          project={selectedProject}
          onClose={() => setCaptureOpen(false)}
          onCreated={async (title, status, summary) => {
            const id = title
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "");
            const ticket: Ticket = {
              id: id || `ticket-${Date.now()}`,
              title,
              status,
              priority: "medium",
              summary,
              acceptance_criteria: [],
              linked_files: [],
              linked_decisions: [],
              linked_threads: [],
              generated_prompts: [],
            };
            await saveTickets(selectedProject, [...selectedProject.tickets, ticket]);
            setNotice(`Captured "${title}".`);
            setCaptureOpen(false);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------- notice -------------------------------- */

function Notice({ tone, children }: { tone: "ok" | "warn" | "err"; children: ReactNode }) {
  const tones = {
    ok: "text-lane-done border-[oklch(0.74_0.13_150_/_0.3)] bg-[oklch(0.74_0.13_150_/_0.08)]",
    warn: "text-warn border-[oklch(0.82_0.14_90_/_0.3)] bg-[oklch(0.82_0.14_90_/_0.08)]",
    err: "text-danger border-[oklch(0.70_0.16_25_/_0.3)] bg-[oklch(0.70_0.16_25_/_0.08)]",
  };
  return (
    <div className={cx("text-[12px] px-3 py-2 rounded-[5px] border mb-3 flex items-center gap-2", tones[tone])}>
      {children}
    </div>
  );
}

/* ------------------------------- titlebar ------------------------------- */

function Titlebar({
  workspace,
  project,
  rootPath,
}: {
  workspace: WorkspaceData | null;
  project: WaymarkProject | null;
  rootPath: string;
}) {
  return (
    <div className="grid grid-cols-shell xl:grid-cols-shell-wide items-center border-b border-line bg-gradient-to-b from-[oklch(0.235_0.006_250)] to-[oklch(0.205_0.006_250)] select-none h-9 overflow-hidden">
      <div className="flex gap-2 pl-3.5">
        <span className="w-3 h-3 rounded-full bg-[oklch(0.66_0.18_25)]" />
        <span className="w-3 h-3 rounded-full bg-[oklch(0.78_0.14_90)]" />
        <span className="w-3 h-3 rounded-full bg-[oklch(0.72_0.13_150)]" />
      </div>
      <div className="flex items-center justify-center gap-2 font-mono text-[11.5px] text-ink-faint min-w-0 px-3 overflow-hidden">
        <span className="truncate min-w-0 text-ink-soft" title={rootPath}>{rootPath}</span>
        <span className="text-ink-mute shrink-0">/</span>
        <span className="text-ink-soft shrink-0 truncate">
          {project?.config.name ?? workspace?.config.name ?? "Waymark"}
        </span>
        {project ? (
          <>
            <span className="text-ink-mute shrink-0">·</span>
            <span className="text-ink-mute shrink-0">{project.config.stage}</span>
          </>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-1 pr-2.5 shrink-0 whitespace-nowrap">
        <TitlebarButton icon={GitBranch}>main</TitlebarButton>
        <TitlebarButton icon={Settings} aria-label="Settings" />
      </div>
    </div>
  );
}

function TitlebarButton({
  icon: Icon,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon }) {
  return (
    <button
      {...rest}
      className="h-[22px] px-2 rounded-[3px] text-[11px] text-ink-soft hover:bg-surface-4 hover:text-ink inline-flex items-center gap-1.5"
    >
      <Icon size={12} />
      {children}
    </button>
  );
}

/* -------------------------------- sidebar ------------------------------- */

function Sidebar({
  workspace,
  rootPath,
  onRootPathChange,
  selectedSlug,
  onSelectProject,
  nav,
  onNav,
  onRefresh,
  onSeed,
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
}) {
  const counts = useMemo(() => aggregateNavCounts(workspace), [workspace]);
  const navItems: { id: NavId; label: string; icon: LucideIcon; count: number }[] = [
    { id: "home", label: "Overview", icon: LayoutGrid, count: workspace?.projects.length ?? 0 },
    { id: "queue", label: "Queue", icon: ListChecks, count: counts.active },
    { id: "decisions", label: "Decisions", icon: ListOrdered, count: counts.decisions },
    { id: "threads", label: "Threads", icon: MessageSquareText, count: counts.threads },
    { id: "ideas", label: "Ideas", icon: Lightbulb, count: counts.ideas },
    { id: "inbox", label: "Inbox", icon: Inbox, count: counts.warnings },
  ];

  return (
    <aside className="bg-surface-rail border-r border-line flex flex-col min-h-0">
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
            aria-label="Workspace path"
            className="flex-1 min-w-0 bg-transparent border-0 outline-0 p-0 font-inherit truncate"
          />
          <ChevronDown size={12} className="text-ink-mute ml-auto" />
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
          <button className="w-[18px] h-[18px] grid place-items-center rounded-[3px] text-ink-faint hover:bg-surface-3 hover:text-ink" aria-label="New project">
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
        <span className="w-1.5 h-1.5 rounded-full bg-lane-done shadow-[0_0_0_3px_oklch(0.74_0.13_150_/_0.18)] shrink-0" />
        <span className="shrink-0">Indexer idle</span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-mute shrink-0">
          {workspace ? "ready" : "—"}
        </span>
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
  if (!workspace) return { active: 0, decisions: 0, threads: 0, ideas: 0, warnings: 0 };
  let active = 0;
  let decisions = 0;
  let threads = 0;
  let ideas = 0;
  let warnings = workspace.warnings.length;
  for (const project of workspace.projects) {
    for (const ticket of project.tickets) {
      if (ticket.status === "now" || ticket.status === "next" || ticket.status === "blocked") active += 1;
    }
    decisions += project.decisions.length;
    threads += project.threads.length;
    ideas += project.ideas.length;
    warnings += project.warnings.length;
  }
  return { active, decisions, threads, ideas, warnings };
}

/* ------------------------------ main header ----------------------------- */

function MainHeader({
  project,
  workspace,
  tab,
  onTab,
  handoffDisabled,
  search,
  onSearch,
  onCapture,
  onSendHandoff,
}: {
  project: WaymarkProject | null;
  workspace: WorkspaceData | null;
  tab: MainTab;
  onTab: (value: MainTab) => void;
  handoffDisabled: boolean;
  search: string;
  onSearch: (value: string) => void;
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
            onChange={(event) => onSearch(event.target.value)}
            className="flex-1 min-w-0 bg-transparent border-0 outline-0 text-[12.5px] text-ink placeholder:text-ink-mute"
          />
          <span className="kbd">⌘K</span>
        </div>
        <Btn variant="ghost" title="Filters">
          <Sliders size={13} /> Filters
        </Btn>
        <Btn variant="ghost" onClick={onCapture}>
          <Plus size={13} /> Capture
        </Btn>
        <Btn variant="primary" onClick={onSendHandoff} disabled={handoffDisabled}>
          <Sparkles size={11} /> Handoff <span className="kbd bg-[oklch(0_0_0_/_0.22)] border-[oklch(0_0_0_/_0.3)] text-accent-ink">⌘↵</span>
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

/* -------------------------------- stats -------------------------------- */

function Stats({ project }: { project: WaymarkProject }) {
  const counts = useMemo(() => {
    const out: Record<Lane, number> = { now: 0, next: 0, later: 0, blocked: 0, done: 0 };
    for (const ticket of project.tickets) {
      const lane = activeLane(ticket.status);
      if (lane) out[lane] += 1;
    }
    return out;
  }, [project]);

  type Cell = { key: string; label: string; sub: string; n: number; pin: string; numClass?: string };
  const cells: Cell[] = [
    { key: "now", label: "Now", sub: "in progress", n: counts.now, pin: "now" },
    { key: "next", label: "Next", sub: "queued", n: counts.next, pin: "next" },
    { key: "later", label: "Later", sub: "backlog", n: counts.later, pin: "later" },
    { key: "blocked", label: "Blocked", sub: "awaiting", n: counts.blocked, pin: "blocked", numClass: "text-danger" },
    { key: "warn", label: "Warnings", sub: "gaps", n: project.warnings.length, pin: "warn", numClass: "text-warn" },
    { key: "done", label: "Shipped", sub: "all-time", n: counts.done, pin: "done" },
  ];

  return (
    <div className="@container">
      <div className="grid grid-cols-3 @3xl:grid-cols-6 border border-line rounded-[5px] bg-surface-2 mb-[18px] overflow-hidden">
        {cells.map((cell, index) => {
          const col3 = index % 3;
          const col6 = index;
          return (
            <div
              key={cell.key}
              className={cx(
                "px-3 py-2.5 flex flex-col gap-1 min-w-0 border-line-soft",
                col3 < 2 && "border-r @3xl:border-r-0",
                col6 < 5 && "@3xl:border-r",
                index < 3 && "border-b @3xl:border-b-0",
              )}
            >
            <div className="text-[10px] uppercase tracking-[0.09em] text-ink-mute font-medium flex items-center gap-1.5 min-w-0">
              <Pin kind={cell.pin} />
              <span className="truncate">{cell.label}</span>
            </div>
            <div className={cx("font-mono text-[22px] font-medium tracking-[-0.02em] leading-none", cell.numClass ?? "text-ink")}>
              {cell.n}
            </div>
            <div className="text-[10.5px] font-mono text-ink-faint truncate">{cell.sub}</div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- queue -------------------------------- */

function Queue({
  project,
  selectedKey,
  onSelect,
  multi,
  toggleMulti,
  search,
}: {
  project: WaymarkProject;
  selectedKey: string | null;
  onSelect: (ticket: Ticket) => void;
  multi: string[];
  toggleMulti: (id: string) => void;
  search: string;
}) {
  const lanes = useMemo(() => {
    const filter = search.trim().toLowerCase();
    const matching = project.tickets.filter((ticket) => {
      if (ticket.status === "idea") return false;
      if (!filter) return true;
      return (
        ticket.title.toLowerCase().includes(filter) ||
        ticket.id.toLowerCase().includes(filter) ||
        ticket.summary?.toLowerCase().includes(filter)
      );
    });
    return LANES_IN_QUEUE.map((lane) => ({
      lane,
      items: matching.filter((ticket) => ticket.status === lane),
    })).filter((group) => group.items.length > 0);
  }, [project, search]);

  const activeCount = project.tickets.filter(
    (ticket) => ticket.status !== "done" && ticket.status !== "idea",
  ).length;

  return (
    <div className="mb-[22px]">
      <SectionHead
        more={
          <button className="text-[11px] text-ink-mute inline-flex items-center gap-1 hover:text-ink-soft cursor-pointer">
            View all <ArrowRight size={11} />
          </button>
        }
      >
        Queue <span className="font-mono text-[10px] text-ink-mute font-normal tracking-normal normal-case">{activeCount} active</span>
      </SectionHead>
      <Card>
        {lanes.length === 0 ? (
          <EmptyRow>No tickets match.</EmptyRow>
        ) : (
          lanes.map((group) => (
            <div key={group.lane}>
              <div className="flex items-center h-6 px-3.5 bg-surface-rail-3 border-b border-line-soft text-[10px] uppercase tracking-[0.09em] text-ink-faint font-semibold gap-2">
                <Pin kind={group.lane} />
                {LANE_LABEL[group.lane]}
                <span className="font-mono text-[10px] text-ink-mute font-normal tracking-normal normal-case ml-1">
                  {group.items.length}
                </span>
              </div>
              {group.items.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  project={project}
                  ticket={ticket}
                  selected={selectedKey === ticket.id}
                  multiSel={multi.includes(ticket.id)}
                  onClick={() => onSelect(ticket)}
                  onToggleMulti={() => toggleMulti(ticket.id)}
                />
              ))}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <div className="px-4 py-4 text-ink-mute text-center text-[12px]">{children}</div>;
}

function TicketRow({
  project,
  ticket,
  selected,
  multiSel,
  onClick,
  onToggleMulti,
}: {
  project: WaymarkProject;
  ticket: Ticket;
  selected: boolean;
  multiSel: boolean;
  onClick: () => void;
  onToggleMulti: () => void;
}) {
  const warnings = ticketWarnings(project, ticket);
  return (
    <DataRow
      cols="grid-cols-ticket-narrow xl:grid-cols-ticket"
      height={32}
      paddingX={14}
      gap={10}
      onClick={onClick}
      selected={selected}
      className={cx(multiSel && !selected && "bg-[oklch(0.78_0.135_75_/_0.06)]")}
    >
      <div
        className="grid place-items-center"
        onClick={(event) => {
          event.stopPropagation();
          onToggleMulti();
        }}
      >
        <span
          className={cx(
            "w-3.5 h-3.5 rounded-[3px] border grid place-items-center",
            multiSel ? "bg-accent border-accent text-accent-ink" : "border-line bg-surface-input",
          )}
        >
          {multiSel ? <Check size={9} /> : null}
        </span>
      </div>
      <Cell mono size={11} tone="faint">{ticket.id}</Cell>
      <div className="flex items-center gap-2 min-w-0 text-ink">
        <span className="flex-1 truncate text-[12.5px] min-w-0">{ticket.title}</span>
        {warnings.length > 0 ? (
          <span
            title={warnings[0]}
            className="inline-flex items-center gap-1 shrink-0 text-[10.5px] text-warn bg-[oklch(0.82_0.14_90_/_0.12)] px-1.5 py-px rounded-[3px]"
          >
            <AlertTriangle size={11} className="shrink-0" />
            <span className="hidden 2xl:inline truncate max-w-[140px]">{warnings[0]}</span>
          </span>
        ) : null}
      </div>
      <div className="flex gap-1 items-center shrink-0">
        {ticketHasFlag(ticket, "thread") ? (
          <Flag title="Has linked thread"><MessageSquareText size={11} /></Flag>
        ) : null}
        {ticketHasFlag(ticket, "ac") ? (
          <Flag tone="ok" title="Acceptance criteria"><Check size={10} /> AC</Flag>
        ) : (
          <Flag tone="muted" title="No acceptance criteria">AC</Flag>
        )}
        {ticketHasFlag(ticket, "decision") ? (
          <Flag title="Linked decision"><Link2 size={10} /></Flag>
        ) : null}
      </div>
      <Cell mono size={10.5} tone="faint" title={projectFile(project, ticket)} className="hidden xl:block">
        {projectFile(project, ticket)}
      </Cell>
      <Cell mono size={10.5} tone="mute" align="end">{ticket.priority ?? "med"}</Cell>
    </DataRow>
  );
}

/* ----------------------------- decisions -------------------------------- */

function Decisions({ decisions }: { decisions: NoteRecord[] }) {
  if (decisions.length === 0) {
    return (
      <div className="mb-[22px]">
        <SectionHead>
          Recent decisions <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">0</span>
        </SectionHead>
        <Card>
          <EmptyRow>No decisions captured yet.</EmptyRow>
        </Card>
      </div>
    );
  }
  return (
    <div className="mb-[22px]">
      <SectionHead
        more={
          <button className="text-[11px] text-ink-mute inline-flex items-center gap-1 hover:text-ink-soft cursor-pointer">
            All decisions <ArrowRight size={11} />
          </button>
        }
      >
        Recent decisions <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">last entries</span>
      </SectionHead>
      <Card>
        {decisions.slice(0, 8).map((decision) => (
          <DataRow
            key={decision.path}
            cols="grid-cols-decision-narrow xl:grid-cols-decision"
            height={30}
            paddingX={14}
            gap={12}
          >
            <Cell mono size={11} tone="faint">{decision.id}</Cell>
            <Cell tone="ink">{decision.title}</Cell>
            <div className="justify-self-start min-w-0 max-w-full font-mono text-[10px] text-ink-faint bg-surface-row-selected border border-line px-1.5 py-px rounded-[3px] truncate">
              {decision.status ?? "decision"}
            </div>
            <Cell mono size={10.5} tone="mute">{decision.date ?? "—"}</Cell>
            <Cell
              mono
              size={10.5}
              tone="mute"
              align="end"
              title={decision.path}
              className="hidden xl:block"
            >
              {decision.path.split("/").slice(-2).join("/")}
            </Cell>
          </DataRow>
        ))}
      </Card>
    </div>
  );
}

/* --------------------------- ideas + activity --------------------------- */

function IdeasAndActivity({
  project,
  workspace,
}: {
  project: WaymarkProject;
  workspace: WorkspaceData;
}) {
  const activity = useMemo(() => buildActivity(workspace, project), [workspace, project]);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-[22px] mb-[22px]">
      <div className="min-w-0">
        <SectionHead>
          Ideas <span className="hidden font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{project.ideas.length} captured</span>
        </SectionHead>
        <Card>
          {project.ideas.length === 0 ? (
            <EmptyRow>No ideas captured.</EmptyRow>
          ) : (
            project.ideas.slice(0, 8).map((idea) => (
              <DataRow key={idea.path} cols="grid-cols-idea" height={28} paddingX={12} gap={10}>
                <Cell mono size={10.5} tone="mute">{idea.id}</Cell>
                <Cell size={12} tone="soft">{idea.title}</Cell>
                <Cell mono size={10} tone="mute" align="end">{idea.date ?? "—"}</Cell>
              </DataRow>
            ))
          )}
        </Card>
      </div>
      <div className="min-w-0">
        <SectionHead>Activity</SectionHead>
        <Card>
          {activity.length === 0 ? (
            <EmptyRow>Nothing recent.</EmptyRow>
          ) : (
            activity.map((row, index) => (
              <DataRow
                key={`${row.kind}-${index}`}
                cols="grid-cols-activity"
                height={26}
                paddingX={12}
                gap={10}
              >
                <Cell mono size={10} tone="mute">{row.t}</Cell>
                <span className="inline-flex items-center shrink-0"><Pin kind={row.kind} /></span>
                <Cell mono size={10} tone="faint">{row.proj}</Cell>
                <Cell size={11.5} tone="soft">{row.text}</Cell>
              </DataRow>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------- inspector ----------------------------- */

function Inspector({
  mode,
  onMode,
  project,
  ticket,
  multi,
  workspace,
  onSendHandoff,
  onStatus,
}: {
  mode: InspectorMode;
  onMode: (value: InspectorMode) => void;
  project: WaymarkProject | null;
  ticket: Ticket | null;
  multi: string[];
  workspace: WorkspaceData | null;
  onSendHandoff: () => void;
  onStatus: (ticket: Ticket, status: TicketStatus) => void;
}) {
  const bundleSize = multi.length;

  return (
    <aside className="bg-surface-rail-2 border-l border-line flex flex-col min-h-0 min-w-0 overflow-hidden">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-line shrink-0 min-w-0 overflow-x-auto scrollbar-none">
        <InspectorTab active={mode === "ticket"} onClick={() => onMode("ticket")} icon={FileText}>
          Ticket
        </InspectorTab>
        <InspectorTab active={mode === "prompt"} onClick={() => onMode("prompt")} icon={Sparkles}>
          Handoff
          {bundleSize > 0 ? (
            <span className="font-mono text-[9.5px] px-1 rounded-[3px] bg-accent text-accent-ink leading-[14px]">{bundleSize}</span>
          ) : null}
        </InspectorTab>
        <InspectorTab active={mode === "thread"} onClick={() => onMode("thread")} icon={MessageSquareText}>
          Thread
        </InspectorTab>
        <div className="flex-1 min-w-0" />
        <button className="w-6 h-6 shrink-0 grid place-items-center rounded-[3px] text-ink-faint hover:bg-surface-3 hover:text-ink" title="Open in editor">
          <Link2 size={12} />
        </button>
      </div>

      {!project || !workspace ? (
        <InspectorEmpty>Open a workspace to see ticket details.</InspectorEmpty>
      ) : mode === "ticket" ? (
        ticket ? (
          <InspectorTicket project={project} ticket={ticket} onStatus={onStatus} onSendHandoff={onSendHandoff} />
        ) : (
          <InspectorEmpty>Select a ticket to inspect.</InspectorEmpty>
        )
      ) : mode === "prompt" ? (
        <InspectorPrompt
          project={project}
          ticket={ticket}
          multi={multi}
          workspace={workspace}
          onSendHandoff={onSendHandoff}
        />
      ) : (
        <InspectorThread project={project} ticket={ticket} />
      )}
    </aside>
  );
}

function InspectorTab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 h-[26px] px-2 rounded-[3px] text-[11.5px] whitespace-nowrap shrink-0 cursor-pointer",
        active ? "bg-surface-4 text-ink" : "text-ink-faint hover:bg-surface-3 hover:text-ink",
      )}
    >
      <Icon size={12} />
      {children}
    </button>
  );
}

function InspectorEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 grid place-items-center text-ink-mute p-8 text-[12px] text-center">
      {children}
    </div>
  );
}

function InspectorBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3.5 pb-[18px]">{children}</div>;
}

function InspectorActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-1 px-2.5 py-2.5 border-t border-line shrink-0 bg-surface-input overflow-hidden flex-wrap">
      {children}
    </div>
  );
}

function InspectorHead({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="pb-3.5 border-b border-line-soft mb-3.5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">{eyebrow}</div>
      <h2 className="m-0 mb-2 text-[15px] font-semibold leading-[1.3] tracking-[-0.01em]">{title}</h2>
      {meta}
    </div>
  );
}

function InspectorSection({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <div className="text-[10px] uppercase tracking-[0.10em] text-ink-mute font-semibold mb-1.5 whitespace-nowrap">
        {label}
      </div>
      {children}
    </div>
  );
}

function InspectorTicket({
  project,
  ticket,
  onStatus,
  onSendHandoff,
}: {
  project: WaymarkProject;
  ticket: Ticket;
  onStatus: (ticket: Ticket, status: TicketStatus) => void;
  onSendHandoff: () => void;
}) {
  const linkedDecisions = project.decisions.filter((decision) =>
    ticket.linked_decisions?.includes(decision.id),
  );
  const linkedThreads = project.threads.filter((thread) =>
    ticket.linked_threads?.includes(thread.id),
  );
  const file = projectFile(project, ticket);
  const lane = activeLane(ticket.status);

  return (
    <>
      <InspectorBody>
        <InspectorHead
          eyebrow={
            <>
              <StatusChip status={ticket.status} />
              <span className="font-mono text-[11px] text-ink-faint">{ticket.id}</span>
              <span className="font-mono text-[10.5px] text-ink-mute">· {ticket.priority ?? "medium"}</span>
            </>
          }
          title={ticket.title}
          meta={
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink-faint min-w-0">
              <FileText size={11} className="shrink-0" />
              <span className="truncate flex-1 min-w-0" title={file}>{file}</span>
              <button
                className="inline-flex items-center gap-1 px-1 py-0.5 text-ink-faint rounded-[3px] text-[11px] hover:bg-surface-3 hover:text-ink cursor-pointer"
                onClick={() => navigator.clipboard?.writeText(file).catch(() => undefined)}
                title="Copy path"
              >
                <Copy size={11} />
              </button>
            </div>
          }
        />

        <InspectorSection label="Summary">
          <div className="text-[12.5px] text-ink-soft leading-[1.55]">
            {ticket.summary ? (
              ticket.summary
            ) : (
              <span className="text-ink-mute">
                No summary written.{" "}
                <button className="text-accent hover:underline cursor-pointer">Generate from thread →</button>
              </span>
            )}
          </div>
        </InspectorSection>

        <InspectorSection label="Acceptance criteria">
          {ticket.acceptance_criteria?.length ? (
            <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
              {ticket.acceptance_criteria.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2 text-[12px] text-ink-soft leading-[1.4]">
                  <span className="w-3 h-3 border border-line rounded-[2px] shrink-0 mt-0.5 bg-surface-input" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-start gap-2 bg-[oklch(0.82_0.14_90_/_0.08)] border border-[oklch(0.82_0.14_90_/_0.22)] px-2.5 py-2 rounded-[5px] text-[12px] text-ink-soft">
              <AlertTriangle size={12} className="text-warn shrink-0 mt-px" />
              <span>
                No acceptance criteria. <button className="text-accent hover:underline cursor-pointer">Draft from thread →</button>
              </span>
            </div>
          )}
        </InspectorSection>

        {(linkedDecisions.length > 0 || linkedThreads.length > 0 || (ticket.linked_files?.length ?? 0) > 0) && (
          <InspectorSection label="Linked">
            <Card>
              {linkedDecisions.map((decision) => (
                <LinkRow
                  key={decision.path}
                  kind="decision"
                  identifier={decision.id}
                  title={decision.title}
                />
              ))}
              {linkedThreads.map((thread) => (
                <LinkRow
                  key={thread.id}
                  kind="thread"
                  identifier={thread.id}
                  title={thread.title}
                  trailing={<span className="font-mono text-[10px] text-ink-mute">{thread.provider}</span>}
                />
              ))}
              {(ticket.linked_files ?? []).map((path) => (
                <LinkRow
                  key={path}
                  kind="file"
                  identifier="—"
                  title={path}
                  trailing={
                    <button
                      onClick={() => openPath(path)}
                      title="Reveal"
                      className="inline-flex items-center gap-1 px-1 py-0.5 text-ink-faint rounded-[3px] text-[11px] hover:bg-surface-3 hover:text-ink cursor-pointer"
                    >
                      <Copy size={10} />
                    </button>
                  }
                />
              ))}
            </Card>
          </InspectorSection>
        )}

        <InspectorSection label="Frontmatter">
          <pre className="m-0 px-3 py-2.5 font-mono text-[11px] text-ink-soft bg-surface-input-2 border border-line rounded-[5px] whitespace-pre overflow-x-auto leading-[1.5]">
{`status: ${ticket.status}
priority: ${ticket.priority ?? "medium"}
ac: ${(ticket.acceptance_criteria?.length ?? 0) > 0}
decisions: [${(ticket.linked_decisions ?? []).join(", ")}]
threads: [${(ticket.linked_threads ?? []).join(", ")}]
files: [${(ticket.linked_files ?? []).join(", ")}]
prompts: ${ticket.generated_prompts?.length ?? 0}`}
          </pre>
        </InspectorSection>
      </InspectorBody>

      <InspectorActions>
        <Btn variant="primary" onClick={onSendHandoff}>
          <Sparkles size={11} /> Send to agent
        </Btn>
        {lane !== "next" ? <Btn variant="ghost" onClick={() => onStatus(ticket, "next")}>Mark next</Btn> : null}
        {lane !== "blocked" ? <Btn variant="ghost" onClick={() => onStatus(ticket, "blocked")}>Block</Btn> : null}
        {lane !== "done" ? <Btn variant="ghost" onClick={() => onStatus(ticket, "done")}>Mark done</Btn> : null}
      </InspectorActions>
    </>
  );
}

function LinkRow({
  kind,
  identifier,
  title,
  trailing,
}: {
  kind: string;
  identifier: string;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <DataRow cols="grid-cols-link" height={28} paddingX={10} gap={8}>
      <Cell mono size={9.5} tone="mute" className="uppercase tracking-[0.07em]">{kind}</Cell>
      <Cell mono size={11} tone="faint">{identifier}</Cell>
      <Cell tone="soft" title={title}>{title}</Cell>
      <div className="shrink-0">{trailing ?? null}</div>
    </DataRow>
  );
}

function InspectorPrompt({
  project,
  ticket,
  multi,
  workspace,
  onSendHandoff,
}: {
  project: WaymarkProject;
  ticket: Ticket | null;
  multi: string[];
  workspace: WorkspaceData;
  onSendHandoff: () => void;
}) {
  const tickets = project.tickets.filter((candidate) =>
    multi.length ? multi.includes(candidate.id) : ticket && candidate.id === ticket.id,
  );

  if (tickets.length === 0) {
    return <InspectorEmpty>Select a ticket to preview the handoff.</InspectorEmpty>;
  }

  const prompt = tickets
    .map((entry) => buildPrompt(project, entry, ["repos", "files", "decisions", "threads", "links"]))
    .join("\n\n---\n\n");
  const tokens = tokenEstimate(prompt);

  return (
    <>
      <InspectorBody>
        <InspectorHead
          eyebrow={<span className="text-[10.5px] text-ink-faint tracking-[0.08em] uppercase">Handoff prompt</span>}
          title={tickets.length > 1 ? `Bundle · ${tickets.length} tickets` : "Single ticket"}
          meta={
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-ink-mute whitespace-nowrap overflow-hidden flex-wrap">
              <span>● claude-sonnet-4.5</span>
              <span>·</span>
              <span>~{tokens.toLocaleString()} tokens</span>
              <span>·</span>
              <span>cwd: <code>{workspace.rootPath}</code></span>
            </div>
          }
        />

        <InspectorSection label={<></>}>
          <div className="border border-line rounded-[5px] bg-surface-input-2 overflow-hidden">
            <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-line-soft bg-surface-3">
              <span className="font-mono text-[10px] text-ink-faint uppercase tracking-[0.06em]">prompt.md</span>
              <span className="flex-1" />
              <button
                onClick={() => navigator.clipboard?.writeText(prompt).catch(() => undefined)}
                className="inline-flex items-center gap-1 px-1 py-0.5 text-ink-faint rounded-[3px] text-[11px] hover:bg-surface-3 hover:text-ink cursor-pointer"
              >
                <Copy size={11} /> Copy
              </button>
            </div>
            <pre className="m-0 px-3 py-2.5 font-mono text-[11px] text-ink-soft whitespace-pre-wrap leading-[1.55] max-h-[360px] overflow-y-auto">
              {prompt}
            </pre>
          </div>
        </InspectorSection>

        <InspectorSection label="Order">
          <Card>
            {tickets.map((entry, index) => (
              <DataRow key={entry.id} cols="grid-cols-order" height={30} paddingX={10} gap={8}>
                <Cell mono size={10.5} tone="mute">{index + 1}</Cell>
                <div className="shrink-0"><StatusChip status={entry.status} /></div>
                <Cell mono size={11} tone="faint">{entry.id}</Cell>
                <Cell size={12} tone="soft">{entry.title}</Cell>
                <button className="text-ink-mute hover:text-ink cursor-pointer shrink-0">
                  <ChevronDown size={12} />
                </button>
              </DataRow>
            ))}
          </Card>
        </InspectorSection>
      </InspectorBody>
      <InspectorActions>
        <Btn variant="primary" onClick={onSendHandoff}>
          <Sparkles size={11} /> Save & copy <span className="kbd bg-[oklch(0_0_0_/_0.22)] border-[oklch(0_0_0_/_0.3)] text-accent-ink">⌘↵</span>
        </Btn>
        <Btn onClick={() => navigator.clipboard?.writeText(prompt).catch(() => undefined)}>
          <Copy size={11} /> Copy prompt
        </Btn>
        <Btn variant="ghost">Save as preset</Btn>
      </InspectorActions>
    </>
  );
}

function InspectorThread({ project, ticket }: { project: WaymarkProject; ticket: Ticket | null }) {
  const linked = ticket
    ? project.threads.find((thread) => ticket.linked_threads?.includes(thread.id))
    : null;
  const fallback = project.threads[0] ?? null;
  const thread: ThreadRecord | null = linked ?? fallback;

  if (!thread) return <InspectorEmpty>No threads linked yet.</InspectorEmpty>;

  return (
    <>
      <InspectorBody>
        <InspectorHead
          eyebrow={<span className="text-[10.5px] text-ink-faint tracking-[0.08em] uppercase">Linked thread</span>}
          title={thread.title}
          meta={
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-ink-mute whitespace-nowrap overflow-hidden flex-wrap">
              <span>● {thread.provider}</span>
              <span>·</span>
              <span>{thread.status}</span>
              {thread.url ? (
                <>
                  <span>·</span>
                  <span className="overflow-hidden text-ellipsis min-w-0">{thread.url}</span>
                </>
              ) : null}
            </div>
          }
        />

        <InspectorSection
          label={
            <>
              Summary <span className="text-ink-mute normal-case tracking-normal">· file</span>
            </>
          }
        >
          <div className="text-[12.5px] text-ink-soft leading-[1.55]">
            {thread.summary_file ? <code>{thread.summary_file}</code> : <span className="text-ink-mute">No summary file.</span>}
          </div>
        </InspectorSection>

        <InspectorSection label="Linked tickets">
          <Card>
            {(thread.linked_tickets ?? []).length === 0 ? (
              <EmptyRow>No linked tickets.</EmptyRow>
            ) : (
              (thread.linked_tickets ?? []).map((id) => {
                const linkedTicket = project.tickets.find((candidate) => candidate.id === id);
                return (
                  <LinkRow
                    key={id}
                    kind="ticket"
                    identifier={id}
                    title={linkedTicket?.title ?? "—"}
                  />
                );
              })
            )}
          </Card>
        </InspectorSection>
      </InspectorBody>
      <InspectorActions>
        <Btn>Continue thread</Btn>
        <Btn variant="ghost">Re-summarize</Btn>
      </InspectorActions>
    </>
  );
}

/* ------------------------------ empty state ----------------------------- */

function EmptyState({
  tauri,
  rootPath,
  onRootPath,
  onSeed,
  onRefresh,
}: {
  tauri: boolean;
  rootPath: string;
  onRootPath: (value: string) => void;
  onSeed: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="grid place-items-center gap-3.5 py-16 px-8 text-center text-ink-faint">
      <Triangle size={28} className="text-accent" fill="currentColor" strokeWidth={0} />
      <h2 className="m-0 text-[18px] font-semibold tracking-[-0.01em] text-ink">Open a Waymark workspace</h2>
      <p className="m-0 max-w-[460px] text-[13px] leading-[1.55]">
        Waymark reads <code>waymark.yaml</code> and per-project Markdown/YAML from a folder you choose. Point at an existing
        workspace, or seed a sample to explore the cockpit.
      </p>
      <div className="flex items-center gap-2 h-[26px] px-2 rounded-[3px] bg-surface-2 border border-line w-[420px] max-w-full font-mono text-[11px] text-ink-soft">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-mute shrink-0" />
        <input
          value={rootPath}
          onChange={(event) => onRootPath(event.target.value)}
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent border-0 outline-0 p-0"
        />
      </div>
      <div className="flex gap-2">
        <Btn onClick={onRefresh}>
          <RefreshCw size={13} /> Open
        </Btn>
        <Btn variant="primary" onClick={onSeed} disabled={!tauri}>
          <Sparkles size={11} /> Seed sample
        </Btn>
      </div>
    </div>
  );
}

/* ------------------------------- capture ------------------------------- */

function CaptureModal({
  project,
  onClose,
  onCreated,
}: {
  project: WaymarkProject;
  onClose: () => void;
  onCreated: (title: string, status: TicketStatus, summary: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<TicketStatus>("now");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-[oklch(0_0_0_/_0.45)] z-40" onClick={onClose} />
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!title.trim()) return;
          setBusy(true);
          await onCreated(title.trim(), status, summary.trim());
          setBusy(false);
        }}
        className="fixed top-24 left-1/2 -translate-x-1/2 w-[540px] max-w-[calc(100vw-32px)] bg-surface-2 border border-line rounded-[5px] p-4 flex flex-col gap-2.5 shadow-[0_18px_60px_oklch(0_0_0_/_0.6)] z-50"
      >
        <h3 className="m-0 text-[13px] font-semibold">Capture into {project.config.name}</h3>
        <div className="grid grid-cols-[1fr_140px] gap-2">
          <input
            placeholder="Ticket title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            className="w-full bg-surface-input-2 border border-line-soft text-ink rounded-[3px] px-2 py-1.5 text-[12.5px] outline-0 focus:border-accent-deep"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as TicketStatus)}
            className="w-full bg-surface-input-2 border border-line-soft text-ink rounded-[3px] px-2 py-1.5 text-[12.5px] outline-0 focus:border-accent-deep"
          >
            <option value="now">Now</option>
            <option value="next">Next</option>
            <option value="later">Later</option>
            <option value="blocked">Blocked</option>
            <option value="idea">Idea</option>
          </select>
        </div>
        <textarea
          placeholder="Short summary (optional)"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          className="w-full bg-surface-input-2 border border-line-soft text-ink rounded-[3px] px-2 py-1.5 outline-0 focus:border-accent-deep min-h-[70px] resize-y leading-[1.45] font-mono text-[11.5px]"
        />
        <div className="flex gap-2 justify-end">
          <Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy || !title.trim()}>
            <Plus size={11} /> Capture <span className="kbd bg-[oklch(0_0_0_/_0.22)] border-[oklch(0_0_0_/_0.3)] text-accent-ink">⌘↵</span>
          </Btn>
        </div>
      </form>
    </>
  );
}
