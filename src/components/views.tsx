import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Box,
  Check,
  Copy,
  FileCheck2,
  FileText,
  Gauge,
  GitBranch,
  Globe2,
  HardDrive,
  Link2,
  MessageSquareText,
  Palette,
  Plus,
  Rocket,
  Send,
  Server,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { contextRowKey, contextRowRemoveConfirmation, contextRowRemoveLabel, contextRows, type ContextRow } from "../contextRows";
import { openPath } from "../tauri";
import type { LinkRecord, NoteRecord, ThreadRecord, Ticket, WaymarkProject, WorkspaceData } from "../types";
import { ticketWarnings } from "../workspace";
import { LANES_IN_QUEUE, LANE_LABEL, activeLane, buildActivity, matchesSearch, projectFile, ticketHasFlag, type Lane, type NavId } from "../app/model";
import { Btn, Card, Cell, DataRow, EmptyRow, Flag, IconButton, Pin, SectionHead, cx } from "./primitives";

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

export function CockpitContent({
  nav,
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
  onOnboardRepo,
  onToggleLinkHandoff,
  onDeleteContextRow,
  selectedContextKey,
  onSelectContext,
}: {
  nav: NavId;
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
  onOnboardRepo: () => void;
  onToggleLinkHandoff: (link: LinkRecord, included: boolean) => void;
  onDeleteContextRow: (row: ContextRow) => void;
  selectedContextKey: string | null;
  onSelectContext: (row: ContextRow) => void;
}) {
  if (nav === "tickets") {
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
          title="Tickets"
          lanesToShow={[...LANES_IN_QUEUE, "done"]}
        />
      </>
    );
  }

  if (nav === "memory") {
    return (
      <MemoryView
        project={project}
        search={search}
        onSelectNote={onSelectNote}
        onSelectThread={onSelectThread}
      />
    );
  }

  if (nav === "context") {
    return (
      <ContextView
        project={project}
        search={search}
        onAddFile={onAddFile}
        onAddLink={onAddLink}
        onOnboardRepo={onOnboardRepo}
        onToggleLinkHandoff={onToggleLinkHandoff}
        onDeleteContextRow={onDeleteContextRow}
        selectedContextKey={selectedContextKey}
        onSelectContext={onSelectContext}
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
        title="Now / Next"
        lanesToShow={["now", "next"]}
        empty="No Now or Next tickets match."
        onViewAll={() => onNav("tickets")}
      />
      <WarningsPanel project={project} workspace={workspace} search={search} gapsOnly={gapsOnly} />
      <ContextPreview project={project} search={search} onViewAll={() => onNav("context")} />
      <Decisions decisions={project.decisions} search={search} limit={6} onSelect={onSelectNote} />
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
  title = "Tickets",
  lanesToShow = [...LANES_IN_QUEUE, "done"],
  empty = "No tickets match.",
  onViewAll,
}: {
  project: WaymarkProject;
  selectedKey: string | null;
  onSelect: (ticket: Ticket) => void;
  multi: string[];
  toggleMulti: (id: string) => void;
  search: string;
  gapsOnly: boolean;
  title?: string;
  lanesToShow?: Lane[];
  empty?: string;
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
    return lanesToShow.map((lane) => ({
      lane,
      items: matching.filter((ticket) => ticket.status === lane),
    })).filter((group) => group.items.length > 0);
  }, [project, search, gapsOnly, lanesToShow]);

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
        {title} <span className="font-mono text-[10px] text-ink-mute font-normal tracking-normal normal-case">{activeCount} active</span>
      </SectionHead>
      <Card>
        {lanes.length === 0 ? (
          <EmptyRow>{empty}</EmptyRow>
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

/* ------------------------------- memory -------------------------------- */

type MemoryFilter = "all" | "ideas" | "decisions" | "threads";

function MemoryView({
  project,
  search,
  onSelectNote,
  onSelectThread,
}: {
  project: WaymarkProject;
  search: string;
  onSelectNote: (note: NoteRecord) => void;
  onSelectThread: (thread: ThreadRecord) => void;
}) {
  const [filter, setFilter] = useState<MemoryFilter>("all");
  const rows = [
    ...project.decisions.map((note) => ({
      kind: "decision" as const,
      id: note.id,
      title: note.title,
      meta: note.status ?? "accepted",
      date: note.date ?? "—",
      value: note.body,
      onClick: () => onSelectNote(note),
    })),
    ...project.ideas.map((note) => ({
      kind: "idea" as const,
      id: note.id,
      title: note.title,
      meta: note.status ?? "open",
      date: note.date ?? "—",
      value: note.body,
      onClick: () => onSelectNote(note),
    })),
    ...project.threads.map((thread) => ({
      kind: "thread" as const,
      id: thread.id,
      title: thread.title,
      meta: `${thread.provider} · ${thread.status}`,
      date: thread.summary_file ?? "—",
      value: thread.url ?? thread.summary_file ?? "",
      onClick: () => onSelectThread(thread),
    })),
  ]
    .filter((row) => filter === "all" || `${row.kind}s` === filter)
    .filter((row) => matchesSearch([row.kind, row.id, row.title, row.meta, row.date, row.value], search));

  const counts = {
    all: project.decisions.length + project.ideas.length + project.threads.length,
    ideas: project.ideas.length,
    decisions: project.decisions.length,
    threads: project.threads.length,
  };

  return (
    <div className="mb-[22px]">
      <SectionHead
        more={
          <div className="inline-flex items-center gap-1 rounded-[4px] border border-line-soft bg-surface-2 p-0.5">
            {(["all", "ideas", "decisions", "threads"] as MemoryFilter[]).map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={cx(
                  "h-6 px-2 rounded-[3px] text-[11px] capitalize",
                  filter === item ? "bg-surface-4 text-ink" : "text-ink-faint hover:text-ink",
                )}
              >
                {item} <span className="font-mono text-[10px] text-ink-mute">{counts[item]}</span>
              </button>
            ))}
          </div>
        }
      >
        Memory <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{rows.length}</span>
      </SectionHead>
      <Card>
        {rows.length === 0 ? (
          <EmptyRow>{search ? "No memory records match." : "No memory records yet."}</EmptyRow>
        ) : (
          rows.map((row) => (
            <DataRow
              key={`${row.kind}-${row.id}`}
              cols="grid-cols-decision-narrow xl:grid-cols-decision"
              height={32}
              paddingX={14}
              gap={12}
              onClick={row.onClick}
              ariaLabel={`Open ${row.kind} ${row.title}`}
            >
              <Cell mono size={9.5} tone="mute" className="uppercase tracking-[0.07em]">{row.kind}</Cell>
              <Cell tone="ink">{row.title}</Cell>
              <div className="justify-self-start min-w-0 max-w-full font-mono text-[10px] text-ink-faint bg-surface-row-selected border border-line px-1.5 py-px rounded-[3px] truncate">
                {row.meta}
              </div>
              <Cell mono size={10.5} tone="mute">{row.date}</Cell>
              <Cell mono size={10.5} tone="mute" align="end" title={row.id} className="hidden xl:block">
                {row.id}
              </Cell>
            </DataRow>
          ))
        )}
      </Card>
    </div>
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

const CONTEXT_KIND_META: Record<LinkRecord["type"] | "ticket file", { label: string; Icon: LucideIcon }> = {
  repo: { label: "Repository", Icon: GitBranch },
  file: { label: "File", Icon: FileText },
  deploy: { label: "Deploy", Icon: Rocket },
  dashboard: { label: "Dashboard", Icon: Gauge },
  doc: { label: "Documentation", Icon: BookOpen },
  design: { label: "Design", Icon: Palette },
  service: { label: "Service", Icon: Server },
  domain: { label: "Domain", Icon: Globe2 },
  other: { label: "Other context", Icon: Box },
  "ticket file": { label: "Ticket file", Icon: FileCheck2 },
};

function contextKindMeta(kind: string) {
  return CONTEXT_KIND_META[kind as keyof typeof CONTEXT_KIND_META] ?? { label: kind, Icon: Box };
}

function ContextKindIcon({ kind }: { kind: string }) {
  const meta = contextKindMeta(kind);
  const Icon = meta.Icon;
  return (
    <div
      aria-label={meta.label}
      data-tooltip={meta.label}
      className="tooltip-target grid h-[22px] w-[22px] place-items-center rounded-[4px] border border-line-soft bg-surface-row-selected text-ink-faint"
    >
      <Icon size={12.5} aria-hidden="true" />
    </div>
  );
}

function HandoffEligibilityBadge({
  included,
  editable,
  onToggle,
}: {
  included?: boolean;
  editable?: boolean;
  onToggle?: () => void;
}) {
  const enabled = Boolean(included);
  const Icon = enabled ? Send : HardDrive;
  const label = enabled ? "Included in generated handoff prompts" : "Excluded from generated handoff prompts";
  const tooltip = editable
    ? `${label}. Click to switch to ${enabled ? "local only" : "prompt"}.`
    : `${label}; managed from its source file.`;
  const className = cx(
    "tooltip-target inline-flex min-w-[64px] items-center justify-center gap-1 font-mono text-[9.5px] px-1.5 py-px rounded-[3px] border",
    enabled
      ? "text-lane-done border-[oklch(0.74_0.13_150_/_0.28)] bg-[oklch(0.74_0.13_150_/_0.10)]"
      : "text-ink-mute border-line-soft bg-surface-2",
    editable && "hover:bg-surface-3 hover:text-ink cursor-pointer",
  );

  const children = (
    <>
      <Icon size={9.5} aria-hidden="true" />
      {enabled ? "prompt" : "local"}
    </>
  );

  if (editable) {
    return (
      <button
        type="button"
        aria-label={tooltip}
        aria-pressed={enabled}
        data-tooltip={tooltip}
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          onToggle?.();
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <span
      aria-label={label}
      data-tooltip={tooltip}
      className={className}
    >
      {children}
    </span>
  );
}

function ContextActionSpacer() {
  return <span className="h-[22px] w-[22px]" aria-hidden="true" />;
}

function ContextView({
  project,
  search,
  onAddFile,
  onAddLink,
  onOnboardRepo,
  onToggleLinkHandoff,
  onDeleteContextRow,
  selectedContextKey,
  onSelectContext,
}: {
  project: WaymarkProject;
  search: string;
  onAddFile: () => void;
  onAddLink: () => void;
  onOnboardRepo: () => void;
  onToggleLinkHandoff: (link: LinkRecord, included: boolean) => void;
  onDeleteContextRow: (row: ContextRow) => void;
  selectedContextKey: string | null;
  onSelectContext: (row: ContextRow) => void;
}) {
  const rows = contextRows(project).filter((row) => matchesSearch([row.kind, row.id, row.label, row.value], search));
  const promptCount = rows.filter((row) => row.includeInHandoff).length;
  const localCount = rows.length - promptCount;

  return (
    <div className="mb-[22px]">
      <SectionHead
        more={
          <div className="flex flex-wrap items-center justify-end gap-1 min-w-0 max-w-full">
            <Btn variant="ghost" onClick={onAddFile}>
              <Plus size={11} /> File
            </Btn>
            <Btn variant="ghost" onClick={onAddLink}>
              <Plus size={11} /> Link
            </Btn>
            <Btn variant="primary" onClick={onOnboardRepo}>
              <Plus size={11} /> Onboard repo
            </Btn>
          </div>
        }
      >
        Context <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{rows.length} · {promptCount} prompt · {localCount} local</span>
      </SectionHead>
      <Card>
        {rows.length === 0 ? (
          <EmptyRow>{search ? "No context matches." : "No project context yet."}</EmptyRow>
        ) : (
          rows.map((row) => (
            <DataRow
              key={contextRowKey(row)}
              cols="grid-cols-context"
              height={32}
              paddingX={12}
              gap={10}
              selected={selectedContextKey === contextRowKey(row)}
              onClick={() => onSelectContext(row)}
              ariaLabel={`Select ${row.kind} ${row.label}`}
            >
              <ContextKindIcon kind={row.kind} />
              <Cell mono size={11} tone="faint">{row.id}</Cell>
              <div className="min-w-0">
                <div className="tooltip-target truncate text-[12px] text-ink-soft" data-tooltip={row.label}>{row.label}</div>
                <div className="tooltip-target truncate font-mono text-[10.5px] text-ink-mute" data-tooltip={row.value}>{row.value}</div>
              </div>
              <div className="grid grid-cols-[64px_22px_22px_22px] items-center gap-1 justify-end shrink-0">
                <HandoffEligibilityBadge
                  included={row.includeInHandoff}
                  editable={Boolean(row.link)}
                  onToggle={row.link ? () => onToggleLinkHandoff(row.link as LinkRecord, Boolean(row.includeInHandoff)) : undefined}
                />
                <IconButton
                  label="Copy context value"
                  tooltip="Copy path or URL"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigator.clipboard?.writeText(row.value).catch(() => undefined);
                  }}
                >
                  <Copy size={10} />
                </IconButton>
                {row.actionPath ? (
                  <IconButton
                    label="Open context target"
                    tooltip="Open path or URL"
                    onClick={(event) => {
                      event.stopPropagation();
                      openPath(row.actionPath as string);
                    }}
                  >
                    <ArrowRight size={10} />
                  </IconButton>
                ) : <ContextActionSpacer />}
                {row.link || row.repo || row.ticket ? (
                  <IconButton
                    label={contextRowRemoveLabel(row)}
                    tooltip={contextRowRemoveLabel(row)}
                    className="text-danger hover:bg-[oklch(0.70_0.16_25_/_0.12)] hover:text-danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (window.confirm(contextRowRemoveConfirmation(row))) {
                        onDeleteContextRow(row);
                      }
                    }}
                  >
                    <Trash2 size={10} />
                  </IconButton>
                ) : <ContextActionSpacer />}
              </div>
            </DataRow>
          ))
        )}
      </Card>
    </div>
  );
}

