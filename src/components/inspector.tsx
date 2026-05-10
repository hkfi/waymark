import { AlertTriangle, ArrowRight, Check, CheckSquare, Copy, FileText, HardDrive, Link2, ListOrdered, MessageSquareText, Send, Sparkles, Square, Trash2, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { contextRowRemoveConfirmation, contextRowRemoveLabel, type ContextRow } from "../contextRows";
import { openPath } from "../tauri";
import type { LinkRecord, NoteRecord, ThreadRecord, Ticket, TicketStatus, WaymarkProject, WorkspaceData } from "../types";
import { buildPrompt, type HandoffContextOption } from "../workspace";
import { activeLane, projectFile, resolveProjectPath, tokenEstimate, type InspectorMode } from "../app/model";
import { buildNoteRecommendationPrompt, buildTicketRecommendationPrompt, type AssistantLaunchInput, type AssistantLaunchRequest } from "../assistant";
import type { RecordTransaction } from "../app/hooks/useUndoRedoState";
import { AssistantView } from "./assistant";
import { MarkdownBlock } from "./markdown";
import { Btn, Card, Cell, CommandShortcutBadge, DataRow, EmptyRow, StatusChip, cx } from "./primitives";

export function Inspector({
  scope,
  mode,
  onMode,
  project,
  ticket,
  thread,
  note,
  contextRow,
  multi,
  workspace,
  onSendHandoff,
  handoffOptions,
  selectedHandoffContextIds,
  onToggleHandoffContext,
  onStatus,
  onEditTicket,
  onDeleteTicket,
  onDeletePromptReference,
  onDeleteContextRow,
  onDeleteThread,
  onDeleteNote,
  onToggleContextHandoff,
  onSaved,
  assistantLaunchRequest,
  onAssistantLaunchConsumed,
  onAskAssistant,
  recordTransaction,
}: {
  scope: "tickets" | "memory" | "context";
  mode: InspectorMode;
  onMode: (value: InspectorMode) => void;
  project: WaymarkProject | null;
  ticket: Ticket | null;
  thread: ThreadRecord | null;
  note: NoteRecord | null;
  contextRow: ContextRow | null;
  multi: string[];
  workspace: WorkspaceData | null;
  onSendHandoff: () => void;
  handoffOptions: HandoffContextOption[];
  selectedHandoffContextIds: string[];
  onToggleHandoffContext: (id: string) => void;
  onStatus: (ticket: Ticket, status: TicketStatus) => void;
  onEditTicket: (ticket: Ticket) => void;
  onDeleteTicket: (ticket: Ticket) => void;
  onDeletePromptReference: (ticket: Ticket, promptPath: string) => void;
  onDeleteContextRow: (row: ContextRow) => void;
  onDeleteThread: (thread: ThreadRecord) => void;
  onDeleteNote: (note: NoteRecord) => void;
  onToggleContextHandoff: (link: LinkRecord, included: boolean) => void;
  onSaved: () => Promise<void>;
  assistantLaunchRequest?: AssistantLaunchRequest | null;
  onAssistantLaunchConsumed: () => void;
  onAskAssistant: (request: AssistantLaunchInput) => void;
  recordTransaction: RecordTransaction;
}) {
  const bundleSize = multi.length;

  return (
    <aside className="inspector-shell bg-surface-rail-2 border-l border-line flex flex-col min-h-0 min-w-0 overflow-hidden">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-line shrink-0 min-w-0 overflow-x-auto scrollbar-none">
        {scope === "context" ? (
          <>
            <InspectorTab active={mode === "context"} onClick={() => onMode("context")} icon={Link2}>
              Context
            </InspectorTab>
            <InspectorTab active={mode === "assistant"} onClick={() => onMode("assistant")} icon={Sparkles} tone="ai">
              AI
            </InspectorTab>
          </>
        ) : scope === "memory" ? (
          <>
            <InspectorTab active={mode === "note"} onClick={() => onMode("note")} icon={ListOrdered}>
              Note
            </InspectorTab>
            <InspectorTab active={mode === "thread"} onClick={() => onMode("thread")} icon={MessageSquareText}>
              Ref
            </InspectorTab>
            <InspectorTab active={mode === "assistant"} onClick={() => onMode("assistant")} icon={Sparkles} tone="ai">
              AI
            </InspectorTab>
          </>
        ) : (
          <>
            <InspectorTab active={mode === "ticket"} onClick={() => onMode("ticket")} icon={FileText}>
              Ticket
            </InspectorTab>
            <InspectorTab active={mode === "prompt"} onClick={() => onMode("prompt")} icon={Sparkles}>
              Prompt
              {bundleSize > 0 ? (
                <span className="font-mono text-[9.5px] px-1 rounded-[3px] bg-accent text-accent-ink leading-[14px]">{bundleSize}</span>
              ) : null}
            </InspectorTab>
            <InspectorTab active={mode === "assistant"} onClick={() => onMode("assistant")} icon={Sparkles} tone="ai">
              AI
            </InspectorTab>
            <InspectorTab active={mode === "thread"} onClick={() => onMode("thread")} icon={MessageSquareText}>
              Ref
            </InspectorTab>
            <InspectorTab active={mode === "note"} onClick={() => onMode("note")} icon={ListOrdered}>
              Note
            </InspectorTab>
          </>
        )}
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
            onDelete={onDeleteTicket}
            onDeletePromptReference={onDeletePromptReference}
            onAskAssistant={onAskAssistant}
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
          handoffOptions={handoffOptions}
          selectedHandoffContextIds={selectedHandoffContextIds}
          onToggleHandoffContext={onToggleHandoffContext}
        />
      ) : mode === "assistant" ? (
        <div className="flex-1 min-h-0 overflow-hidden px-3 py-3">
          <AssistantView
            project={project}
            selection={{ ticket, thread, note, bundle: multi }}
            launchRequest={assistantLaunchRequest}
            onLaunchConsumed={onAssistantLaunchConsumed}
            onSaved={onSaved}
            recordTransaction={recordTransaction}
          />
        </div>
      ) : mode === "thread" ? (
        <InspectorThread project={project} ticket={ticket} selectedThread={thread} onDelete={onDeleteThread} />
      ) : mode === "context" ? (
        <InspectorContext
          row={contextRow}
          onToggleHandoff={onToggleContextHandoff}
          onDeleteRow={onDeleteContextRow}
        />
      ) : (
        <InspectorNote note={note} onAskAssistant={onAskAssistant} onDelete={onDeleteNote} />
      )}
    </aside>
  );
}

