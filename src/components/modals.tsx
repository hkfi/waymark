import { AlertTriangle, Check, FolderOpen, Plus, RefreshCw, Sparkles, Triangle } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { LinkRecord, Priority, ProjectConfig, ProjectStage, ProjectStatus, ThreadRecord, Ticket, TicketStatus, WaymarkProject, WorkspaceData } from "../types";
import { lines, recordId, type CaptureKind, type CapturePayload, type FileModalMode } from "../app/model";
import { Btn, cx, Notice } from "./primitives";

export function EmptyState({
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
        workspace, or create a sample to explore the cockpit.
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
          <Sparkles size={11} /> Create sample
        </Btn>
      </div>
    </div>
  );
}

export function CreateWorkspaceModal({
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
        onKeyDown={submitOnCommandEnter}
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

export function CreateProjectModal({
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
        onKeyDown={submitOnCommandEnter}
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

type CapturePickItem = {
  id: string;
  label: string;
  detail?: string;
};

const inputClass =
  "w-full bg-surface-input-2 border border-line-soft text-ink rounded-[3px] px-2 py-1.5 text-[12.5px] outline-0 focus:border-accent-deep";
const textareaClass =
  "w-full bg-surface-input-2 border border-line-soft text-ink rounded-[3px] px-2 py-1.5 outline-0 focus:border-accent-deep min-h-[74px] resize-y leading-[1.45] font-mono text-[11.5px]";

function submitOnCommandEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
  event.preventDefault();
  event.currentTarget.requestSubmit();
}

function isLineSelected(value: string, id: string) {
  return lines(value).includes(id);
}

function toggleLine(value: string, id: string, onChange: (next: string) => void) {
  const next = lines(value);
  const index = next.indexOf(id);
  if (index >= 0) next.splice(index, 1);
  else next.push(id);
  onChange(next.join("\n"));
}

function CapturePickList({
  label,
  empty,
  items,
  value,
  onChange,
}: {
  label: string;
  empty: string;
  items: CapturePickItem[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1 max-h-[132px] overflow-y-auto rounded-[3px] border border-line-soft bg-surface-input-2 p-1">
        {items.length ? (
          <div className="flex flex-col gap-1">
            {items.map((item) => {
              const selected = isLineSelected(value, item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleLine(value, item.id, onChange)}
                  className={cx(
                    "grid grid-cols-[14px_1fr] gap-1.5 rounded-[3px] px-1.5 py-1 text-left text-[11.5px]",
                    selected ? "bg-accent text-accent-ink" : "text-ink-soft hover:bg-surface-3 hover:text-ink",
                  )}
                >
                  <span
                    className={cx(
                      "mt-[1px] grid h-3.5 w-3.5 place-items-center rounded-[2px] border",
                      selected ? "border-accent-ink/40 bg-accent-ink/15" : "border-line bg-surface-1",
                    )}
                  >
                    {selected ? <Check size={10} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.label}</span>
                    {item.detail ? <span className="block truncate text-[10.5px] opacity-75">{item.detail}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="m-0 px-1.5 py-1 text-[11.5px] leading-[1.45] text-ink-mute">{empty}</p>
        )}
      </div>
    </div>
  );
}

export function TicketEditModal({
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
        onKeyDown={submitOnCommandEnter}
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

export function FileLinkModal({
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
        onKeyDown={submitOnCommandEnter}
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

export function CaptureModal({
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileChoices = Array.from(
    new Set([
      ...project.tickets.flatMap((ticket) => ticket.linked_files ?? []),
      ...project.decisions.map((decision) => decision.path),
      ...project.ideas.map((idea) => idea.path),
      ...(project.config.repos?.map((repo) => repo.path).filter((path): path is string => Boolean(path)) ?? []),
    ]),
  )
    .filter(Boolean)
    .map((path) => ({ id: path, label: path }));
  const decisionChoices = project.decisions.map((decision) => ({
    id: decision.id,
    label: decision.title,
    detail: decision.id,
  }));
  const threadChoices = project.threads.map((thread) => ({
    id: thread.id,
    label: thread.title,
    detail: `${thread.provider} · ${thread.status}`,
  }));
  const ticketChoices = project.tickets.map((ticket) => ({
    id: ticket.id,
    label: ticket.title,
    detail: `${ticket.id} · ${ticket.status}`,
  }));

  return (
    <ModalFrame title={`Capture into ${project.config.name}`} onClose={onClose}>
      <form
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && /^[1-4]$/.test(event.key)) {
            event.preventDefault();
            setKind((["ticket", "idea", "decision", "thread"] as CaptureKind[])[Number(event.key) - 1]);
            return;
          }
          submitOnCommandEnter(event);
        }}
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
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <FieldLabel>Context</FieldLabel>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="text-[11px] text-ink-mute hover:text-ink"
                >
                  {showAdvanced ? "Hide advanced fields" : "Advanced fields"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <CapturePickList
                  label="Files"
                  empty="No existing file references yet."
                  items={fileChoices}
                  value={linkedFiles}
                  onChange={setLinkedFiles}
                />
                <CapturePickList
                  label="Decisions"
                  empty="No decisions yet."
                  items={decisionChoices}
                  value={linkedDecisions}
                  onChange={setLinkedDecisions}
                />
                <CapturePickList
                  label="Threads"
                  empty="No thread references yet."
                  items={threadChoices}
                  value={linkedThreads}
                  onChange={setLinkedThreads}
                />
              </div>
              {showAdvanced ? (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <FieldLabel>Raw file paths</FieldLabel>
                    <textarea value={linkedFiles} onChange={(event) => setLinkedFiles(event.target.value)} className={textareaClass} />
                  </div>
                  <div>
                    <FieldLabel>Raw decision IDs</FieldLabel>
                    <textarea value={linkedDecisions} onChange={(event) => setLinkedDecisions(event.target.value)} className={textareaClass} />
                  </div>
                  <div>
                    <FieldLabel>Raw thread IDs</FieldLabel>
                    <textarea value={linkedThreads} onChange={(event) => setLinkedThreads(event.target.value)} className={textareaClass} />
                  </div>
                </div>
              ) : null}
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
            <CapturePickList
              label="Linked tickets"
              empty="No tickets yet."
              items={ticketChoices}
              value={linkedTickets}
              onChange={setLinkedTickets}
            />
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="self-start text-[11px] text-ink-mute hover:text-ink"
            >
              {showAdvanced ? "Hide raw ticket IDs" : "Advanced raw ticket IDs"}
            </button>
            {showAdvanced ? (
              <textarea placeholder="Linked ticket IDs, one per line" value={linkedTickets} onChange={(event) => setLinkedTickets(event.target.value)} className={textareaClass} />
            ) : null}
          </>
        ) : (
          <>
            <CapturePickList
              label="Linked tickets"
              empty="No tickets yet."
              items={ticketChoices}
              value={linkedTickets}
              onChange={setLinkedTickets}
            />
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="self-start text-[11px] text-ink-mute hover:text-ink"
            >
              {showAdvanced ? "Hide raw ticket IDs" : "Advanced raw ticket IDs"}
            </button>
            {showAdvanced ? (
              <textarea placeholder="Linked ticket IDs, one per line" value={linkedTickets} onChange={(event) => setLinkedTickets(event.target.value)} className={textareaClass} />
            ) : null}
          </>
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
