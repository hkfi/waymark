import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  FileText,
  FolderOpen,
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
  Sliders,
  Sparkles,
  Triangle,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { chooseDirectory, isTauri, openPath } from "./tauri";
import type {
  LinkRecord,
  NoteRecord,
  Priority,
  ProjectConfig,
  ProjectStage,
  ProjectStatus,
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
  createWorkspace,
  createNote,
  createProject,
  loadWorkspace,
  saveGeneratedPrompts,
  saveLinks,
  saveTickets,
  saveThreads,
  ticketWarnings,
} from "./workspace";

/* ----------------------------- domain types ----------------------------- */

type NavId = "home" | "queue" | "decisions" | "threads" | "ideas" | "files" | "inbox";
type MainTab = "overview" | "tickets" | "decisions" | "threads" | "files";
type InspectorMode = "ticket" | "prompt" | "thread" | "note";
type Lane = "now" | "next" | "later" | "blocked" | "done";
type CaptureKind = "ticket" | "idea" | "decision" | "thread";
type FileModalMode = "file" | "link";
type CapturePayload =
  | {
      kind: "ticket";
      title: string;
      status: TicketStatus;
      priority: Priority;
      summary: string;
      acceptanceCriteria: string;
      linkedFiles: string;
      linkedDecisions: string;
      linkedThreads: string;
    }
  | {
      kind: "idea" | "decision";
      title: string;
      summary: string;
      body: string;
      linkedTickets: string;
    }
  | {
      kind: "thread";
      title: string;
      provider: ThreadRecord["provider"];
      threadStatus: ThreadRecord["status"];
      url: string;
      summaryFile: string;
      linkedTickets: string;
    };

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
const LEFT_WIDTH_KEY = "waymark:left-sidebar-width";
const RIGHT_WIDTH_KEY = "waymark:right-inspector-width";
const LEFT_WIDTH_DEFAULT = 240;
const RIGHT_WIDTH_DEFAULT = 380;
const LEFT_WIDTH_MIN = 188;
const LEFT_WIDTH_MAX = 360;
const RIGHT_WIDTH_MIN = 300;
const RIGHT_WIDTH_MAX = 560;

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
function resolveProjectPath(project: WaymarkProject, path: string) {
  if (/^(https?:|file:|\/|~\/)/.test(path)) return path;
  return `${project.rootPath}/${path}`;
}
function ticketHasFlag(ticket: Ticket, kind: "ac" | "decision" | "thread") {
  if (kind === "ac") return (ticket.acceptance_criteria?.length ?? 0) > 0;
  if (kind === "decision") return (ticket.linked_decisions?.length ?? 0) > 0;
  return (ticket.linked_threads?.length ?? 0) > 0;
}
function navToTab(id: NavId): MainTab {
  if (id === "queue") return "tickets";
  if (id === "decisions") return "decisions";
  if (id === "threads") return "threads";
  if (id === "files") return "files";
  return id === "home" ? "overview" : "overview";
}
function tabToNav(id: MainTab): NavId {
  if (id === "tickets") return "queue";
  if (id === "decisions") return "decisions";
  if (id === "threads") return "threads";
  if (id === "files") return "files";
  return "home";
}
function matchesSearch(values: Array<string | undefined | null>, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}
function recordId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `item-${Date.now()}`
  );
}
function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function storedWidth(key: string, fallback: number, min: number, max: number) {
  if (typeof window === "undefined") return fallback;
  const value = Number(window.localStorage.getItem(key));
  if (!Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}
function addPromptPath(ticket: Ticket, promptPath: string): Ticket {
  return {
    ...ticket,
    generated_prompts: Array.from(new Set([...(ticket.generated_prompts ?? []), promptPath])),
  };
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
  ariaLabel,
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
  ariaLabel?: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onClick();
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      aria-selected={selected || undefined}
      className={cx(
        "grid items-center border-b border-line-soft last:border-b-0",
        cols,
        onClick && "cursor-pointer hover:bg-surface-row-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent focus-visible:outline-offset-[-2px]",
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
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("ticket");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [fileModalMode, setFileModalMode] = useState<FileModalMode | null>(null);
  const [search, setSearch] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [leftWidth, setLeftWidth] = useState(() =>
    storedWidth(LEFT_WIDTH_KEY, LEFT_WIDTH_DEFAULT, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX),
  );
  const [rightWidth, setRightWidth] = useState(() =>
    storedWidth(RIGHT_WIDTH_KEY, RIGHT_WIDTH_DEFAULT, RIGHT_WIDTH_MIN, RIGHT_WIDTH_MAX),
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const editingTicket = useMemo(() => {
    if (!selectedProject || !editingTicketId) return null;
    return selectedProject.tickets.find((ticket) => ticket.id === editingTicketId) ?? null;
  }, [editingTicketId, selectedProject]);

  const selectedThread = useMemo(() => {
    if (!selectedProject || !selectedThreadId) return null;
    return selectedProject.threads.find((thread) => thread.id === selectedThreadId) ?? null;
  }, [selectedProject, selectedThreadId]);

  const selectedNote = useMemo(() => {
    if (!selectedProject || !selectedNotePath) return null;
    return [...selectedProject.decisions, ...selectedProject.ideas].find((note) => note.path === selectedNotePath) ?? null;
  }, [selectedNotePath, selectedProject]);

  async function refresh(path = rootPath) {
    setError(null);
    try {
      if (!isTauri()) {
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
          setWorkspace(buildDemoWorkspace());
          setNotice("Reloaded demo workspace.");
          return;
        }
        setNotice("Run Waymark through Tauri to reload a local workspace.");
        return;
      }
      const next = await loadWorkspace(path);
      setWorkspace(next);
      setSelectedSlug((current) => current ?? next.projects[0]?.config.slug ?? null);
      setNotice(`Reloaded ${next.config.name}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function requestCreateWorkspace() {
    setCreateWorkspaceOpen(true);
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to create a local workspace.");
    }
  }

  async function handleCreateWorkspace(path: string, name: string) {
    try {
      await createWorkspace(path, name);
      setRootPath(path);
      await refresh(path);
      setCreateWorkspaceOpen(false);
      setNotice(`Created workspace at ${path}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    }
  }

  function requestCreateProject() {
    setCreateProjectOpen(true);
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to create a local project.");
    }
  }

  async function handleCreateProject(config: ProjectConfig) {
    if (!workspace) return;
    try {
      await createProject(workspace, config);
      await refresh(rootPath);
      setSelectedSlug(config.slug);
      setCreateProjectOpen(false);
      setNotice(`Created project ${config.name}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
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
      setSelectedThreadId(null);
      setSelectedNotePath(null);
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
    setSelectedThreadId((current) => {
      if (current && selectedProject.threads.some((thread) => thread.id === current)) return current;
      return selectedProject.threads[0]?.id ?? null;
    });
    setSelectedNotePath((current) => {
      if (current && [...selectedProject.decisions, ...selectedProject.ideas].some((note) => note.path === current)) return current;
      return selectedProject.decisions[0]?.path ?? selectedProject.ideas[0]?.path ?? null;
    });
  }, [selectedProject]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    window.localStorage.setItem(RIGHT_WIDTH_KEY, String(rightWidth));
  }, [rightWidth]);

  function beginResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startLeft = leftWidth;
    const startRight = rightWidth;

    function handleMove(moveEvent: PointerEvent) {
      const delta = moveEvent.clientX - startX;
      if (side === "left") {
        setLeftWidth(clamp(startLeft + delta, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX));
        return;
      }
      setRightWidth(clamp(startRight - delta, RIGHT_WIDTH_MIN, RIGHT_WIDTH_MAX));
    }

    function handleUp() {
      document.body.classList.remove("is-resizing-pane");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    document.body.classList.add("is-resizing-pane");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }

  function toggleMulti(id: string) {
    setMulti((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function handleNav(next: NavId) {
    setNav(next);
    setTab(navToTab(next));
  }

  function handleTab(next: MainTab) {
    setTab(next);
    setNav(tabToNav(next));
  }

  async function handleChooseWorkspace() {
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to choose a workspace folder.");
      return;
    }

    try {
      const path = await chooseDirectory();
      if (!path) return;
      setRootPath(path);
      await refresh(path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
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
    const promptForCopy = tickets
      .map((ticket) => buildPrompt(project, ticket, ["repos", "files", "decisions", "threads", "links"]))
      .join("\n\n---\n\n");
    if (!isTauri()) {
      try {
        await navigator.clipboard.writeText(promptForCopy);
      } catch {
        /* clipboard not always available */
      }
      setNotice("Copied a demo handoff prompt. Run through Tauri to save prompt files.");
      return;
    }
    try {
      const prompts = tickets.map((ticket) => ({
        ticket,
        prompt: buildPrompt(project, ticket, ["repos", "files", "decisions", "threads", "links"]),
      }));
      const saved = await saveGeneratedPrompts(project, prompts);
      try {
        await navigator.clipboard.writeText(promptForCopy);
      } catch {
        /* clipboard not always available */
      }
      const promptByTicket = new Map(saved.map((entry) => [entry.ticketId, entry.promptPath]));
      setWorkspace((current) => {
        if (!current) return current;
        return {
          ...current,
          projects: current.projects.map((candidate) =>
            candidate.config.slug === project.config.slug
              ? {
                  ...candidate,
                  tickets: candidate.tickets.map((ticket) => {
                    const promptPath = promptByTicket.get(ticket.id);
                    return promptPath ? addPromptPath(ticket, promptPath) : ticket;
                  }),
                }
              : candidate,
          ),
        };
      });
      setNotice(`Saved ${saved.length} prompt${saved.length === 1 ? "" : "s"} and copied to clipboard.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleStatusChange(ticket: Ticket, status: TicketStatus) {
    if (!selectedProject) return;
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to update local ticket YAML.");
      return;
    }
    try {
      await saveTickets(
        selectedProject,
        selectedProject.tickets.map((candidate) =>
          candidate.id === ticket.id ? { ...candidate, status } : candidate,
        ),
      );
      setNotice(`Moved ${ticket.title} to ${LANE_LABEL[status as Lane] ?? status}.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleSaveTicket(ticket: Ticket) {
    if (!selectedProject) return;
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to edit local ticket YAML.");
      return;
    }
    try {
      await saveTickets(
        selectedProject,
        selectedProject.tickets.map((candidate) => (candidate.id === ticket.id ? ticket : candidate)),
      );
      setNotice(`Updated ${ticket.title}.`);
      setEditingTicketId(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleCapture(payload: CapturePayload) {
    if (!selectedProject) return;
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to capture into YAML/Markdown.");
      return;
    }

    try {
      if (payload.kind === "ticket") {
        const ticket: Ticket = {
          id: recordId(payload.title),
          title: payload.title,
          status: payload.status,
          priority: payload.priority,
          summary: payload.summary,
          acceptance_criteria: lines(payload.acceptanceCriteria),
          linked_files: lines(payload.linkedFiles),
          linked_decisions: lines(payload.linkedDecisions),
          linked_threads: lines(payload.linkedThreads),
          generated_prompts: [],
        };
        await saveTickets(selectedProject, [...selectedProject.tickets, ticket]);
      } else if (payload.kind === "idea" || payload.kind === "decision") {
        await createNote(
          selectedProject,
          payload.kind,
          payload.title,
          payload.summary || payload.body || "Captured from Waymark.",
          lines(payload.linkedTickets),
        );
      } else if (payload.kind === "thread") {
        const thread: ThreadRecord = {
          id: recordId(payload.title),
          provider: payload.provider,
          title: payload.title,
          status: payload.threadStatus,
          url: payload.url.trim() || null,
          summary_file: payload.summaryFile.trim() || undefined,
          linked_tickets: lines(payload.linkedTickets),
        };
        await saveThreads(selectedProject, [...selectedProject.threads, thread]);
      }

      setNotice(`Captured ${payload.title}.`);
      setCaptureOpen(false);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleAddFile(ticketId: string, path: string) {
    if (!selectedProject) return;
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to add linked files.");
      return;
    }
    const cleanPath = path.trim();
    if (!cleanPath) return;
    try {
      await saveTickets(
        selectedProject,
        selectedProject.tickets.map((ticket) =>
          ticket.id === ticketId
            ? { ...ticket, linked_files: Array.from(new Set([...(ticket.linked_files ?? []), cleanPath])) }
            : ticket,
        ),
      );
      setNotice(`Linked ${cleanPath}.`);
      setFileModalMode(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleAddLink(link: LinkRecord) {
    if (!selectedProject) return;
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to add links.");
      return;
    }
    try {
      await saveLinks(selectedProject, [...selectedProject.links.filter((item) => item.id !== link.id), link]);
      setNotice(`Added ${link.label}.`);
      setFileModalMode(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const shellStyle = {
    "--shell-left": `${leftWidth}px`,
    "--shell-right": `${rightWidth}px`,
  } as CSSProperties;

  return (
    <div className="app-frame w-screen h-screen bg-surface grid grid-rows-[36px_1fr] overflow-hidden">
      <WorkspaceToolbar
        workspace={workspace}
        project={selectedProject}
        rootPath={rootPath}
        style={shellStyle}
        onRefresh={() => refresh()}
        onOpenFolder={() => {
          if (!isTauri()) {
            setNotice("Run Waymark through Tauri to open the workspace folder.");
            return;
          }
          openPath(rootPath);
        }}
        onOpenConfig={() => {
          if (!isTauri()) {
            setNotice("Run Waymark through Tauri to open waymark.yaml.");
            return;
          }
          openPath(`${rootPath}/waymark.yaml`);
        }}
      />
      <div
        className="app-shell grid grid-cols-shell xl:grid-cols-shell-wide h-full min-h-0 min-w-0 overflow-hidden"
        style={shellStyle}
      >
        <Sidebar
          workspace={workspace}
          rootPath={rootPath}
          onRootPathChange={setRootPath}
          selectedSlug={selectedProject?.config.slug ?? null}
          onSelectProject={setSelectedSlug}
          nav={nav}
          onNav={handleNav}
          onRefresh={() => refresh()}
          onSeed={handleSeed}
          onCreateWorkspace={requestCreateWorkspace}
          onChooseWorkspace={handleChooseWorkspace}
          onRequestProject={requestCreateProject}
        />
        <PaneResizeHandle
          side="left"
          value={leftWidth}
          min={LEFT_WIDTH_MIN}
          max={LEFT_WIDTH_MAX}
          onPointerDown={(event) => beginResize("left", event)}
          onReset={() => setLeftWidth(LEFT_WIDTH_DEFAULT)}
        />
        <main className="app-main bg-surface flex flex-col min-w-0 min-h-0 overflow-hidden">
          <MainHeader
            project={selectedProject}
            workspace={workspace}
            tab={tab}
            onTab={handleTab}
            selectedTicket={selectedTicket}
            selectedCount={multi.length}
            handoffDisabled={!selectedProject || (!selectedTicket && multi.length === 0)}
            search={search}
            onSearch={setSearch}
            searchInputRef={searchInputRef}
            gapsOnly={gapsOnly}
            onToggleGaps={() => setGapsOnly((current) => !current)}
            onCapture={() => {
              if (!isTauri()) {
                setNotice("Run Waymark through Tauri to capture tickets into YAML.");
                return;
              }
              setCaptureOpen(true);
            }}
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
                onChooseWorkspace={handleChooseWorkspace}
                onSeed={handleSeed}
                onRefresh={() => refresh()}
                onCreateWorkspace={requestCreateWorkspace}
              />
            ) : !selectedProject ? (
              <div className="grid place-items-center gap-3.5 py-16 px-8 text-center text-ink-faint">
                <Triangle size={28} className="text-accent" />
                <h2 className="m-0 text-[18px] font-semibold tracking-[-0.01em] text-ink">
                  No projects in this workspace
                </h2>
                <p className="m-0 max-w-[460px] text-[13px] leading-[1.55]">
                  Create a project to add its readable <code>project.yaml</code>, tickets, links, and thread files.
                </p>
                <Btn variant="primary" onClick={requestCreateProject}>
                  <Plus size={13} /> Create project
                </Btn>
              </div>
            ) : (
              <CockpitContent
                nav={nav}
                tab={tab}
                project={selectedProject}
                workspace={workspace}
                selectedTicketId={selectedTicketId}
                selectedTicket={selectedTicket}
                onSelectTicket={(ticket) => {
                  setSelectedTicketId(ticket.id);
                  setInspectorMode("ticket");
                }}
                onSelectThread={(thread) => {
                  setSelectedThreadId(thread.id);
                  setInspectorMode("thread");
                }}
                onSelectNote={(note) => {
                  setSelectedNotePath(note.path);
                  setInspectorMode("note");
                }}
                multi={multi}
                toggleMulti={toggleMulti}
                search={search}
                gapsOnly={gapsOnly}
                onNav={handleNav}
                onAddFile={() => {
                  if (!isTauri()) {
                    setNotice("Run Waymark through Tauri to add file context.");
                    return;
                  }
                  setFileModalMode("file");
                }}
                onAddLink={() => {
                  if (!isTauri()) {
                    setNotice("Run Waymark through Tauri to add links.");
                    return;
                  }
                  setFileModalMode("link");
                }}
              />
            )}
          </div>
        </main>
        <PaneResizeHandle
          side="right"
          value={rightWidth}
          min={RIGHT_WIDTH_MIN}
          max={RIGHT_WIDTH_MAX}
          onPointerDown={(event) => beginResize("right", event)}
          onReset={() => setRightWidth(RIGHT_WIDTH_DEFAULT)}
        />
        <Inspector
          mode={inspectorMode}
          onMode={setInspectorMode}
          project={selectedProject}
          ticket={selectedTicket}
          thread={selectedThread}
          note={selectedNote}
          multi={multi}
          workspace={workspace}
          onSendHandoff={handleHandoff}
          onStatus={handleStatusChange}
          onEditTicket={(ticket) => setEditingTicketId(ticket.id)}
        />
      </div>

      {captureOpen && selectedProject ? (
        <CaptureModal
          project={selectedProject}
          onClose={() => setCaptureOpen(false)}
          onCreated={handleCapture}
        />
      ) : null}
      {createWorkspaceOpen ? (
        <CreateWorkspaceModal
          tauri={isTauri()}
          onClose={() => setCreateWorkspaceOpen(false)}
          onChooseWorkspace={chooseDirectory}
          onCreate={handleCreateWorkspace}
        />
      ) : null}
      {createProjectOpen ? (
        <CreateProjectModal
          tauri={isTauri()}
          workspace={workspace}
          onClose={() => setCreateProjectOpen(false)}
          onCreate={handleCreateProject}
        />
      ) : null}
      {editingTicket && selectedProject ? (
        <TicketEditModal
          ticket={editingTicket}
          onClose={() => setEditingTicketId(null)}
          onSave={handleSaveTicket}
        />
      ) : null}
      {fileModalMode && selectedProject ? (
        <FileLinkModal
          mode={fileModalMode}
          project={selectedProject}
          selectedTicket={selectedTicket}
          onClose={() => setFileModalMode(null)}
          onAddFile={handleAddFile}
          onAddLink={handleAddLink}
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
    <div className={cx("text-[12px] px-3 py-2 rounded-[5px] border mb-3 flex items-start gap-2 flex-wrap", tones[tone])}>
      {children}
    </div>
  );
}

function WorkspaceToolbar({
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

function PaneResizeHandle({
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
        <span className="w-1.5 h-1.5 rounded-full bg-lane-done shadow-[0_0_0_3px_oklch(0.74_0.13_150_/_0.18)] shrink-0" />
        <span className="shrink-0">File-native</span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-mute shrink-0">
          {workspace ? "manual writes" : "—"}
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

function MainHeader({
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

/* ----------------------------- main views ------------------------------ */

function CockpitContent({
  nav,
  tab,
  project,
  workspace,
  selectedTicketId,
  selectedTicket,
  onSelectTicket,
  onSelectThread,
  onSelectNote,
  multi,
  toggleMulti,
  search,
  gapsOnly,
  onNav,
  onAddFile,
  onAddLink,
}: {
  nav: NavId;
  tab: MainTab;
  project: WaymarkProject;
  workspace: WorkspaceData;
  selectedTicketId: string | null;
  selectedTicket: Ticket | null;
  onSelectTicket: (ticket: Ticket) => void;
  onSelectThread: (thread: ThreadRecord) => void;
  onSelectNote: (note: NoteRecord) => void;
  multi: string[];
  toggleMulti: (id: string) => void;
  search: string;
  gapsOnly: boolean;
  onNav: (id: NavId) => void;
  onAddFile: () => void;
  onAddLink: () => void;
}) {
  const view: NavId | MainTab = nav === "home" && tab !== "overview" ? tab : nav;

  if (view === "queue" || view === "tickets") {
    return (
      <>
        <Stats project={project} />
        <Queue
          project={project}
          selectedKey={selectedTicketId}
          onSelect={onSelectTicket}
          multi={multi}
          toggleMulti={toggleMulti}
          search={search}
          gapsOnly={gapsOnly}
        />
      </>
    );
  }

  if (view === "decisions") {
    return <Decisions decisions={project.decisions} search={search} onSelect={onSelectNote} />;
  }

  if (view === "threads") {
    return <ThreadsView project={project} search={search} onSelect={onSelectThread} />;
  }

  if (view === "ideas") {
    return <NotesView title="Ideas" notes={project.ideas} search={search} empty="No ideas captured." onSelect={onSelectNote} />;
  }

  if (view === "inbox") {
    return <InboxView project={project} workspace={workspace} search={search} gapsOnly={gapsOnly} />;
  }

  if (view === "files") {
    return (
      <FilesView
        project={project}
        selectedTicket={selectedTicket}
        search={search}
        onAddFile={onAddFile}
        onAddLink={onAddLink}
      />
    );
  }

  return (
    <>
      <Stats project={project} />
      <Queue
        project={project}
        selectedKey={selectedTicketId}
        onSelect={onSelectTicket}
        multi={multi}
        toggleMulti={toggleMulti}
        search={search}
        gapsOnly={gapsOnly}
        onViewAll={() => onNav("queue")}
      />
      <Decisions decisions={project.decisions} search={search} limit={8} onViewAll={() => onNav("decisions")} onSelect={onSelectNote} />
      <IdeasAndActivity project={project} workspace={workspace} search={search} onSelectNote={onSelectNote} onSelectThread={onSelectThread} onSelectTicket={onSelectTicket} />
    </>
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
  gapsOnly,
  onViewAll,
}: {
  project: WaymarkProject;
  selectedKey: string | null;
  onSelect: (ticket: Ticket) => void;
  multi: string[];
  toggleMulti: (id: string) => void;
  search: string;
  gapsOnly: boolean;
  onViewAll?: () => void;
}) {
  const lanes = useMemo(() => {
    const filter = search.trim().toLowerCase();
    const matching = project.tickets.filter((ticket) => {
      if (ticket.status === "idea") return false;
      if (gapsOnly && ticketWarnings(project, ticket).length === 0) return false;
      if (!filter) return true;
      return (
        ticket.title.toLowerCase().includes(filter) ||
        ticket.id.toLowerCase().includes(filter) ||
        ticket.summary?.toLowerCase().includes(filter) ||
        ticket.linked_files?.some((file) => file.toLowerCase().includes(filter))
      );
    });
    return LANES_IN_QUEUE.map((lane) => ({
      lane,
      items: matching.filter((ticket) => ticket.status === lane),
    })).filter((group) => group.items.length > 0);
  }, [project, search, gapsOnly]);

  const activeCount = project.tickets.filter(
    (ticket) => ticket.status !== "done" && ticket.status !== "idea",
  ).length;

  return (
    <div className="mb-[22px]">
      <SectionHead
        more={
          onViewAll ? (
          <button
            onClick={onViewAll}
            className="text-[11px] text-ink-mute inline-flex items-center gap-1 hover:text-ink-soft cursor-pointer"
          >
            View all <ArrowRight size={11} />
          </button>
          ) : undefined
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
      ariaLabel={`Open ticket ${ticket.title}`}
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

function Decisions({
  decisions,
  search,
  limit,
  onViewAll,
  onSelect,
}: {
  decisions: NoteRecord[];
  search: string;
  limit?: number;
  onViewAll?: () => void;
  onSelect?: (note: NoteRecord) => void;
}) {
  const visible = decisions.filter((decision) =>
    matchesSearch([decision.id, decision.title, decision.status, decision.date, decision.body], search),
  );

  if (visible.length === 0) {
    return (
      <div className="mb-[22px]">
        <SectionHead>
          Decisions <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">0</span>
        </SectionHead>
        <Card>
          <EmptyRow>{search ? "No decisions match." : "No decisions captured yet."}</EmptyRow>
        </Card>
      </div>
    );
  }
  const rows = typeof limit === "number" ? visible.slice(0, limit) : visible;
  return (
    <div className="mb-[22px]">
      <SectionHead
        more={
          onViewAll ? (
          <button
            onClick={onViewAll}
            className="text-[11px] text-ink-mute inline-flex items-center gap-1 hover:text-ink-soft cursor-pointer"
          >
            All decisions <ArrowRight size={11} />
          </button>
          ) : undefined
        }
      >
        Decisions <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{visible.length}</span>
      </SectionHead>
      <Card>
        {rows.map((decision) => (
          <DataRow
            key={decision.path}
            cols="grid-cols-decision-narrow xl:grid-cols-decision"
            height={30}
            paddingX={14}
            gap={12}
            onClick={() => onSelect?.(decision)}
            ariaLabel={`Open decision ${decision.title}`}
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

function NotesView({
  title,
  notes,
  search,
  empty,
  onSelect,
}: {
  title: string;
  notes: NoteRecord[];
  search: string;
  empty: string;
  onSelect?: (note: NoteRecord) => void;
}) {
  const visible = notes.filter((note) =>
    matchesSearch([note.id, note.title, note.status, note.date, note.body, note.path], search),
  );
  return (
    <div className="mb-[22px]">
      <SectionHead>
        {title} <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{visible.length}</span>
      </SectionHead>
      <Card>
        {visible.length === 0 ? (
          <EmptyRow>{search ? `No ${title.toLowerCase()} match.` : empty}</EmptyRow>
        ) : (
          visible.map((note) => (
            <DataRow
              key={note.path}
              cols="grid-cols-decision-narrow xl:grid-cols-decision"
              height={30}
              paddingX={14}
              gap={12}
              onClick={() => onSelect?.(note)}
              ariaLabel={`Open ${note.type} ${note.title}`}
            >
              <Cell mono size={11} tone="faint">{note.id}</Cell>
              <Cell tone="ink">{note.title}</Cell>
              <div className="justify-self-start min-w-0 max-w-full font-mono text-[10px] text-ink-faint bg-surface-row-selected border border-line px-1.5 py-px rounded-[3px] truncate">
                {note.status ?? note.type}
              </div>
              <Cell mono size={10.5} tone="mute">{note.date ?? "—"}</Cell>
              <Cell mono size={10.5} tone="mute" align="end" title={note.path} className="hidden xl:block">
                {note.path.split("/").slice(-2).join("/")}
              </Cell>
            </DataRow>
          ))
        )}
      </Card>
    </div>
  );
}

function ThreadsView({
  project,
  search,
  onSelect,
}: {
  project: WaymarkProject;
  search: string;
  onSelect: (thread: ThreadRecord) => void;
}) {
  const visible = project.threads.filter((thread) =>
    matchesSearch([thread.id, thread.title, thread.provider, thread.status, thread.summary_file, thread.url], search),
  );
  return (
    <div className="mb-[22px]">
      <SectionHead>
        Threads <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{visible.length}</span>
      </SectionHead>
      <Card>
        {visible.length === 0 ? (
          <EmptyRow>{search ? "No threads match." : "No threads linked yet."}</EmptyRow>
        ) : (
          visible.map((thread) => (
            <DataRow
              key={thread.id}
              cols="grid-cols-link"
              height={30}
              paddingX={12}
              gap={10}
              onClick={() => onSelect(thread)}
              ariaLabel={`Open thread reference ${thread.title}`}
            >
              <Cell mono size={10} tone="mute" className="uppercase tracking-[0.07em]">{thread.provider}</Cell>
              <Cell mono size={11} tone="faint">{thread.id}</Cell>
              <Cell tone="soft" title={thread.title}>{thread.title}</Cell>
              <span className="font-mono text-[10px] text-ink-mute shrink-0">{thread.status}</span>
            </DataRow>
          ))
        )}
      </Card>
    </div>
  );
}

function FilesView({
  project,
  selectedTicket,
  search,
  onAddFile,
  onAddLink,
}: {
  project: WaymarkProject;
  selectedTicket: Ticket | null;
  search: string;
  onAddFile: () => void;
  onAddLink: () => void;
}) {
  const rows = [
    ...(project.config.repos ?? []).map((repo) => ({
      kind: "repo",
      id: repo.id,
      label: repo.name,
      value: repo.path ?? repo.url ?? repo.name,
      actionPath: repo.path ?? repo.url,
    })),
    ...Object.entries(project.config.links ?? {}).map(([id, url]) => ({
      kind: "link",
      id,
      label: id,
      value: url,
      actionPath: url,
    })),
    ...project.links.map((link) => ({
      kind: link.type,
      id: link.id,
      label: link.label,
      value: link.url,
      actionPath: link.url,
    })),
    ...project.tickets.flatMap((ticket) =>
      (ticket.linked_files ?? []).map((file) => ({
        kind: "file",
        id: ticket.id,
        label: ticket.title,
        value: file,
        actionPath: resolveProjectPath(project, file),
      })),
    ),
    ...project.decisions.map((decision) => ({
      kind: "decision",
      id: decision.id,
      label: decision.title,
      value: decision.path,
      actionPath: decision.path,
    })),
    ...project.ideas.map((idea) => ({
      kind: "idea",
      id: idea.id,
      label: idea.title,
      value: idea.path,
      actionPath: idea.path,
    })),
  ].filter((row) => matchesSearch([row.kind, row.id, row.label, row.value], search));

  return (
    <div className="mb-[22px]">
      <SectionHead
        more={
          <div className="flex items-center gap-1">
            <Btn variant="ghost" onClick={onAddFile}>
              <Plus size={11} /> File
            </Btn>
            <Btn variant="ghost" onClick={onAddLink}>
              <Plus size={11} /> Link
            </Btn>
          </div>
        }
      >
        Files & links <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{rows.length}{selectedTicket ? ` · ${selectedTicket.id}` : ""}</span>
      </SectionHead>
      <Card>
        {rows.length === 0 ? (
          <EmptyRow>{search ? "No files or links match." : "No file context yet."}</EmptyRow>
        ) : (
          rows.map((row) => (
            <DataRow
              key={`${row.kind}-${row.id}-${row.value}`}
              cols="grid-cols-link"
              height={32}
              paddingX={12}
              gap={10}
              onClick={row.actionPath ? () => openPath(row.actionPath as string) : undefined}
              ariaLabel={`Open ${row.kind} ${row.label}`}
            >
              <Cell mono size={9.5} tone="mute" className="uppercase tracking-[0.07em]">{row.kind}</Cell>
              <Cell mono size={11} tone="faint">{row.id}</Cell>
              <div className="min-w-0">
                <div className="truncate text-[12px] text-ink-soft" title={row.label}>{row.label}</div>
                <div className="truncate font-mono text-[10.5px] text-ink-mute" title={row.value}>{row.value}</div>
              </div>
              <div className="flex items-center gap-1 justify-end shrink-0">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    navigator.clipboard?.writeText(row.value).catch(() => undefined);
                  }}
                  title="Copy"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-ink-faint rounded-[3px] text-[11px] hover:bg-surface-3 hover:text-ink cursor-pointer"
                >
                  <Copy size={10} />
                </button>
                {row.actionPath ? (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      openPath(row.actionPath as string);
                    }}
                    title="Open"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-ink-faint rounded-[3px] text-[11px] hover:bg-surface-3 hover:text-ink cursor-pointer"
                  >
                    <ArrowRight size={10} />
                  </button>
                ) : null}
              </div>
            </DataRow>
          ))
        )}
      </Card>
    </div>
  );
}

function InboxView({
  project,
  workspace,
  search,
  gapsOnly,
}: {
  project: WaymarkProject;
  workspace: WorkspaceData;
  search: string;
  gapsOnly: boolean;
}) {
  const ticketGaps = project.tickets.flatMap((ticket) =>
    ticketWarnings(project, ticket).map((warning) => ({
      kind: "ticket",
      id: ticket.id,
      title: warning,
    })),
  );
  const rows = [
    ...workspace.warnings.map((warning, index) => ({ kind: "workspace", id: String(index + 1), title: warning })),
    ...project.warnings.map((warning, index) => ({ kind: "project", id: String(index + 1), title: warning })),
    ...(gapsOnly ? ticketGaps : []),
  ].filter((row) => matchesSearch([row.kind, row.id, row.title], search));

  return (
    <div className="mb-[22px]">
      <SectionHead>
        Inbox <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{rows.length}</span>
      </SectionHead>
      <Card>
        {rows.length === 0 ? (
          <EmptyRow>No warnings right now.</EmptyRow>
        ) : (
          rows.map((row, index) => (
            <DataRow key={`${row.kind}-${row.id}-${index}`} cols="grid-cols-link" height={30} paddingX={12} gap={10}>
              <Cell mono size={10} tone="mute" className="uppercase tracking-[0.07em]">{row.kind}</Cell>
              <Cell mono size={11} tone="faint">{row.id}</Cell>
              <Cell tone="soft" title={row.title}>{row.title}</Cell>
              <AlertTriangle size={12} className="text-warn justify-self-end" />
            </DataRow>
          ))
        )}
      </Card>
    </div>
  );
}

/* --------------------------- ideas + activity --------------------------- */

function IdeasAndActivity({
  project,
  workspace,
  search,
  onSelectNote,
  onSelectThread,
  onSelectTicket,
}: {
  project: WaymarkProject;
  workspace: WorkspaceData;
  search: string;
  onSelectNote: (note: NoteRecord) => void;
  onSelectThread: (thread: ThreadRecord) => void;
  onSelectTicket: (ticket: Ticket) => void;
}) {
  const activity = useMemo(() => buildActivity(workspace, project), [workspace, project]);
  const ideas = project.ideas.filter((idea) =>
    matchesSearch([idea.id, idea.title, idea.status, idea.date, idea.body], search),
  );
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-[22px] mb-[22px]">
      <div className="min-w-0">
        <SectionHead>
          Ideas <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{ideas.length}</span>
        </SectionHead>
        <Card>
          {ideas.length === 0 ? (
            <EmptyRow>{search ? "No ideas match." : "No ideas captured."}</EmptyRow>
          ) : (
            ideas.slice(0, 8).map((idea) => (
              <DataRow
                key={idea.path}
                cols="grid-cols-idea"
                height={28}
                paddingX={12}
                gap={10}
                onClick={() => onSelectNote(idea)}
                ariaLabel={`Open idea ${idea.title}`}
              >
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
            activity.map((row, index) => {
              const thread = project.threads.find((candidate) => candidate.title === row.text);
              const ticket = project.tickets.find((candidate) => candidate.title === row.text);
              const note = [...project.decisions, ...project.ideas].find((candidate) => candidate.title === row.text);
              const onClick = thread
                ? () => onSelectThread(thread)
                : ticket
                  ? () => onSelectTicket(ticket)
                  : note
                    ? () => onSelectNote(note)
                    : undefined;
              return (
              <DataRow
                key={`${row.kind}-${index}`}
                cols="grid-cols-activity"
                height={26}
                paddingX={12}
                gap={10}
                onClick={onClick}
                ariaLabel={onClick ? `Open ${row.text}` : undefined}
              >
                <Cell mono size={10} tone="mute">{row.t}</Cell>
                <span className="inline-flex items-center shrink-0"><Pin kind={row.kind} /></span>
                <Cell mono size={10} tone="faint">{row.proj}</Cell>
                <Cell size={11.5} tone="soft">{row.text}</Cell>
              </DataRow>
              );
            })
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
  thread,
  note,
  multi,
  workspace,
  onSendHandoff,
  onStatus,
  onEditTicket,
}: {
  mode: InspectorMode;
  onMode: (value: InspectorMode) => void;
  project: WaymarkProject | null;
  ticket: Ticket | null;
  thread: ThreadRecord | null;
  note: NoteRecord | null;
  multi: string[];
  workspace: WorkspaceData | null;
  onSendHandoff: () => void;
  onStatus: (ticket: Ticket, status: TicketStatus) => void;
  onEditTicket: (ticket: Ticket) => void;
}) {
  const bundleSize = multi.length;

  return (
    <aside className="inspector-shell bg-surface-rail-2 border-l border-line flex flex-col min-h-0 min-w-0 overflow-hidden">
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
          Ref
        </InspectorTab>
        <InspectorTab active={mode === "note"} onClick={() => onMode("note")} icon={ListOrdered}>
          Note
        </InspectorTab>
        <div className="flex-1 min-w-0" />
        <button
          onClick={() => project && openPath(project.rootPath)}
          disabled={!project}
          className="w-6 h-6 shrink-0 grid place-items-center rounded-[3px] text-ink-faint hover:bg-surface-3 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
          title="Open project folder"
        >
          <Link2 size={12} />
        </button>
      </div>

      {!project || !workspace ? (
        <InspectorEmpty>Open a workspace to see ticket details.</InspectorEmpty>
      ) : mode === "ticket" ? (
        ticket ? (
          <InspectorTicket
            project={project}
            ticket={ticket}
            onStatus={onStatus}
            onSendHandoff={onSendHandoff}
            onEdit={onEditTicket}
          />
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
      ) : mode === "thread" ? (
        <InspectorThread project={project} ticket={ticket} selectedThread={thread} />
      ) : (
        <InspectorNote note={note} />
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
  onEdit,
}: {
  project: WaymarkProject;
  ticket: Ticket;
  onStatus: (ticket: Ticket, status: TicketStatus) => void;
  onSendHandoff: () => void;
  onEdit: (ticket: Ticket) => void;
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
                No summary written yet. Add one to this ticket in <code>tickets.yaml</code>.
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
                No acceptance criteria yet. Add clear checks before sending this ticket to an agent.
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
                      onClick={() => openPath(resolveProjectPath(project, path))}
                      title="Open"
                      className="inline-flex items-center gap-1 px-1 py-0.5 text-ink-faint rounded-[3px] text-[11px] hover:bg-surface-3 hover:text-ink cursor-pointer"
                    >
                      <ArrowRight size={10} />
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
        <Btn onClick={() => onEdit(ticket)}>
          <FileText size={11} /> Edit
        </Btn>
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
              <span>● local prompt</span>
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
                <span className="text-ink-mute justify-self-end font-mono text-[10px]">{entry.priority ?? "med"}</span>
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
      </InspectorActions>
    </>
  );
}

function InspectorThread({
  project,
  ticket,
  selectedThread,
}: {
  project: WaymarkProject;
  ticket: Ticket | null;
  selectedThread: ThreadRecord | null;
}) {
  const linked = ticket
    ? project.threads.find((thread) => ticket.linked_threads?.includes(thread.id))
    : null;
  const fallback = project.threads[0] ?? null;
  const thread: ThreadRecord | null = selectedThread ?? linked ?? fallback;

  if (!thread) return <InspectorEmpty>No thread references captured yet.</InspectorEmpty>;

  return (
    <>
      <InspectorBody>
        <InspectorHead
          eyebrow={<span className="text-[10.5px] text-ink-faint tracking-[0.08em] uppercase">Manual thread reference</span>}
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
              Summary <span className="text-ink-mute normal-case tracking-normal">· stored file path</span>
            </>
          }
        >
          <div className="text-[12.5px] text-ink-soft leading-[1.55]">
            {thread.summary_file ? <code>{thread.summary_file}</code> : <span className="text-ink-mute">No summary file.</span>}
          </div>
        </InspectorSection>
        <InspectorSection label="What this is">
          <div className="text-[12.5px] text-ink-faint leading-[1.55]">
            Waymark stores thread IDs, URLs, and summary-file references that you enter. It does not read private Codex app threads directly.
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
        <Btn onClick={() => navigator.clipboard?.writeText(thread.id).catch(() => undefined)}>
          <Copy size={11} /> Copy ID
        </Btn>
        {thread.url ? (
          <Btn variant="ghost" onClick={() => openPath(thread.url as string)}>
            <ArrowRight size={11} /> Open URL
          </Btn>
        ) : null}
      </InspectorActions>
    </>
  );
}

function InspectorNote({ note }: { note: NoteRecord | null }) {
  if (!note) return <InspectorEmpty>Select a decision or idea to inspect.</InspectorEmpty>;
  return (
    <>
      <InspectorBody>
        <InspectorHead
          eyebrow={
            <>
              <span className="font-mono text-[10.5px] text-ink-faint tracking-[0.08em] uppercase">{note.type}</span>
              <span className="font-mono text-[10.5px] text-ink-mute">· {note.status ?? "open"}</span>
            </>
          }
          title={note.title}
          meta={
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-ink-mute whitespace-nowrap overflow-hidden flex-wrap">
              <span>{note.id}</span>
              <span>·</span>
              <span>{note.date ?? "undated"}</span>
            </div>
          }
        />
        <InspectorSection label="Body">
          <div className="text-[12.5px] text-ink-soft leading-[1.55] whitespace-pre-wrap">{note.body || "No body."}</div>
        </InspectorSection>
        <InspectorSection label="Linked tickets">
          <Card>
            {note.linked_tickets.length === 0 ? (
              <EmptyRow>No linked tickets.</EmptyRow>
            ) : (
              note.linked_tickets.map((id) => <LinkRow key={id} kind="ticket" identifier={id} title={id} />)
            )}
          </Card>
        </InspectorSection>
      </InspectorBody>
      <InspectorActions>
        <Btn onClick={() => navigator.clipboard?.writeText(note.path).catch(() => undefined)}>
          <Copy size={11} /> Copy path
        </Btn>
        <Btn variant="ghost" onClick={() => openPath(note.path)}>
          <ArrowRight size={11} /> Open file
        </Btn>
      </InspectorActions>
    </>
  );
}

/* ------------------------------ empty state ----------------------------- */

function EmptyState({
  tauri,
  rootPath,
  onRootPath,
  onChooseWorkspace,
  onSeed,
  onRefresh,
  onCreateWorkspace,
}: {
  tauri: boolean;
  rootPath: string;
  onRootPath: (value: string) => void;
  onChooseWorkspace: () => void;
  onSeed: () => void;
  onRefresh: () => void;
  onCreateWorkspace: () => void;
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
        <Btn onClick={onChooseWorkspace} disabled={!tauri}>
          <FolderOpen size={13} /> Browse
        </Btn>
        <Btn onClick={onCreateWorkspace} disabled={!tauri}>
          <Plus size={13} /> New workspace
        </Btn>
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

function CreateWorkspaceModal({
  tauri,
  onClose,
  onChooseWorkspace,
  onCreate,
}: {
  tauri: boolean;
  onClose: () => void;
  onChooseWorkspace: () => Promise<string | null>;
  onCreate: (path: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState("Waymark Workspace");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function chooseDestination() {
    setError(null);
    try {
      const selected = await onChooseWorkspace();
      if (selected) setPath(selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <ModalFrame title="Create workspace" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const cleanPath = path.trim();
          const cleanName = name.trim() || "Waymark Workspace";
          if (!cleanPath) {
            setError("Choose or enter a destination folder.");
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await onCreate(cleanPath, cleanName);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          } finally {
            setBusy(false);
          }
        }}
        className="flex flex-col gap-3"
      >
        <p className="m-0 text-[12.5px] leading-[1.55] text-ink-faint">
          Creation uses this destination only. The current workspace path is for opening and reloading existing workspaces.
        </p>
        <div>
          <FieldLabel>Name</FieldLabel>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={cx(inputClass, "mt-1")}
            autoFocus
          />
        </div>
        <div>
          <FieldLabel>Destination folder</FieldLabel>
          <div className="grid grid-cols-[1fr_auto] gap-2 mt-1">
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/path/to/empty-folder"
              spellCheck={false}
              className={inputClass}
            />
            <Btn type="button" onClick={chooseDestination} disabled={!tauri}>
              <FolderOpen size={13} /> Browse
            </Btn>
          </div>
        </div>
        {!tauri ? (
          <Notice tone="warn">
            <AlertTriangle size={13} /> Workspace creation writes local files, so it is only enabled in Tauri.
          </Notice>
        ) : null}
        {error ? <Notice tone="err"><AlertTriangle size={13} /> {error}</Notice> : null}
        <div className="flex gap-2 justify-end">
          <Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={!tauri || busy || !path.trim()}>
            <Plus size={11} /> Create workspace
          </Btn>
        </div>
      </form>
    </ModalFrame>
  );
}

function CreateProjectModal({
  tauri,
  workspace,
  onClose,
  onCreate,
}: {
  tauri: boolean;
  workspace: WorkspaceData | null;
  onClose: () => void;
  onCreate: (config: ProjectConfig) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [currentFocus, setCurrentFocus] = useState("");
  const [stage, setStage] = useState<ProjectStage>("prototype");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [repoName, setRepoName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(recordId(value));
  }

  return (
    <ModalFrame title="Create project" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const cleanName = name.trim();
          const cleanSlug = recordId(slug || name);
          const cleanSummary = summary.trim();
          if (!workspace) {
            setError("Open or create a workspace first.");
            return;
          }
          if (!cleanName || !cleanSlug || !cleanSummary) {
            setError("Name, slug, and summary are required.");
            return;
          }
          if (repoUrl.trim() && !/^https?:\/\//.test(repoUrl.trim())) {
            setError("Repo URL must start with http:// or https://.");
            return;
          }

          const repo =
            repoName.trim() || repoPath.trim() || repoUrl.trim()
              ? {
                  id: recordId(repoName || cleanName),
                  name: repoName.trim() || `${cleanName} repo`,
                  ...(repoPath.trim() ? { path: repoPath.trim() } : {}),
                  ...(repoUrl.trim() ? { url: repoUrl.trim() } : {}),
                }
              : undefined;

          const config: ProjectConfig = {
            version: 1,
            name: cleanName,
            slug: cleanSlug,
            status,
            stage,
            summary: cleanSummary,
            current_focus: currentFocus.trim() || undefined,
            tags: [],
            repos: repo ? [repo] : [],
            links: {},
          };

          setBusy(true);
          setError(null);
          try {
            await onCreate(config);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          } finally {
            setBusy(false);
          }
        }}
        className="flex flex-col gap-3"
      >
        <p className="m-0 text-[12.5px] leading-[1.55] text-ink-faint">
          Waymark will create <code>{workspace?.config.projects_dir ?? "projects"}/&lt;slug&gt;</code> with readable YAML/Markdown files.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-2">
          <div>
            <FieldLabel>Name</FieldLabel>
            <input
              value={name}
              onChange={(event) => updateName(event.target.value)}
              placeholder="My Project"
              className={cx(inputClass, "mt-1")}
              autoFocus
            />
          </div>
          <div>
            <FieldLabel>Slug</FieldLabel>
            <input
              value={slug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(recordId(event.target.value));
              }}
              placeholder="my-project"
              className={cx(inputClass, "mt-1 font-mono")}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Stage</FieldLabel>
            <select value={stage} onChange={(event) => setStage(event.target.value as ProjectStage)} className={cx(inputClass, "mt-1")}>
              <option value="idea">Idea</option>
              <option value="spec">Spec</option>
              <option value="prototype">Prototype</option>
              <option value="mvp">MVP</option>
              <option value="alpha">Alpha</option>
              <option value="beta">Beta</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div>
            <FieldLabel>Status</FieldLabel>
            <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)} className={cx(inputClass, "mt-1")}>
              <option value="active">Active</option>
              <option value="exploring">Exploring</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div>
          <FieldLabel>Summary</FieldLabel>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="What is this project for?"
            className={cx(textareaClass, "mt-1 min-h-[62px]")}
          />
        </div>
        <div>
          <FieldLabel>Current focus</FieldLabel>
          <input
            value={currentFocus}
            onChange={(event) => setCurrentFocus(event.target.value)}
            placeholder="What should humans and agents pay attention to right now?"
            className={cx(inputClass, "mt-1")}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <FieldLabel>Repo name</FieldLabel>
            <input value={repoName} onChange={(event) => setRepoName(event.target.value)} placeholder="App repo" className={cx(inputClass, "mt-1")} />
          </div>
          <div>
            <FieldLabel>Repo path</FieldLabel>
            <input value={repoPath} onChange={(event) => setRepoPath(event.target.value)} placeholder="~/code/app" className={cx(inputClass, "mt-1 font-mono")} />
          </div>
          <div>
            <FieldLabel>Repo URL</FieldLabel>
            <input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/..." className={cx(inputClass, "mt-1")} />
          </div>
        </div>
        {!tauri ? (
          <Notice tone="warn">
            <AlertTriangle size={13} /> Project creation writes local files, so it is only enabled in Tauri.
          </Notice>
        ) : null}
        {error ? <Notice tone="err"><AlertTriangle size={13} /> {error}</Notice> : null}
        <div className="flex gap-2 justify-end">
          <Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={!tauri || busy || !workspace || !name.trim() || !summary.trim()}>
            <Plus size={11} /> Create project
          </Btn>
        </div>
      </form>
    </ModalFrame>
  );
}

/* ------------------------------- editing ------------------------------- */

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-[10px] uppercase tracking-[0.10em] text-ink-mute font-semibold">{children}</label>;
}

const inputClass =
  "w-full bg-surface-input-2 border border-line-soft text-ink rounded-[3px] px-2 py-1.5 text-[12.5px] outline-0 focus:border-accent-deep";
const textareaClass =
  "w-full bg-surface-input-2 border border-line-soft text-ink rounded-[3px] px-2 py-1.5 outline-0 focus:border-accent-deep min-h-[74px] resize-y leading-[1.45] font-mono text-[11.5px]";

function TicketEditModal({
  ticket,
  onClose,
  onSave,
}: {
  ticket: Ticket;
  onClose: () => void;
  onSave: (ticket: Ticket) => Promise<void>;
}) {
  const [title, setTitle] = useState(ticket.title);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = useState<Priority>(ticket.priority ?? "medium");
  const [summary, setSummary] = useState(ticket.summary ?? "");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState((ticket.acceptance_criteria ?? []).join("\n"));
  const [linkedFiles, setLinkedFiles] = useState((ticket.linked_files ?? []).join("\n"));
  const [linkedDecisions, setLinkedDecisions] = useState((ticket.linked_decisions ?? []).join("\n"));
  const [linkedThreads, setLinkedThreads] = useState((ticket.linked_threads ?? []).join("\n"));
  const [busy, setBusy] = useState(false);

  return (
    <ModalFrame title={`Edit ${ticket.id}`} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!title.trim()) return;
          setBusy(true);
          await onSave({
            ...ticket,
            title: title.trim(),
            status,
            priority,
            summary: summary.trim(),
            acceptance_criteria: lines(acceptanceCriteria),
            linked_files: lines(linkedFiles),
            linked_decisions: lines(linkedDecisions),
            linked_threads: lines(linkedThreads),
          });
          setBusy(false);
        }}
        className="flex flex-col gap-2.5"
      >
        <input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus)} className={inputClass}>
            <option value="idea">Idea</option>
            <option value="now">Now</option>
            <option value="next">Next</option>
            <option value="later">Later</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className={inputClass}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
        </div>
        <FieldLabel>Summary</FieldLabel>
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} className={textareaClass} />
        <FieldLabel>Acceptance criteria, one per line</FieldLabel>
        <textarea value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} className={textareaClass} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <FieldLabel>Files</FieldLabel>
            <textarea value={linkedFiles} onChange={(event) => setLinkedFiles(event.target.value)} className={textareaClass} />
          </div>
          <div>
            <FieldLabel>Decisions</FieldLabel>
            <textarea value={linkedDecisions} onChange={(event) => setLinkedDecisions(event.target.value)} className={textareaClass} />
          </div>
          <div>
            <FieldLabel>Threads</FieldLabel>
            <textarea value={linkedThreads} onChange={(event) => setLinkedThreads(event.target.value)} className={textareaClass} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy || !title.trim()}>
            <Check size={11} /> Save ticket
          </Btn>
        </div>
      </form>
    </ModalFrame>
  );
}

function FileLinkModal({
  mode,
  project,
  selectedTicket,
  onClose,
  onAddFile,
  onAddLink,
}: {
  mode: FileModalMode;
  project: WaymarkProject;
  selectedTicket: Ticket | null;
  onClose: () => void;
  onAddFile: (ticketId: string, path: string) => Promise<void>;
  onAddLink: (link: LinkRecord) => Promise<void>;
}) {
  const [ticketId, setTicketId] = useState(selectedTicket?.id ?? project.tickets[0]?.id ?? "");
  const [path, setPath] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<LinkRecord["type"]>("doc");
  const [environment, setEnvironment] = useState<LinkRecord["environment"]>("other");
  const [busy, setBusy] = useState(false);

  return (
    <ModalFrame title={mode === "file" ? "Add linked file" : "Add project link"} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          if (mode === "file") {
            await onAddFile(ticketId, path);
          } else {
            await onAddLink({
              id: recordId(label || url),
              label: label.trim() || url.trim(),
              url: url.trim(),
              type,
              environment,
            });
          }
          setBusy(false);
        }}
        className="flex flex-col gap-2.5"
      >
        {mode === "file" ? (
          <>
            <FieldLabel>Ticket</FieldLabel>
            <select value={ticketId} onChange={(event) => setTicketId(event.target.value)} className={inputClass}>
              {project.tickets.map((ticket) => (
                <option key={ticket.id} value={ticket.id}>{ticket.title}</option>
              ))}
            </select>
            <FieldLabel>Path</FieldLabel>
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="src/App.tsx or ~/code/project/file.md"
              className={inputClass}
              autoFocus
            />
          </>
        ) : (
          <>
            <FieldLabel>Label</FieldLabel>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Design, production, docs..." className={inputClass} autoFocus />
            <FieldLabel>URL</FieldLabel>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." className={inputClass} />
            <div className="grid grid-cols-2 gap-2">
              <select value={type} onChange={(event) => setType(event.target.value as LinkRecord["type"])} className={inputClass}>
                <option value="doc">Doc</option>
                <option value="design">Design</option>
                <option value="repo">Repo</option>
                <option value="deploy">Deploy</option>
                <option value="dashboard">Dashboard</option>
                <option value="other">Other</option>
              </select>
              <select value={environment} onChange={(event) => setEnvironment(event.target.value as LinkRecord["environment"])} className={inputClass}>
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="preview">Preview</option>
                <option value="local">Local</option>
                <option value="other">Other</option>
              </select>
            </div>
          </>
        )}
        <div className="flex gap-2 justify-end">
          <Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn
            type="submit"
            variant="primary"
            disabled={busy || (mode === "file" ? !ticketId || !path.trim() : !url.trim())}
          >
            <Plus size={11} /> Add {mode}
          </Btn>
        </div>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-[oklch(0_0_0_/_0.45)] z-40" onClick={onClose} />
      <div className="fixed top-16 left-1/2 -translate-x-1/2 w-[680px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-96px)] overflow-y-auto bg-surface-2 border border-line rounded-[5px] p-4 shadow-[0_18px_60px_oklch(0_0_0_/_0.6)] z-50">
        <h3 className="m-0 mb-3 text-[13px] font-semibold">{title}</h3>
        {children}
      </div>
    </>
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
  onCreated: (payload: CapturePayload) => Promise<void>;
}) {
  const [kind, setKind] = useState<CaptureKind>("ticket");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<TicketStatus>("now");
  const [priority, setPriority] = useState<Priority>("medium");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [linkedFiles, setLinkedFiles] = useState("");
  const [linkedDecisions, setLinkedDecisions] = useState("");
  const [linkedThreads, setLinkedThreads] = useState("");
  const [linkedTickets, setLinkedTickets] = useState("");
  const [provider, setProvider] = useState<ThreadRecord["provider"]>("codex");
  const [threadStatus, setThreadStatus] = useState<ThreadRecord["status"]>("active");
  const [url, setUrl] = useState("");
  const [summaryFile, setSummaryFile] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <ModalFrame title={`Capture into ${project.config.name}`} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!title.trim()) return;
          setBusy(true);
          if (kind === "ticket") {
            await onCreated({
              kind,
              title: title.trim(),
              status,
              priority,
              summary: summary.trim(),
              acceptanceCriteria,
              linkedFiles,
              linkedDecisions,
              linkedThreads,
            });
          } else if (kind === "thread") {
            await onCreated({
              kind,
              title: title.trim(),
              provider,
              threadStatus,
              url,
              summaryFile,
              linkedTickets,
            });
          } else {
            await onCreated({
              kind,
              title: title.trim(),
              summary: summary.trim(),
              body: summary,
              linkedTickets,
            });
          }
          setBusy(false);
        }}
        className="flex flex-col gap-2.5"
      >
        <div className="grid grid-cols-4 gap-1">
          {(["ticket", "idea", "decision", "thread"] as CaptureKind[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={cx(
                "h-7 rounded-[3px] border text-[11.5px] capitalize",
                kind === option
                  ? "bg-accent text-accent-ink border-accent-deep font-semibold"
                  : "bg-surface-input-2 border-line-soft text-ink-faint hover:text-ink",
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <div className={cx("grid gap-2", kind === "ticket" ? "grid-cols-[1fr_140px_120px]" : "grid-cols-1")}>
          <input
            placeholder={`${kind[0].toUpperCase()}${kind.slice(1)} title`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            className={inputClass}
          />
          {kind === "ticket" ? (
            <>
              <select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus)} className={inputClass}>
                <option value="now">Now</option>
                <option value="next">Next</option>
                <option value="later">Later</option>
                <option value="blocked">Blocked</option>
                <option value="idea">Idea</option>
              </select>
              <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className={inputClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </>
          ) : null}
        </div>
        <textarea
          placeholder={kind === "ticket" ? "Short summary" : "Notes or summary"}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          className={textareaClass}
        />
        {kind === "ticket" ? (
          <>
            <FieldLabel>Acceptance criteria, one per line</FieldLabel>
            <textarea value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} className={textareaClass} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <textarea placeholder="Linked files" value={linkedFiles} onChange={(event) => setLinkedFiles(event.target.value)} className={textareaClass} />
              <textarea placeholder="Decision IDs" value={linkedDecisions} onChange={(event) => setLinkedDecisions(event.target.value)} className={textareaClass} />
              <textarea placeholder="Thread IDs" value={linkedThreads} onChange={(event) => setLinkedThreads(event.target.value)} className={textareaClass} />
            </div>
          </>
        ) : kind === "thread" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <select value={provider} onChange={(event) => setProvider(event.target.value as ThreadRecord["provider"])} className={inputClass}>
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
                <option value="chatgpt">ChatGPT</option>
                <option value="cursor">Cursor</option>
                <option value="other">Other</option>
              </select>
              <select value={threadStatus} onChange={(event) => setThreadStatus(event.target.value as ThreadRecord["status"])} className={inputClass}>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="paused">Paused</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>
            <input placeholder="Thread URL (optional)" value={url} onChange={(event) => setUrl(event.target.value)} className={inputClass} />
            <input placeholder="Summary file path (optional)" value={summaryFile} onChange={(event) => setSummaryFile(event.target.value)} className={inputClass} />
            <textarea placeholder="Linked ticket IDs, one per line" value={linkedTickets} onChange={(event) => setLinkedTickets(event.target.value)} className={textareaClass} />
          </>
        ) : (
          <textarea placeholder="Linked ticket IDs, one per line" value={linkedTickets} onChange={(event) => setLinkedTickets(event.target.value)} className={textareaClass} />
        )}
        <div className="flex gap-2 justify-end">
          <Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy || !title.trim()}>
            <Plus size={11} /> Capture <span className="kbd bg-[oklch(0_0_0_/_0.22)] border-[oklch(0_0_0_/_0.3)] text-accent-ink">⌘↵</span>
          </Btn>
        </div>
      </form>
    </ModalFrame>
  );
}
