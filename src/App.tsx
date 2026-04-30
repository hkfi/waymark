import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clipboard,
  FileText,
  FolderOpen,
  GitBranch,
  Lightbulb,
  Link as LinkIcon,
  MessageSquareText,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isTauri, openPath } from "./tauri";
import type { ThreadRecord, Ticket, TicketStatus, WaymarkProject, WorkspaceData } from "./types";
import {
  buildPrompt,
  createNote,
  createSampleWorkspace,
  loadWorkspace,
  saveGeneratedPrompt,
  saveThreads,
  saveTickets,
  ticketWarnings,
} from "./workspace";

type View = "dashboard" | "overview" | "tickets" | "notes" | "threads" | "handoff";

const ticketStatuses: TicketStatus[] = ["idea", "now", "next", "later", "blocked", "done"];
const defaultWorkspacePath = "/Users/hirokifuruichi/code/waymark/sample-workspace";

const statusLabel: Record<TicketStatus, string> = {
  idea: "Ideas",
  now: "Now",
  next: "Next",
  later: "Later",
  blocked: "Blocked",
  done: "Done",
};

function blankTicket(): Ticket {
  return {
    id: "",
    title: "",
    status: "now",
    priority: "medium",
    summary: "",
    acceptance_criteria: [],
    linked_files: [],
    linked_decisions: [],
    linked_threads: [],
    generated_prompts: [],
  };
}

