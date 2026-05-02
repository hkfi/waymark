import { AlertTriangle, ArrowRight, Copy, FileText, Link2, ListOrdered, MessageSquareText, Sparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { openPath } from "../tauri";
import type { NoteRecord, ThreadRecord, Ticket, TicketStatus, WaymarkProject, WorkspaceData } from "../types";
import { buildPrompt } from "../workspace";
import { activeLane, projectFile, resolveProjectPath, tokenEstimate, type InspectorMode } from "../app/model";
import { Btn, Card, Cell, DataRow, EmptyRow, StatusChip, cx } from "./primitives";

export function Inspector({
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