function ContextPreview({
  project,
  search,
  onViewAll,
}: {
  project: WaymarkProject;
  search: string;
  onViewAll: () => void;
}) {
  const rows = contextRows(project)
    .filter((row) => matchesSearch([row.kind, row.id, row.label, row.value], search))
    .slice(0, 6);

  return (
    <div className="mb-[22px]">
      <SectionHead
        more={
          <button
            onClick={onViewAll}
            className="text-[11px] text-ink-mute inline-flex items-center gap-1 hover:text-ink-soft cursor-pointer"
          >
            Open Context <ArrowRight size={11} />
          </button>
        }
      >
        Key Context <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{contextRows(project).length}</span>
      </SectionHead>
      <Card>
        {rows.length === 0 ? (
          <EmptyRow>No context yet.</EmptyRow>
        ) : (
          rows.map((row) => (
            <DataRow
              key={`${row.kind}-${row.id}-${row.value}`}
              cols="grid-cols-context"
              height={28}
              paddingX={12}
              gap={10}
              onClick={row.actionPath ? () => openPath(row.actionPath as string) : undefined}
              ariaLabel={`Open ${row.kind} ${row.label}`}
            >
              <ContextKindIcon kind={row.kind} />
              <Cell mono size={10.5} tone="faint">{row.id}</Cell>
              <div className="tooltip-target min-w-0 truncate text-[12px] leading-tight text-ink-soft" data-tooltip={row.label}>{row.label}</div>
              <div className="tooltip-target min-w-0 truncate text-right font-mono text-[10.5px] leading-tight text-ink-mute" data-tooltip={row.value}>{row.value}</div>
            </DataRow>
          ))
        )}
      </Card>
    </div>
  );
}

function WarningsPanel({
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
        Warnings <span className="font-mono text-[10px] text-ink-mute font-normal normal-case tracking-normal">{rows.length}</span>
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