function InspectorTab({
  active,
  onClick,
  icon: Icon,
  tone = "default",
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  tone?: "default" | "ai";
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1 h-[26px] px-1.5 rounded-[3px] text-[11.5px] whitespace-nowrap shrink-0 cursor-pointer",
        active
          ? tone === "ai"
            ? "bg-ai-soft text-ai-fg"
            : "bg-surface-4 text-ink"
          : tone === "ai"
            ? "text-ai-fg hover:bg-ai-soft hover:text-ink"
            : "text-ink-faint hover:bg-surface-3 hover:text-ink",
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

function InspectorContext({
  row,
  onToggleHandoff,
  onDeleteRow,
}: {
  row: ContextRow | null;
  onToggleHandoff: (link: LinkRecord, included: boolean) => void;
  onDeleteRow: (row: ContextRow) => void;
}) {
  if (!row) {
    return <InspectorEmpty>Select a context item to inspect.</InspectorEmpty>;
  }

  const included = Boolean(row.includeInHandoff);
  const sourceLabel = {
    project: "Project repo reference",
    link: "Context registry item",
    ticket: "Ticket-linked file",
  }[row.source];
  const sourceFile = {
    project: "project.yaml",
    link: "links.yaml",
    ticket: "tickets.yaml",
  }[row.source];

  return (
    <>
      <InspectorBody>
        <InspectorHead
          eyebrow={
            <>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-mute">{row.kind}</span>
              <ContextPromptPill included={included} />
            </>
          }
          title={row.label}
          meta={<div className="font-mono text-[10.5px] text-ink-mute break-all">{row.id}</div>}
        />

        <InspectorSection label="Target">
          <div className="rounded-[5px] border border-line-soft bg-surface-input-2 px-2.5 py-2 font-mono text-[11px] leading-[1.45] text-ink-soft break-all">
            {row.value || "No path or URL."}
          </div>
        </InspectorSection>

        <InspectorSection label="Source">
          <div className="text-[12px] leading-[1.5] text-ink-faint">
            {sourceLabel} from <code>{sourceFile}</code>
            {row.source === "link"
              ? ". This row can be toggled or removed here."
              : row.source === "project"
                ? ". Removing it only updates the repo reference in Waymark."
                : ". Unlinking it only updates the selected ticket."}
          </div>
        </InspectorSection>
      </InspectorBody>

      <InspectorActions>
        <Btn
          variant="ghost"
          onClick={() => navigator.clipboard?.writeText(row.value).catch(() => undefined)}
          disabled={!row.value}
        >
          <Copy size={11} /> Copy
        </Btn>
        {row.actionPath ? (
          <Btn variant="ghost" onClick={() => openPath(row.actionPath as string)}>
            <ArrowRight size={11} /> Open
          </Btn>
        ) : null}
        {row.link ? (
          <Btn variant="ghost" onClick={() => onToggleHandoff(row.link as LinkRecord, included)}>
            {included ? <HardDrive size={11} /> : <Send size={11} />}
            {included ? "Make local" : "Include in prompt"}
          </Btn>
        ) : null}
        {row.link || row.repo || row.ticket ? (
          <Btn
            variant="danger"
            onClick={() => {
              if (window.confirm(contextRowRemoveConfirmation(row))) {
                onDeleteRow(row);
              }
            }}
          >
            <Trash2 size={11} /> {contextRowRemoveLabel(row)}
          </Btn>
        ) : null}
      </InspectorActions>
    </>
  );
}

function ContextPromptPill({ included }: { included: boolean }) {
  const Icon = included ? Send : HardDrive;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-px font-mono text-[9.5px]",
        included
          ? "text-lane-done border-[oklch(0.74_0.13_150_/_0.28)] bg-[oklch(0.74_0.13_150_/_0.10)]"
          : "text-ink-mute border-line-soft bg-surface-2",
      )}
    >
      <Icon size={9.5} />
      {included ? "prompt" : "local"}
    </span>
  );
}