function fieldId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function App() {
  const [rootPath, setRootPath] = useState(defaultWorkspacePath);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ticketDraft, setTicketDraft] = useState<Ticket>(blankTicket());
  const [criteriaDraft, setCriteriaDraft] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState<"idea" | "decision">("idea");
  const [threadTitle, setThreadTitle] = useState("");
  const [threadProvider, setThreadProvider] = useState<ThreadRecord["provider"]>("codex");
  const [threadUrl, setThreadUrl] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [context, setContext] = useState(["repos", "files", "decisions", "threads", "links"]);

  const selectedProject = useMemo(
    () => workspace?.projects.find((project) => project.config.slug === selectedSlug) ?? workspace?.projects[0] ?? null,
    [selectedSlug, workspace],
  );

  const selectedTicket = useMemo(
    () => selectedProject?.tickets.find((ticket) => ticket.id === selectedTicketId) ?? selectedProject?.tickets[0] ?? null,
    [selectedProject, selectedTicketId],
  );

  async function refresh(path = rootPath) {
    setError(null);
    setNotice(null);
    try {
      const nextWorkspace = await loadWorkspace(path);
      setWorkspace(nextWorkspace);
      setSelectedSlug((current) => current ?? nextWorkspace.projects[0]?.config.slug ?? null);
      setSelectedTicketId((current) => current ?? nextWorkspace.projects[0]?.tickets[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleCreateSample() {
    if (!isTauri()) {
      setError("Run Waymark through Tauri to create local workspace files.");
      return;
    }

    await createSampleWorkspace(rootPath);
    setNotice(`Created sample workspace at ${rootPath}`);
    await refresh(rootPath);
  }

  async function handleAddTicket(project: WaymarkProject) {
    if (!ticketDraft.title.trim()) return;
    const ticket: Ticket = {
      ...ticketDraft,
      id: ticketDraft.id || fieldId(ticketDraft.title),
      acceptance_criteria: splitLines(criteriaDraft),
      linked_files: ticketDraft.linked_files ?? [],
      linked_decisions: ticketDraft.linked_decisions ?? [],
      linked_threads: ticketDraft.linked_threads ?? [],
      generated_prompts: [],
    };
    await saveTickets(project, [...project.tickets, ticket]);
    setTicketDraft(blankTicket());
    setCriteriaDraft("");
    setNotice(`Created ticket "${ticket.title}"`);
    await refresh();
  }

  async function handleTicketStatus(project: WaymarkProject, ticket: Ticket, status: TicketStatus) {
    await saveTickets(
      project,
      project.tickets.map((candidate) => (candidate.id === ticket.id ? { ...candidate, status } : candidate)),
    );
    await refresh();
  }

  async function handleAddNote(project: WaymarkProject) {
    if (!noteTitle.trim() || !noteBody.trim()) return;
    await createNote(project, noteType, noteTitle, noteBody, []);
    setNotice(`Created ${noteType} "${noteTitle}"`);
    setNoteTitle("");
    setNoteBody("");
    await refresh();
  }

  async function handleAddThread(project: WaymarkProject) {
    if (!threadTitle.trim()) return;
    const id = fieldId(threadTitle);
    const thread: ThreadRecord = {
      id,
      title: threadTitle,
      provider: threadProvider,
      status: "active",
      url: threadUrl.trim() || null,
      summary_file: `ai/thread-summaries/${id}.md`,
      linked_tickets: selectedTicket ? [selectedTicket.id] : [],
    };
    await saveThreads(project, [...project.threads, thread]);
    setThreadTitle("");
    setThreadUrl("");
    setNotice(`Created thread reference "${thread.title}"`);
    await refresh();
  }

  async function handleGeneratePrompt(project: WaymarkProject, ticket: Ticket) {
    const prompt = buildPrompt(project, ticket, context);
    const promptPath = await saveGeneratedPrompt(project, ticket, prompt);
    await navigator.clipboard.writeText(prompt);
    setNotice(`Saved ${promptPath} and copied the prompt to clipboard.`);
    await refresh();
  }

  useEffect(() => {
    if (isTauri()) {
      refresh().catch((caught) => setError(String(caught)));
    }
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">W</div>
          <div>
            <h1>Waymark</h1>
            <p>Local project cockpit</p>
          </div>
        </div>

        <div className="workspace-picker">
          <label htmlFor="workspace-path">Workspace</label>
          <input id="workspace-path" value={rootPath} onChange={(event) => setRootPath(event.target.value)} />
          <div className="row-actions">
            <button type="button" onClick={() => refresh()} className="button primary">
              <FolderOpen size={15} />
              Open
            </button>
            <button type="button" onClick={handleCreateSample} className="button">
              <Sparkles size={15} />
              Seed
            </button>
          </div>
        </div>

        <nav className="main-nav">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <Target size={15} />
            Dashboard
          </button>
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>
            <BookOpen size={15} />
            Overview
          </button>
          <button className={view === "tickets" ? "active" : ""} onClick={() => setView("tickets")}>
            <Clipboard size={15} />
            Tickets
          </button>
          <button className={view === "notes" ? "active" : ""} onClick={() => setView("notes")}>
            <Lightbulb size={15} />
            Ideas & Decisions
          </button>
          <button className={view === "threads" ? "active" : ""} onClick={() => setView("threads")}>
            <MessageSquareText size={15} />
            Threads
          </button>
          <button className={view === "handoff" ? "active" : ""} onClick={() => setView("handoff")}>
            <Sparkles size={15} />
            Handoff
          </button>
        </nav>

        <div className="project-list">
          <div className="section-label">Projects</div>
          {workspace?.projects.map((project) => (
            <button
              key={project.config.slug}
              className={`project-chip ${project.config.slug === selectedProject?.config.slug ? "selected" : ""}`}
              onClick={() => {
                setSelectedSlug(project.config.slug);
                setSelectedTicketId(project.tickets[0]?.id ?? null);
                if (view === "dashboard") setView("overview");
              }}
            >
              <span>{project.config.name}</span>
              <small>{project.config.stage}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyeline">{workspace?.config.name ?? "No workspace loaded"}</p>
            <h2>{viewTitle(view, selectedProject)}</h2>
          </div>
          <button className="button" onClick={() => refresh()}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </header>

        {notice ? <div className="notice success">{notice}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        {!isTauri() ? (
          <div className="notice warning">Run with `pnpm tauri dev` for local filesystem features.</div>
        ) : null}

        {!workspace ? (
          <EmptyState onCreate={handleCreateSample} />
        ) : view === "dashboard" ? (
          <Dashboard workspace={workspace} onSelect={(slug) => {
            setSelectedSlug(slug);
            setView("overview");
          }} />
        ) : selectedProject ? (
          <>
            {view === "overview" ? <ProjectOverview project={selectedProject} /> : null}
            {view === "tickets" ? (
              <TicketsView
                project={selectedProject}
                draft={ticketDraft}
                criteriaDraft={criteriaDraft}
                onCriteriaDraft={setCriteriaDraft}
                onDraft={setTicketDraft}
                onAddTicket={handleAddTicket}
                onStatus={handleTicketStatus}
                onHandoff={(ticket) => {
                  setSelectedTicketId(ticket.id);
                  setView("handoff");
                }}
              />
            ) : null}
            {view === "notes" ? (
              <NotesView
                project={selectedProject}
                noteTitle={noteTitle}
                noteBody={noteBody}
                noteType={noteType}
                onTitle={setNoteTitle}
                onBody={setNoteBody}
                onType={setNoteType}
                onCreate={handleAddNote}
              />
            ) : null}
            {view === "threads" ? (
              <ThreadsView
                project={selectedProject}
                threadTitle={threadTitle}
                threadProvider={threadProvider}
                threadUrl={threadUrl}
                onTitle={setThreadTitle}
                onProvider={setThreadProvider}
                onUrl={setThreadUrl}
                onCreate={handleAddThread}
              />
            ) : null}
            {view === "handoff" && selectedTicket ? (
              <HandoffView
                project={selectedProject}
                ticket={selectedTicket}
                selectedContext={context}
                onContext={setContext}
                onTicket={setSelectedTicketId}
                onGenerate={handleGeneratePrompt}
              />
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

function viewTitle(view: View, project: WaymarkProject | null) {
  if (view === "dashboard") return "Workspace Dashboard";
  if (!project) return "No Project Selected";
  const labels: Record<View, string> = {
    dashboard: "Workspace Dashboard",
    overview: `${project.config.name} Overview`,
    tickets: `${project.config.name} Tickets`,
    notes: `${project.config.name} Ideas & Decisions`,
    threads: `${project.config.name} AI Threads`,
    handoff: `${project.config.name} Agent Handoff`,
  };
  return labels[view];
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-state">
      <Sparkles size={28} />
      <h2>Create a sample Waymark workspace</h2>
      <p>Seed a local file-native workspace to explore the MVP cockpit, tickets, decisions, and handoff flow.</p>
      <button className="button primary" onClick={onCreate}>
        <Plus size={15} />
        Seed Sample Workspace
      </button>
    </section>
  );
}

function Dashboard({ workspace, onSelect }: { workspace: WorkspaceData; onSelect: (slug: string) => void }) {
  const activeTickets = workspace.projects.flatMap((project) =>
    project.tickets
      .filter((ticket) => ["idea", "now", "next", "blocked"].includes(ticket.status))
      .map((ticket) => ({ project, ticket })),
  );

  return (
    <div className="dashboard-grid">
      <section className="panel span-2">
        <div className="panel-header">
          <h3>Projects</h3>
          <span>{workspace.projects.length}</span>
        </div>
        <div className="project-table">
          {workspace.projects.map((project) => (
            <button key={project.config.slug} onClick={() => onSelect(project.config.slug)}>
              <strong>{project.config.name}</strong>
              <span>{project.config.current_focus || "No current focus"}</span>
              <small>{project.config.status} · {project.config.stage}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Warnings</h3>
          <span>{workspace.projects.reduce((count, project) => count + project.warnings.length, 0)}</span>
        </div>
        <WarningList warnings={workspace.projects.flatMap((project) => project.warnings.map((warning) => `${project.config.name}: ${warning}`)).slice(0, 8)} />
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <h3>Active Local Tickets</h3>
          <span>{activeTickets.length}</span>
        </div>
        <div className="rows">
          {activeTickets.map(({ project, ticket }) => (
            <div className="data-row" key={`${project.config.slug}-${ticket.id}`}>
              <div>
                <strong>{ticket.title}</strong>
                <span>{project.config.name} · {ticket.status}</span>
              </div>
              <small>{ticket.priority ?? "medium"}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Recent Notes</h3>
          <span>{workspace.projects.reduce((count, project) => count + project.ideas.length + project.decisions.length, 0)}</span>
        </div>
        <div className="rows compact">
          {workspace.projects
            .flatMap((project) => [...project.ideas, ...project.decisions].map((note) => ({ project, note })))
            .slice(0, 6)
            .map(({ project, note }) => (
              <div className="data-row" key={note.path}>
                <div>
                  <strong>{note.title}</strong>
                  <span>{project.config.name} · {note.type}</span>
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function ProjectOverview({ project }: { project: WaymarkProject }) {
  return (
    <div className="stack">
      <section className="project-hero">
        <div>
          <div className="tag-row">
            <span>{project.config.status}</span>
            <span>{project.config.stage}</span>
            {project.config.tags?.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <h3>{project.config.name}</h3>
          <p>{project.config.summary}</p>
        </div>
        <div className="focus-box">
          <span>Current focus</span>
          <strong>{project.config.current_focus || "Not set"}</strong>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <h3>Repos</h3>
            <span>{project.config.repos?.length ?? 0}</span>
          </div>
          <div className="rows">
            {project.config.repos?.map((repo) => (
              <div className="data-row" key={repo.id}>
                <div>
                  <strong>{repo.name}</strong>
                  <span>{repo.path || repo.url || "No path"}</span>
                </div>
                <OpenButtons path={repo.path} url={repo.url} />
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Links</h3>
            <span>{Object.keys(project.config.links ?? {}).length + project.links.length}</span>
          </div>
          <div className="rows">
            {Object.entries(project.config.links ?? {}).map(([label, url]) => (
              <div className="data-row" key={label}>
                <div>
                  <strong>{label}</strong>
                  <span>{url}</span>
                </div>
                <OpenButtons url={url} />
              </div>
            ))}
            {project.links.map((link) => (
              <div className="data-row" key={link.id}>
                <div>
                  <strong>{link.label}</strong>
                  <span>{link.type} · {link.environment ?? "n/a"}</span>
                </div>
                <OpenButtons url={link.url} />
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Readiness</h3>
            <span>{project.warnings.length}</span>
          </div>
          <WarningList warnings={project.warnings} />
        </section>
      </div>
    </div>
  );
}

function TicketsView({
  project,
  draft,
  criteriaDraft,
  onCriteriaDraft,
  onDraft,
  onAddTicket,
  onStatus,
  onHandoff,
}: {
  project: WaymarkProject;
  draft: Ticket;
  criteriaDraft: string;
  onCriteriaDraft: (value: string) => void;
  onDraft: (ticket: Ticket) => void;
  onAddTicket: (project: WaymarkProject) => void;
  onStatus: (project: WaymarkProject, ticket: Ticket, status: TicketStatus) => void;
  onHandoff: (ticket: Ticket) => void;
}) {
  return (
    <div className="stack">
      <section className="form-panel">
        <h3>Create Local Ticket</h3>
        <div className="form-grid">
          <input placeholder="Title" value={draft.title} onChange={(event) => onDraft({ ...draft, title: event.target.value, id: fieldId(event.target.value) })} />
          <select value={draft.status} onChange={(event) => onDraft({ ...draft, status: event.target.value as TicketStatus })}>
            {ticketStatuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
          </select>
          <textarea placeholder="Summary" value={draft.summary} onChange={(event) => onDraft({ ...draft, summary: event.target.value })} />
          <textarea placeholder="Acceptance criteria, one per line" value={criteriaDraft} onChange={(event) => onCriteriaDraft(event.target.value)} />
        </div>
        <button className="button primary" onClick={() => onAddTicket(project)}>
          <Plus size={15} />
          Create Ticket
        </button>
      </section>

      <section className="ticket-board">
        {ticketStatuses.map((status) => (
          <div className="ticket-column" key={status}>
            <h3>{statusLabel[status]}</h3>
            {project.tickets.filter((ticket) => ticket.status === status).map((ticket) => (
              <article className="ticket-card" key={ticket.id}>
                <div className="ticket-top">
                  <strong>{ticket.title}</strong>
                  <span>{ticket.priority ?? "medium"}</span>
                </div>
                <p>{ticket.summary || "No summary yet."}</p>
                <div className="ticket-meta">
                  <span>{ticket.acceptance_criteria?.length ?? 0} criteria</span>
                  <span>{ticket.generated_prompts?.length ?? 0} prompts</span>
                </div>
                <div className="ticket-actions">
                  <select value={ticket.status} onChange={(event) => onStatus(project, ticket, event.target.value as TicketStatus)}>
                    {ticketStatuses.map((nextStatus) => <option key={nextStatus} value={nextStatus}>{statusLabel[nextStatus]}</option>)}
                  </select>
                  <button className="icon-button" onClick={() => onHandoff(ticket)} aria-label={`Generate handoff for ${ticket.title}`}>
                    <Sparkles size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function NotesView({
  project,
  noteTitle,
  noteBody,
  noteType,
  onTitle,
  onBody,
  onType,
  onCreate,
}: {
  project: WaymarkProject;
  noteTitle: string;
  noteBody: string;
  noteType: "idea" | "decision";
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onType: (value: "idea" | "decision") => void;
  onCreate: (project: WaymarkProject) => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="form-panel">
        <h3>Capture Thinking</h3>
        <div className="segmented">
          <button className={noteType === "idea" ? "selected" : ""} onClick={() => onType("idea")}>Idea</button>
          <button className={noteType === "decision" ? "selected" : ""} onClick={() => onType("decision")}>Decision</button>
        </div>
        <input placeholder="Title" value={noteTitle} onChange={(event) => onTitle(event.target.value)} />
        <textarea placeholder="What did you decide, learn, or want to explore?" value={noteBody} onChange={(event) => onBody(event.target.value)} />
        <button className="button primary" onClick={() => onCreate(project)}>
          <Plus size={15} />
          Save {noteType}
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Ideas</h3>
          <span>{project.ideas.length}</span>
        </div>
        <NoteRows notes={project.ideas} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Decisions</h3>
          <span>{project.decisions.length}</span>
        </div>
        <NoteRows notes={project.decisions} />
      </section>
    </div>
  );
}

function ThreadsView({
  project,
  threadTitle,
  threadProvider,
  threadUrl,
  onTitle,
  onProvider,
  onUrl,
  onCreate,
}: {
  project: WaymarkProject;
  threadTitle: string;
  threadProvider: ThreadRecord["provider"];
  threadUrl: string;
  onTitle: (value: string) => void;
  onProvider: (value: ThreadRecord["provider"]) => void;
  onUrl: (value: string) => void;
  onCreate: (project: WaymarkProject) => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="form-panel">
        <h3>Add AI Thread Reference</h3>
        <input placeholder="Thread title" value={threadTitle} onChange={(event) => onTitle(event.target.value)} />
        <select value={threadProvider} onChange={(event) => onProvider(event.target.value as ThreadRecord["provider"])}>
          <option value="codex">Codex</option>
          <option value="claude">Claude</option>
          <option value="chatgpt">ChatGPT</option>
          <option value="cursor">Cursor</option>
          <option value="other">Other</option>
        </select>
        <input placeholder="Optional URL" value={threadUrl} onChange={(event) => onUrl(event.target.value)} />
        <button className="button primary" onClick={() => onCreate(project)}>
          <Plus size={15} />
          Save Thread
        </button>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <h3>Thread Records</h3>
          <span>{project.threads.length}</span>
        </div>
        <div className="rows">
          {project.threads.map((thread) => (
            <div className="data-row" key={thread.id}>
              <div>
                <strong>{thread.title}</strong>
                <span>{thread.provider} · {thread.status} · {thread.summary_file ?? "no summary"}</span>
              </div>
              <OpenButtons url={thread.url ?? undefined} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HandoffView({
  project,
  ticket,
  selectedContext,
  onContext,
  onTicket,
  onGenerate,
}: {
  project: WaymarkProject;
  ticket: Ticket;
  selectedContext: string[];
  onContext: (value: string[]) => void;
  onTicket: (id: string) => void;
  onGenerate: (project: WaymarkProject, ticket: Ticket) => void;
}) {
  const warnings = ticketWarnings(project, ticket);
  const prompt = buildPrompt(project, ticket, selectedContext);
  const contextOptions = [
    ["repos", "Repos"],
    ["files", "Linked files"],
    ["decisions", "Decisions"],
    ["threads", "AI threads"],
    ["links", "Links"],
  ];

  return (
    <div className="handoff-grid">
      <section className="panel">
        <div className="panel-header">
          <h3>Ticket</h3>
          <span>{ticket.status}</span>
        </div>
        <select value={ticket.id} onChange={(event) => onTicket(event.target.value)}>
          {project.tickets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select>
        <div className="handoff-ticket">
          <h3>{ticket.title}</h3>
          <p>{ticket.summary || "No summary yet."}</p>
        </div>
        <div className="panel-header slim">
          <h3>Readiness</h3>
          <span>{warnings.length}</span>
        </div>
        <WarningList warnings={warnings.length ? warnings : ["Looks ready for a local agent handoff."]} good={!warnings.length} />
        <div className="context-list">
          {contextOptions.map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={selectedContext.includes(key)}
                onChange={(event) =>
                  onContext(
                    event.target.checked
                      ? [...selectedContext, key]
                      : selectedContext.filter((candidate) => candidate !== key),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        <button className="button primary wide" onClick={() => onGenerate(project, ticket)}>
          <Sparkles size={15} />
          Save & Copy Prompt
        </button>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-header">
          <h3>Generated Prompt Preview</h3>
          <span>{prompt.length} chars</span>
        </div>
        <pre>{prompt}</pre>
      </section>
    </div>
  );
}

function WarningList({ warnings, good = false }: { warnings: string[]; good?: boolean }) {
  if (!warnings.length) return <p className="muted">No warnings.</p>;

  return (
    <div className="warning-list">
      {warnings.map((warning) => (
        <div className={good ? "good-item" : "warning-item"} key={warning}>
          {good ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}

function OpenButtons({ path, url }: { path?: string; url?: string }) {
  return (
    <div className="open-buttons">
      {path ? (
        <button className="icon-button" onClick={() => openPath(path)} aria-label="Open local path">
          <FolderOpen size={15} />
        </button>
      ) : null}
      {url ? (
        <button className="icon-button" onClick={() => openPath(url)} aria-label="Open URL">
          <ArrowUpRight size={15} />
        </button>
      ) : null}
    </div>
  );
}

function NoteRows({ notes }: { notes: { path: string; title: string; status?: string; body: string }[] }) {
  return (
    <div className="rows">
      {notes.map((note) => (
        <div className="note-row" key={note.path}>
          <div>
            <strong>{note.title}</strong>
            <span>{note.status ?? "open"}</span>
          </div>
          <p>{note.body.replace(/^# .+$/m, "").trim().slice(0, 180)}</p>
        </div>
      ))}
    </div>
  );
}

export default App;
