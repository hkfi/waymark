import { AlertTriangle, Bot, Check, CheckSquare, FileInput, Loader2, LogIn, Plus, Send, Sparkles, Square, WandSparkles } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  WAYMARK_DRAFT_JSON_SCHEMA,
  buildAssistantPrompt,
  emptyDraftSet,
  normalizeNoteDraft,
  normalizeThreadDraft,
  normalizeTicketDraft,
  parseDraftSet,
} from "../assistant";
import { codexAppSessionStart, codexAppSessionStop, codexAppTurnSend, codexLogin, codexRunStructured, codexStatus, isTauri } from "../tauri";
import type { CodexRoute, CodexStatus, DraftNote, DraftThread, DraftTicket, Ticket, WaymarkDraftSet, WaymarkProject } from "../types";
import { createNote, saveThreadSummary, saveThreads, saveTickets } from "../workspace";
import { lines, recordId } from "../app/model";
import { Btn, Card, Notice, cx } from "./primitives";

type AssistantMode = "brainstorm" | "structure" | "capture";
type AssistantMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  route: CodexRoute;
  streamSessionId?: string;
};
type CodexAssistantDelta = {
  session_id: string;
  route: string;
  delta: string;
};

export function AssistantView({
  project,
  onSaved,
}: {
  project: WaymarkProject;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState<CodexStatus>({ state: "unavailable", path: null, detail: "Not checked yet." });
  const [mode, setMode] = useState<AssistantMode>("brainstorm");
  const [route, setRoute] = useState<CodexRoute>("app-server");
  const [prompt, setPrompt] = useState("");
  const [pasted, setPasted] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [drafts, setDrafts] = useState<WaymarkDraftSet>(emptyDraftSet("codex"));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeStreamRef = useRef<string | null>(null);
  const appSessionRef = useRef<string | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    codexStatus().then(setStatus).catch((caught) => setStatus({ state: "errored", path: null, detail: String(caught) }));
    return () => {
      if (appSessionRef.current) void codexAppSessionStop(appSessionRef.current);
      appSessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<CodexAssistantDelta>("codex-assistant-delta", (event) => {
      const payload = event.payload;
      if (payload.session_id !== activeStreamRef.current) return;
      setMessages((current) => current.map((message) => (
        message.streamSessionId === payload.session_id
          ? { ...message, content: `${message.content}${payload.delta}` }
          : message
      )));
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const canSend = isTauri() && status.state === "ready" && ack && !busy;
  const draftCount = drafts.tickets.length + drafts.ideas.length + drafts.decisions.length + drafts.threads.length;
  const primaryDisabled = busy || (mode === "capture" ? !pasted.trim() : !canSend || !prompt.trim());
  const primaryLabel = mode === "brainstorm" ? "Send message" : mode === "structure" ? "Generate drafts" : "Import drafts";
  const primaryIcon = mode === "structure" ? <WandSparkles size={11} /> : mode === "capture" ? <FileInput size={11} /> : <Send size={11} />;

  async function runAssistant(nextMode: AssistantMode) {
    setError(null);
    setNotice(null);
    if (nextMode !== "capture" && !canSend) return;
    const input = nextMode === "capture" ? pasted : prompt;
    if (!input.trim()) return;
    setBusy(true);
    setMode(nextMode);
    setMessages((current) => [...current, { role: "user", content: input.trim(), route }]);
    try {
      if (nextMode === "capture") {
        const parsed = parseDraftSet(input, "pasted", project);
        setDrafts(parsed);
        setSelected(defaultSelection(parsed));
        setMessages((current) => [...current, { role: "assistant", content: "Parsed pasted output into reviewable Waymark drafts.", route: "cli" }]);
      } else {
        const assistantPrompt = buildAssistantPrompt(project, input.trim(), nextMode);
        const request = {
          cwd: project.rootPath,
          prompt: assistantPrompt,
          schema: nextMode === "structure" ? WAYMARK_DRAFT_JSON_SCHEMA : undefined,
          timeoutMs: 180_000,
        };
        let streamSessionId: string | null = null;
        const result = route === "app-server"
          ? await (async () => {
              try {
                let sessionId = appSessionRef.current;
                if (!sessionId) {
                  const session = await codexAppSessionStart(project.rootPath);
                  sessionId = session.id;
                  appSessionRef.current = session.id;
                }
                streamSessionId = sessionId;
                activeStreamRef.current = sessionId;
                setMessages((current) => current.some((message) => message.streamSessionId === sessionId)
                  ? current
                  : [
                      ...current,
                      { role: "assistant", content: "", route: "app-server", streamSessionId: sessionId },
                    ]);
                return await codexAppTurnSend(sessionId, request);
              } catch (caught) {
                const failedSession = appSessionRef.current;
                if (failedSession) void codexAppSessionStop(failedSession);
                appSessionRef.current = null;
                activeStreamRef.current = null;
                setMessages((current) => [
                  ...current,
                  {
                    role: "system",
                    content: `Codex app-server failed; using CLI fallback. ${caught instanceof Error ? caught.message : String(caught)}`,
                    route: "app-server-fallback",
                  },
                ]);
                return codexRunStructured(request);
              }
            })()
          : await codexRunStructured(request);

        if (nextMode === "brainstorm") {
          setDrafts(emptyDraftSet("codex"));
          setSelected({});
          setMessages((current) => replaceStreamedMessage(current, streamSessionId, {
            role: "assistant",
            content: result.output,
            route: result.route as CodexRoute,
          }));
        } else {
          const parsed = parseDraftSet(result.output, "codex", project);
          setDrafts(parsed);
          setSelected(defaultSelection(parsed));
          setMessages((current) => replaceStreamedMessage(current, streamSessionId, {
            role: "assistant",
            content: parsed.summary || result.output,
            route: result.route as CodexRoute,
          }));
        }
      }
      setPrompt("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setMessages((current) => [...current, { role: "system", content: caught instanceof Error ? caught.message : String(caught), route: "unavailable" }]);
    } finally {
      activeStreamRef.current = null;
      setBusy(false);
    }
  }

  async function saveSelectedDrafts() {
    setBusy(true);
    setError(null);
    try {
      const tickets: Ticket[] = [
        ...project.tickets,
        ...drafts.tickets
          .filter((_, index) => selected[`ticket:${index}`])
          .map((draft) => {
            const normalized = normalizeTicketDraft(draft);
            return {
              id: recordId(normalized.title),
              title: normalized.title,
              status: normalized.status,
              priority: normalized.priority,
              summary: normalized.summary,
              acceptance_criteria: normalized.acceptance_criteria,
              linked_files: normalized.linked_files,
              linked_decisions: normalized.linked_decisions,
              linked_threads: normalized.linked_threads,
              generated_prompts: [],
            };
          }),
      ];
      if (tickets.length !== project.tickets.length) await saveTickets(project, tickets);

      for (const [index, idea] of drafts.ideas.entries()) {
        if (!selected[`idea:${index}`]) continue;
        const normalized = normalizeNoteDraft(idea);
        await createNote(project, "idea", normalized.title, normalized.body, normalized.linked_tickets ?? []);
      }

      for (const [index, decision] of drafts.decisions.entries()) {
        if (!selected[`decision:${index}`]) continue;
        const normalized = normalizeNoteDraft(decision);
        await createNote(project, "decision", normalized.title, normalized.body, normalized.linked_tickets ?? []);
      }

      const threads = [...project.threads];
      for (const [index, thread] of drafts.threads.entries()) {
        if (!selected[`thread:${index}`]) continue;
        const normalized = normalizeThreadDraft(thread);
        const summaryFile = normalized.summary?.trim()
          ? await saveThreadSummary(project, normalized.title, normalized.summary)
          : undefined;
        threads.push({
          id: recordId(normalized.title),
          provider: "codex",
          title: normalized.title,
          status: normalized.status,
          url: normalized.url ?? null,
          summary_file: summaryFile,
          linked_tickets: normalized.linked_tickets ?? [],
        });
      }
      if (threads.length !== project.threads.length) await saveThreads(project, threads);

      setNotice("Saved selected assistant drafts.");
      setDrafts(emptyDraftSet("codex"));
      setSelected({});
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assistant-layout grid gap-3.5">
      <div className="flex items-start gap-3 justify-between">
        <div>
          <h2 className="m-0 text-[16px] text-ink font-semibold flex items-center gap-2">
            <Bot size={16} className="text-accent" /> Assistant
          </h2>
          <p className="m-0 mt-1 text-[12.5px] text-ink-faint max-w-[720px] leading-[1.5]">
            Chat with Codex, then generate reviewed Waymark drafts when an idea is ready.
          </p>
        </div>
        <StatusPill status={status} route={route} />
      </div>

      {!isTauri() ? (
        <Notice tone="warn">
          <AlertTriangle size={13} /> Codex assistant is disabled in browser demo mode. Run Waymark through Tauri to use local Codex auth.
        </Notice>
      ) : null}
      {error ? <Notice tone="err"><AlertTriangle size={13} /> {error}</Notice> : null}
      {notice ? <Notice tone="ok"><Check size={13} /> {notice}</Notice> : null}

      <Card className="p-3.5">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <div className="assistant-mode-switch" aria-label="Assistant action">
            <ModeButton active={mode === "brainstorm"} onClick={() => setMode("brainstorm")} title="Chat without creating drafts">Chat</ModeButton>
            <ModeButton active={mode === "structure"} onClick={() => setMode("structure")} title="Ask Codex to propose editable Waymark drafts">Draft records</ModeButton>
          </div>
          <button
            type="button"
            onClick={() => setMode("capture")}
            className={cx(
              "h-7 px-2.5 rounded-[4px] border text-[12px] inline-flex items-center gap-1.5",
              mode === "capture"
                ? "bg-accent text-accent-ink border-accent-deep font-semibold"
                : "bg-surface-2 text-ink-faint border-line-soft hover:text-ink",
            )}
            title="Paste structured draft output from another Codex session"
          >
            <FileInput size={12} /> Import drafts
          </button>
          <select value={route} onChange={(event) => setRoute(event.target.value as CodexRoute)} className="ml-auto bg-surface-input-2 border border-line-soft rounded-[4px] h-7 px-2 text-[12px] text-ink-soft">
            <option value="app-server">App server preferred</option>
            <option value="cli">CLI fallback</option>
          </select>
          <Btn type="button" onClick={() => codexStatus().then(setStatus)} disabled={!isTauri()}>
            Check Codex
          </Btn>
          <Btn type="button" onClick={() => codexLogin()} disabled={!isTauri()}>
            <LogIn size={11} /> Connect Codex
          </Btn>
        </div>

        <label className="flex items-start gap-2 text-[12px] text-ink-faint mb-3 leading-[1.45]">
          <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} className="mt-0.5" />
          Send my prompt and selected project context to Codex/OpenAI using my local Codex account. Waymark will only write files after I review and save drafts.
        </label>

        {mode === "capture" ? (
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder="Paste structured draft JSON from Codex…"
            className="assistant-input min-h-[132px]"
          />
        ) : (
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void runAssistant(mode);
              }
            }}
            placeholder={mode === "structure" ? "Describe the tickets, ideas, decisions, or thread notes you want drafted…" : "Ask Codex about project direction, tradeoffs, risks, or next steps…"}
            className="assistant-input min-h-[132px]"
          />
        )}

        <div className="flex justify-end gap-2 mt-3">
          <Btn variant="primary" onClick={() => runAssistant(mode)} disabled={primaryDisabled}>
            {busy ? <Loader2 size={11} className="animate-spin" /> : primaryIcon} {primaryLabel}
          </Btn>
        </div>
      </Card>

      <div className="assistant-workspace-grid">
        <Card className="assistant-chat-card min-h-[420px] overflow-hidden">
          <div className="px-3 py-2 border-b border-line-soft flex items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.09em] text-ink-faint font-semibold flex-1">
              Conversation
            </div>
            {busy && route === "app-server" ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                streaming
              </span>
            ) : null}
          </div>
          {messages.length === 0 ? (
            <div className="p-5 text-[12.5px] text-ink-mute leading-[1.55]">
              Start with a product question, then generate drafts when something is worth saving.
            </div>
          ) : (
            <div ref={conversationRef} className="assistant-chat-scroll">
              {messages.map((message, index) => (
                <ChatMessage
                  key={index}
                  message={message}
                  streaming={Boolean(message.streamSessionId && message.streamSessionId === activeStreamRef.current && busy)}
                />
              ))}
            </div>
          )}
        </Card>

        <DraftReview
          drafts={drafts}
          selected={selected}
          setSelected={setSelected}
          setDrafts={setDrafts}
          onSave={saveSelectedDrafts}
          busy={busy}
          count={draftCount}
        />
      </div>
    </div>
  );
}

function StatusPill({ status, route }: { status: CodexStatus; route: CodexRoute }) {
  const color = status.state === "ready" ? "text-lane-done" : status.state === "needsLogin" ? "text-warn" : "text-ink-mute";
  return (
    <div className="text-right">
      <div className={cx("font-mono text-[11px]", color)}>{status.state}</div>
      <div className="font-mono text-[10.5px] text-ink-faint">{route}</div>
      <div className="text-[10.5px] text-ink-mute max-w-[280px] truncate" title={status.detail}>{status.detail}</div>
    </div>
  );
}

function ChatMessage({ message, streaming }: { message: AssistantMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  return (
    <div className={cx("assistant-message-row", isUser ? "user" : isSystem ? "system" : "assistant")}>
      {!isUser ? (
        <div className={cx("assistant-avatar", isSystem ? "system" : "assistant")}>
          {isSystem ? <AlertTriangle size={12} /> : <Sparkles size={12} />}
        </div>
      ) : null}
      <div className={cx("assistant-bubble", isUser ? "user" : isSystem ? "system" : "assistant")}>
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-ink-mute">
          <span>{message.role}</span>
          <span>·</span>
          <span>{message.route}</span>
        </div>
        <div className="whitespace-pre-wrap text-[13px] leading-[1.55] text-ink-soft">
          {message.content || (streaming ? "Thinking" : "")}
          {streaming ? <span className="assistant-stream-caret" /> : null}
        </div>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cx("h-7 px-2.5 rounded-[4px] border text-[12px]", active ? "bg-accent text-accent-ink border-accent-deep font-semibold" : "bg-surface-2 text-ink-faint border-line-soft hover:text-ink")}
    >
      {children}
    </button>
  );
}

function DraftReview({
  drafts,
  selected,
  setSelected,
  setDrafts,
  onSave,
  busy,
  count,
}: {
  drafts: WaymarkDraftSet;
  selected: Record<string, boolean>;
  setSelected: (value: Record<string, boolean>) => void;
  setDrafts: (value: WaymarkDraftSet) => void;
  onSave: () => void;
  busy: boolean;
  count: number;
}) {
  const selectedCount = Object.values(selected).filter(Boolean).length;
  return (
    <Card>
      <div className="px-3 py-2 border-b border-line-soft flex items-center gap-2">
        <div className="text-[11px] uppercase tracking-[0.09em] text-ink-faint font-semibold flex-1">Draft review</div>
        <span className="font-mono text-[10px] text-ink-mute">{selectedCount}/{count}</span>
      </div>
      {drafts.warnings.length ? (
        <div className="px-3 py-2 text-[11.5px] text-warn border-b border-line-soft">
          {drafts.warnings.join(" ")}
        </div>
      ) : null}
      {count === 0 ? (
        <div className="p-5 text-[12.5px] text-ink-mute">No drafts yet.</div>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <DraftGroup title="Tickets" items={drafts.tickets} prefix="ticket" selected={selected} setSelected={setSelected} render={(item, index) => (
            <TicketDraftEditor draft={item} onChange={(draft) => replaceDraft(setDrafts, drafts, "tickets", index, draft)} />
          )} />
          <DraftGroup title="Ideas" items={drafts.ideas} prefix="idea" selected={selected} setSelected={setSelected} render={(item, index) => (
            <NoteDraftEditor draft={item} onChange={(draft) => replaceDraft(setDrafts, drafts, "ideas", index, draft)} />
          )} />
          <DraftGroup title="Decisions" items={drafts.decisions} prefix="decision" selected={selected} setSelected={setSelected} render={(item, index) => (
            <NoteDraftEditor draft={item} onChange={(draft) => replaceDraft(setDrafts, drafts, "decisions", index, draft)} />
          )} />
          <DraftGroup title="Threads" items={drafts.threads} prefix="thread" selected={selected} setSelected={setSelected} render={(item, index) => (
            <ThreadDraftEditor draft={item} onChange={(draft) => replaceDraft(setDrafts, drafts, "threads", index, draft)} />
          )} />
        </div>
      )}
      <div className="p-3 border-t border-line-soft flex justify-end">
        <Btn variant="primary" onClick={onSave} disabled={busy || selectedCount === 0}>
          <Plus size={11} /> Save selected
        </Btn>
      </div>
    </Card>
  );
}

function DraftGroup<T>({
  title,
  items,
  prefix,
  selected,
  setSelected,
  render,
}: {
  title: string;
  items: T[];
  prefix: string;
  selected: Record<string, boolean>;
  setSelected: (value: Record<string, boolean>) => void;
  render: (item: T, index: number) => ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="border-b border-line-soft last:border-b-0">
      <div className="px-3 py-2 text-[10px] uppercase tracking-[0.09em] text-ink-mute">{title}</div>
      <div className="px-3 pb-3 grid gap-2">
        {items.map((item, index) => {
          const key = `${prefix}:${index}`;
          return (
            <div key={key} className="rounded-[5px] border border-line-soft bg-surface-1 p-2">
              <button
                onClick={() => setSelected({ ...selected, [key]: !selected[key] })}
                className="text-[11px] text-ink-faint mb-2 inline-flex items-center gap-1"
              >
                {selected[key] ? <CheckSquare size={12} /> : <Square size={12} />} Include
              </button>
              {render(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TicketDraftEditor({ draft, onChange }: { draft: DraftTicket; onChange: (draft: DraftTicket) => void }) {
  return (
    <div className="grid gap-2">
      <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} className="assistant-field" />
      <div className="grid grid-cols-2 gap-2">
        <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as DraftTicket["status"] })} className="assistant-field">
          {["idea", "now", "next", "later", "blocked", "done"].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={draft.priority ?? "medium"} onChange={(event) => onChange({ ...draft, priority: event.target.value as DraftTicket["priority"] })} className="assistant-field">
          {["low", "medium", "high"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
        </select>
      </div>
      <textarea value={draft.summary ?? ""} onChange={(event) => onChange({ ...draft, summary: event.target.value })} className="assistant-field min-h-[58px]" />
      <textarea value={(draft.acceptance_criteria ?? []).join("\n")} onChange={(event) => onChange({ ...draft, acceptance_criteria: lines(event.target.value) })} className="assistant-field min-h-[58px]" placeholder="Acceptance criteria" />
    </div>
  );
}

function NoteDraftEditor({ draft, onChange }: { draft: DraftNote; onChange: (draft: DraftNote) => void }) {
  return (
    <div className="grid gap-2">
      <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} className="assistant-field" />
      <textarea value={draft.body} onChange={(event) => onChange({ ...draft, body: event.target.value })} className="assistant-field min-h-[86px]" />
    </div>
  );
}

function ThreadDraftEditor({ draft, onChange }: { draft: DraftThread; onChange: (draft: DraftThread) => void }) {
  return (
    <div className="grid gap-2">
      <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} className="assistant-field" />
      <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as DraftThread["status"] })} className="assistant-field">
        {["active", "completed", "paused", "abandoned"].map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <textarea value={draft.summary ?? ""} onChange={(event) => onChange({ ...draft, summary: event.target.value })} className="assistant-field min-h-[86px]" placeholder="Summary saved as thread summary file" />
    </div>
  );
}

function defaultSelection(drafts: WaymarkDraftSet) {
  const selection: Record<string, boolean> = {};
  drafts.tickets.forEach((_, index) => selection[`ticket:${index}`] = true);
  drafts.ideas.forEach((_, index) => selection[`idea:${index}`] = true);
  drafts.decisions.forEach((_, index) => selection[`decision:${index}`] = true);
  drafts.threads.forEach((_, index) => selection[`thread:${index}`] = true);
  return selection;
}

function replaceStreamedMessage(
  messages: AssistantMessage[],
  streamSessionId: string | null,
  replacement: AssistantMessage,
) {
  if (!streamSessionId) return [...messages, replacement];
  const index = messages.findIndex((message) => message.streamSessionId === streamSessionId);
  if (index < 0) return [...messages, replacement];
  return messages.map((message, itemIndex) => itemIndex === index ? replacement : message);
}

function replaceDraft<T extends keyof Pick<WaymarkDraftSet, "tickets" | "ideas" | "decisions" | "threads">>(
  setDrafts: (value: WaymarkDraftSet) => void,
  drafts: WaymarkDraftSet,
  key: T,
  index: number,
  value: WaymarkDraftSet[T][number],
) {
  setDrafts({
    ...drafts,
    [key]: drafts[key].map((item, itemIndex) => itemIndex === index ? value : item),
  });
}