function InspectorBody({
  children,
  scroll = true,
  className,
}: {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
}) {
  return (
    <div className={cx(
      "flex-1 min-h-0 px-4 pt-3.5 pb-[18px]",
      scroll ? "overflow-y-auto" : "overflow-hidden",
      className,
    )}>
      {children}
    </div>
  );
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
  action,
  className,
  children,
}: {
  label: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("mb-3.5", className)}>
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.10em] text-ink-mute font-semibold whitespace-nowrap">
          {label}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ContextualAssistantButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="ai-action-button"
    >
      <Sparkles size={10} />
      {label}
    </button>
  );
}

function InspectorTicket({
  project,
  ticket,
  onStatus,
  onSendHandoff,
  onEdit,
  onDelete,
  onDeletePromptReference,
  onAskAssistant,
}: {
  project: WaymarkProject;
  ticket: Ticket;
  onStatus: (ticket: Ticket, status: TicketStatus) => void;
  onSendHandoff: () => void;
  onEdit: (ticket: Ticket) => void;
  onDelete: (ticket: Ticket) => void;
  onDeletePromptReference: (ticket: Ticket, promptPath: string) => void;
  onAskAssistant: (request: AssistantLaunchInput) => void;
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

        <InspectorSection
          label="Summary"
          action={
            <ContextualAssistantButton
              label="Improve summary"
              title="Prepare a Codex prompt for improving this ticket summary"
              onClick={() => onAskAssistant({
                mode: "structure",
                prompt: buildTicketRecommendationPrompt(ticket, "summary"),
                notice: "Prepared a summary-improvement prompt.",
                actionLabel: "Improve summary",
                explanation: "Review the prepared prompt, then press the rainbow Codex button to get editable drafts.",
              })}
            />
          }
        >
          {ticket.summary ? (
            <MarkdownBlock value={ticket.summary} label="summary.md" compact />
          ) : (
            <div className="text-[12.5px] text-ink-mute leading-[1.55]">
              No summary written yet. Add one to this ticket in <code>tickets.yaml</code>.
            </div>
          )}
        </InspectorSection>

        <InspectorSection
          label="Acceptance criteria"
          action={
            <ContextualAssistantButton
              label="Draft checks"
              title="Prepare a Codex prompt for drafting acceptance criteria"
              onClick={() => onAskAssistant({
                mode: "structure",
                prompt: buildTicketRecommendationPrompt(ticket, "acceptance"),
                notice: "Prepared an acceptance-check prompt.",
                actionLabel: "Draft checks",
                explanation: "Review the prepared prompt, then press the rainbow Codex button to get editable drafts.",
              })}
            />
          }
        >
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

        {(ticket.generated_prompts ?? []).length > 0 ? (
          <InspectorSection label="Generated prompts">
            <Card>
              {(ticket.generated_prompts ?? []).map((promptPath) => (
                <DataRow key={promptPath} cols="grid-cols-link" height={30} paddingX={10} gap={8}>
                  <Cell mono size={9.5} tone="mute" className="uppercase tracking-[0.07em]">prompt</Cell>
                  <Cell mono size={11} tone="faint">md</Cell>
                  <Cell tone="soft" title={promptPath}>{promptPath}</Cell>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openPath(resolveProjectPath(project, promptPath))}
                      title="Open prompt"
                      className="inline-flex items-center gap-1 px-1 py-0.5 text-ink-faint rounded-[3px] text-[11px] hover:bg-surface-3 hover:text-ink cursor-pointer"
                    >
                      <ArrowRight size={10} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove generated prompt reference "${promptPath}" from this ticket? The prompt Markdown file is not deleted.`)) {
                          onDeletePromptReference(ticket, promptPath);
                        }
                      }}
                      title="Remove prompt reference"
                      className="inline-flex items-center gap-1 px-1 py-0.5 text-danger rounded-[3px] text-[11px] hover:bg-[oklch(0.70_0.16_25_/_0.12)] cursor-pointer"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </DataRow>
              ))}
            </Card>
          </InspectorSection>
        ) : null}
      </InspectorBody>

      <InspectorActions>
        <Btn onClick={() => onEdit(ticket)}>
          <FileText size={11} /> Edit
        </Btn>
        <Btn variant="ai" onClick={() => onAskAssistant({
          mode: "structure",
          prompt: buildTicketRecommendationPrompt(ticket, "next-steps"),
          notice: "Prepared a next-steps prompt.",
          actionLabel: "Suggest next steps",
          explanation: "Review the prepared prompt, then press the rainbow Codex button to get editable drafts.",
        })}>
          <Sparkles size={11} /> Suggest next steps
        </Btn>
        <Btn variant="primary" onClick={onSendHandoff}>
          <Sparkles size={11} /> Send to agent
        </Btn>
        {lane !== "next" ? <Btn variant="ghost" onClick={() => onStatus(ticket, "next")}>Mark next</Btn> : null}
        {lane !== "blocked" ? <Btn variant="ghost" onClick={() => onStatus(ticket, "blocked")}>Block</Btn> : null}
        {lane !== "done" ? <Btn variant="ghost" onClick={() => onStatus(ticket, "done")}>Mark done</Btn> : null}
        <Btn
          variant="danger"
          data-testid="delete-ticket-button"
          onClick={() => {
            if (window.confirm(`Delete ticket "${ticket.title}"? This removes it from tickets.yaml. Linked notes, prompts, and thread summaries are not deleted.`)) {
              onDelete(ticket);
            }
          }}
        >
          <Trash2 size={11} /> Delete
        </Btn>
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
  handoffOptions,
  selectedHandoffContextIds,
  onToggleHandoffContext,
}: {
  project: WaymarkProject;
  ticket: Ticket | null;
  multi: string[];
  workspace: WorkspaceData;
  onSendHandoff: () => void;
  handoffOptions: HandoffContextOption[];
  selectedHandoffContextIds: string[];
  onToggleHandoffContext: (id: string) => void;
}) {
  const tickets = project.tickets.filter((candidate) =>
    multi.length ? multi.includes(candidate.id) : ticket && candidate.id === ticket.id,
  );

  if (tickets.length === 0) {
    return <InspectorEmpty>Select a ticket to preview the handoff.</InspectorEmpty>;
  }

  const prompt = tickets
    .map((entry) => buildPrompt(project, entry, selectedHandoffContextIds))
    .join("\n\n---\n\n");
  const tokens = tokenEstimate(prompt);
  const selectedContext = new Set(selectedHandoffContextIds);
  const includedCount = handoffOptions.filter((option) => selectedContext.has(option.id)).length;

  return (
    <>
      <InspectorBody scroll={false} className="grid grid-rows-[auto_minmax(96px,0.85fr)_minmax(170px,1.15fr)_auto] gap-3 pb-3">
        <InspectorHead
          eyebrow={<span className="text-[10.5px] text-ink-faint tracking-[0.08em] uppercase">Handoff prompt</span>}
          title={tickets.length > 1 ? `Bundle · ${tickets.length} tickets` : "Single ticket"}
          meta={
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-ink-mute whitespace-nowrap overflow-hidden flex-wrap">
              <span>● local prompt</span>
              <span>·</span>
              <span>~{tokens.toLocaleString()} tokens</span>
              <span>·</span>
              <span>{includedCount}/{handoffOptions.length} context</span>
              <span>·</span>
              <span>cwd: <code>{workspace.rootPath}</code></span>
            </div>
          }
        />

        <InspectorSection label="Suggested context" className="mb-0 flex min-h-0 flex-col">
          <Card className="min-h-0 flex-1 overflow-y-auto">
            {handoffOptions.map((option) => {
              const included = selectedContext.has(option.id);
              const ToggleIcon = included ? CheckSquare : Square;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={included}
                  onClick={() => onToggleHandoffContext(option.id)}
                  className={cx(
                    "w-full min-w-0 grid grid-cols-[18px_minmax(0,1fr)] gap-2 px-2.5 py-2 text-left border-b border-line-soft last:border-b-0 hover:bg-surface-3",
                    included ? "text-ink-soft" : "text-ink-mute",
                  )}
                >
                  <span className="pt-0.5 text-accent">
                    <ToggleIcon size={13} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.07em] text-ink-mute shrink-0">
                        {option.kind}
                      </span>
                      <span className="text-[12px] leading-[1.25] truncate text-ink-soft" title={option.label}>
                        {option.label}
                      </span>
                    </span>
                    <span className="block mt-0.5 font-mono text-[10.5px] leading-[1.35] text-ink-mute truncate" title={option.detail}>
                      {option.detail}
                    </span>
                    <span className="block mt-1 text-[11.5px] leading-[1.35] text-ink-faint">
                      {option.reason}
                    </span>
                  </span>
                </button>
              );
            })}
          </Card>
        </InspectorSection>

        <InspectorSection label={<></>} className="mb-0 flex min-h-0 flex-col">
          <MarkdownBlock
            value={prompt}
            label="prompt.md"
            className="min-h-0 flex-1"
            contentClassName="min-h-0 flex-1 overflow-y-auto"
            sourceClassName="text-[11px]"
            actions={
              <CopyPromptButton
                prompt={prompt}
                className="inline-flex items-center gap-1 px-1 py-0.5 text-ink-faint rounded-[3px] text-[11px] hover:bg-surface-3 hover:text-ink cursor-pointer"
              />
            }
          />
        </InspectorSection>

        <InspectorSection label="Order" className="mb-0">
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
          <Sparkles size={11} /> Save & copy <CommandShortcutBadge value="↵" tone="primary" />
        </Btn>
        <CopyPromptButton prompt={prompt} footer />
      </InspectorActions>
    </>
  );
}

function CopyPromptButton({
  prompt,
  footer = false,
  className,
}: {
  prompt: string;
  footer?: boolean;
  className?: string;
}) {
  const [copiedAt, setCopiedAt] = useState(0);
  const copied = copiedAt > 0;

  useEffect(() => {
    if (!copiedAt) return undefined;
    const timeout = window.setTimeout(() => setCopiedAt(0), 2200);
    return () => window.clearTimeout(timeout);
  }, [copiedAt]);

  async function copyPrompt() {
    if (await copyText(prompt)) {
      setCopiedAt(Date.now());
    } else {
      setCopiedAt(0);
    }
  }

  const content = (
    <>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copied" : footer ? "Copy prompt" : "Copy"}
    </>
  );

  if (footer) {
    return (
      <Btn onClick={copyPrompt} aria-live="polite">
        {content}
      </Btn>
    );
  }

  return (
    <button
      type="button"
      onClick={copyPrompt}
      aria-live="polite"
      className={className}
    >
      {content}
    </button>
  );
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall back for local previews where Clipboard API permissions are not granted.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return true;
  } finally {
    document.body.removeChild(textarea);
  }
}

function InspectorThread({
  project,
  ticket,
  selectedThread,
  onDelete,
}: {
  project: WaymarkProject;
  ticket: Ticket | null;
  selectedThread: ThreadRecord | null;
  onDelete: (thread: ThreadRecord) => void;
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
        <Btn
          variant="danger"
          onClick={() => {
            if (window.confirm(`Delete thread reference "${thread.title}"? This removes it from threads.yaml and unlinks it from tickets. The summary file is not deleted.`)) {
              onDelete(thread);
            }
          }}
        >
          <Trash2 size={11} /> Delete reference
        </Btn>
      </InspectorActions>
    </>
  );
}

function InspectorNote({
  note,
  onAskAssistant,
  onDelete,
}: {
  note: NoteRecord | null;
  onAskAssistant: (request: AssistantLaunchInput) => void;
  onDelete: (note: NoteRecord) => void;
}) {
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
        <InspectorSection
          label="Body"
          action={
            <ContextualAssistantButton
              label="Turn into records"
              title={`Prepare a Codex prompt to turn this ${note.type} into structured project memory`}
              onClick={() => onAskAssistant({
                mode: "structure",
                prompt: buildNoteRecommendationPrompt(note),
                notice: `Prepared a prompt to turn this ${note.type} into records.`,
                actionLabel: "Turn into records",
                explanation: "Review the prepared prompt, then press the rainbow Codex button to get editable drafts.",
              })}
            />
          }
        >
          <MarkdownBlock value={note.body} label={`${note.type}.md`} empty="No body." />
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
        <Btn variant="ai" onClick={() => onAskAssistant({
          mode: "structure",
          prompt: buildNoteRecommendationPrompt(note),
          notice: `Prepared a prompt to turn this ${note.type} into records.`,
          actionLabel: "Turn into records",
          explanation: "Review the prepared prompt, then press the rainbow Codex button to get editable drafts.",
        })}>
          <Sparkles size={11} /> Turn into records
        </Btn>
        <Btn onClick={() => navigator.clipboard?.writeText(note.path).catch(() => undefined)}>
          <Copy size={11} /> Copy path
        </Btn>
        <Btn variant="ghost" onClick={() => openPath(note.path)}>
          <ArrowRight size={11} /> Open file
        </Btn>
        <Btn
          variant="danger"
          onClick={() => {
            const cleanup = note.type === "decision"
              ? " This also unlinks the decision from tickets. Linked tickets are not deleted."
              : " Linked tickets are not deleted.";
            if (window.confirm(`Delete ${note.type} "${note.title}"? This removes the Markdown file.${cleanup}`)) {
              onDelete(note);
            }
          }}
        >
          <Trash2 size={11} /> Delete {note.type}
        </Btn>
      </InspectorActions>
    </>
  );
}
