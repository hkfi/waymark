import { AlertTriangle, Bot, Check, CheckSquare, FileInput, Loader2, LogIn, Plus, RefreshCw, Send, SlidersHorizontal, Sparkles, Square, WandSparkles } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  WAYMARK_DRAFT_JSON_SCHEMA,
  type AssistantContextSelection,
  type AssistantLaunchRequest,
  type AssistantMode,
  buildAssistantPrompt,
  emptyDraftSet,
  normalizeNoteDraft,
  normalizeThreadDraft,
  normalizeTicketDraft,
  parseDraftSet,
} from "../assistant";
import { codexAppSessionStart, codexAppSessionStop, codexAppTurnSend, codexLogin, codexRunStructured, codexStatus, isTauri } from "../tauri";
import type { CodexRoute, CodexStatus, DraftNote, DraftThread, DraftTicket, Ticket, WaymarkDraftSet, WaymarkProject } from "../types";
import {
  planNoteFile,
  planThreadSummaryFile,
  projectMemoryPath,
  saveThreads,
  saveTickets,
  writePlannedProjectFile,
  type PlannedProjectFile,
} from "../workspace";
import { lines, recordId } from "../app/model";
import type { RecordTransaction } from "../app/hooks/useUndoRedoState";
import { MarkdownView, type MarkdownDisplayMode } from "./markdown";
import { Btn, Card, Notice, cx } from "./primitives";

type AssistantModelChoice = "latest" | "gpt-5.5" | "gpt-5.4" | "gpt-5.4-mini";
type AssistantReasoningEffort = "low" | "medium" | "high" | "xhigh";
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

let assistantContextConsentGranted = false;
const DEFAULT_ACTION_LABEL = "Ask Codex";
const DEFAULT_ACTION_EXPLANATION = "Chat with Codex using the current project and selection, then save reviewed Waymark drafts.";
const DRAFT_ACTION_EXPLANATION = "Ask Codex to propose editable tickets, ideas, decisions, or thread references from your prompt.";

function InlineTooltip({
  tooltip,
  className,
  children,
}: {
  tooltip: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx("inline-tooltip", className)}>
      {children}
      <span aria-hidden="true" className="inline-tooltip-bubble">{tooltip}</span>
    </span>
  );
}

export function AssistantView({
  project,
  selection,
  launchRequest,
  onLaunchConsumed,
  onSaved,
  recordTransaction,
}: {
  project: WaymarkProject;
  selection?: AssistantContextSelection;
  launchRequest?: AssistantLaunchRequest | null;
  onLaunchConsumed?: () => void;
  onSaved: () => Promise<void>;
  recordTransaction: RecordTransaction;
}) {
  const [status, setStatus] = useState<CodexStatus>({ state: "unavailable", path: null, detail: "Not checked yet." });
  const [mode, setMode] = useState<AssistantMode>("brainstorm");
  const [route, setRoute] = useState<CodexRoute>("app-server");
  const [model, setModel] = useState<AssistantModelChoice>("latest");
  const [reasoningEffort, setReasoningEffort] = useState<AssistantReasoningEffort>("high");
  const [prompt, setPrompt] = useState("");
  const [pasted, setPasted] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [drafts, setDrafts] = useState<WaymarkDraftSet>(emptyDraftSet("codex"));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [ack, setAck] = useState(assistantContextConsentGranted);
  const [busy, setBusy] = useState(false);
  const [checkingCodex, setCheckingCodex] = useState(false);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [codexCheckFeedback, setCodexCheckFeedback] = useState<string | null>(null);
  const [activeActionLabel, setActiveActionLabel] = useState(DEFAULT_ACTION_LABEL);
  const [activeExplanation, setActiveExplanation] = useState(DEFAULT_ACTION_EXPLANATION);
  const [pendingAutoRunId, setPendingAutoRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeStreamRef = useRef<string | null>(null);
  const appSessionRef = useRef<string | null>(null);
  const appSessionSettingsRef = useRef<string | null>(null);
  const modelSettingsRef = useRef<HTMLDivElement | null>(null);
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
    if (!modelSettingsOpen) return;
    function closeOnOutside(event: PointerEvent) {
      if (!modelSettingsRef.current?.contains(event.target as Node)) {
        setModelSettingsOpen(false);
      }
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setModelSettingsOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [modelSettingsOpen]);

  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  useEffect(() => {
    if (!launchRequest) return;
    setMode(launchRequest.mode);
    setPrompt(launchRequest.prompt);
    setPasted("");
    setError(null);
    setActiveActionLabel(launchRequest.actionLabel ?? (launchRequest.mode === "structure" ? "Draft records" : DEFAULT_ACTION_LABEL));
    setActiveExplanation(launchRequest.explanation ?? (launchRequest.mode === "structure" ? DRAFT_ACTION_EXPLANATION : DEFAULT_ACTION_EXPLANATION));
    setPendingAutoRunId(launchRequest.autoRun ? launchRequest.id : null);
    setNotice(launchRequest.notice ?? "Loaded contextual Codex recommendation prompt.");
    onLaunchConsumed?.();
  }, [launchRequest, onLaunchConsumed]);

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

  const canContactCodex = isTauri() && status.state === "ready" && !busy;
  const draftCount = drafts.tickets.length + drafts.ideas.length + drafts.decisions.length + drafts.threads.length;
  const selectedDraftCount = Object.values(selected).filter(Boolean).length;
  const primaryDisabled = busy || (mode === "capture" ? !pasted.trim() : !canContactCodex || !prompt.trim());
  const primaryLabel = mode === "capture"
    ? "Import drafts"
    : !ack
      ? "Send to Codex"
      : "Run Codex";
  const primaryIcon = mode === "capture" ? <FileInput size={11} /> : mode === "structure" || !ack ? <WandSparkles size={11} /> : <Send size={11} />;
  const primaryTooltip = mode === "capture"
    ? "Parse pasted draft JSON locally without contacting Codex."
    : mode === "structure"
      ? "Send this prompt and selected project context to Codex to generate reviewable drafts."
      : "Send this prompt and selected project context to Codex.";
  const connectionActionLabel = status.state === "ready" ? "Switch account" : "Connect";
  const selectedModel = model === "latest" ? null : model;
  const codexSettingsKey = `${project.rootPath}:${selectedModel ?? "latest"}:${reasoningEffort}`;
  const onboardingPrompt = `Draft onboarding records for the linked repos in this Waymark project.

Create concise, reviewable Waymark drafts only:
- initial tickets that would make the project easier to hand off to an agent
- decisions that capture important existing direction or constraints
- ideas worth tracking
- thread references only if the user should create or import a summary later

Do not draft repo context files, AGENTS.md, or instructions to write into the linked repos. Do not ask to scan the repo contents.`;

  async function refreshCodexStatus() {
    if (!isTauri() || checkingCodex) return;
    setCheckingCodex(true);
    setCodexCheckFeedback("Checking Codex status...");
    try {
      const nextStatus = await codexStatus();
      setStatus(nextStatus);
      setCodexCheckFeedback(`${connectionStatusLabel(nextStatus.state)}. Last checked just now.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setStatus({ state: "errored", path: null, detail: message });
      setCodexCheckFeedback(`Check failed: ${message}`);
    } finally {
      setCheckingCodex(false);
    }
  }

  async function openCodexConnection() {
    if (!isTauri()) return;
    setCodexCheckFeedback(status.state === "ready" ? "Opening OpenAI account switch..." : "Opening OpenAI connection...");
    try {
      await codexLogin();
      setCodexCheckFeedback(`${status.state === "ready" ? "Account switch" : "Connection"} opened. Check again after it finishes.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setCodexCheckFeedback(`Could not open OpenAI connection: ${message}`);
    }
  }

  function grantContextConsent() {
    assistantContextConsentGranted = true;
    setAck(true);
  }

  function setManualMode(nextMode: AssistantMode) {
    setMode(nextMode);
    setPendingAutoRunId(null);
    if (nextMode === "structure") {
      setActiveActionLabel("Draft records");
      setActiveExplanation(DRAFT_ACTION_EXPLANATION);
    } else if (nextMode === "capture") {
      setActiveActionLabel("Import drafts");
      setActiveExplanation("Paste structured Codex output and review it locally before saving any records.");
    } else {
      setActiveActionLabel(DEFAULT_ACTION_LABEL);
      setActiveExplanation(DEFAULT_ACTION_EXPLANATION);
    }
  }

  async function runAssistant(nextMode: AssistantMode, options: { grantConsent?: boolean } = {}) {
    setError(null);
    setNotice(null);
    const consentGranted = nextMode === "capture" || ack || options.grantConsent;
    if (nextMode !== "capture" && (!canContactCodex || !consentGranted)) return;
    if (options.grantConsent) grantContextConsent();
    const input = nextMode === "capture" ? pasted : prompt;
    if (!input.trim()) return;
    setPendingAutoRunId(null);
    setBusy(true);
    setMode(nextMode);
    setMessages((current) => [...current, { role: "user", content: input.trim(), route }]);
    await waitForPaint();
    try {
      if (nextMode === "capture") {
        const parsed = parseDraftSet(input, "pasted", project);
        setDrafts(parsed);
        setSelected(defaultSelection(parsed));
        setMessages((current) => [...current, { role: "assistant", content: "Parsed pasted output into reviewable Waymark drafts.", route: "cli" }]);
      } else {
        const assistantPrompt = buildAssistantPrompt(project, input.trim(), nextMode, selection);
        const request = {
          cwd: project.rootPath,
          prompt: assistantPrompt,
          schema: nextMode === "structure" ? WAYMARK_DRAFT_JSON_SCHEMA : undefined,
          timeoutMs: 180_000,
          model: selectedModel,
          modelReasoningEffort: reasoningEffort,
        };
        let streamSessionId: string | null = null;
        const result = route === "app-server"
          ? await (async () => {
              try {
                let sessionId = appSessionRef.current;
                if (sessionId && appSessionSettingsRef.current !== codexSettingsKey) {
                  void codexAppSessionStop(sessionId);
                  appSessionRef.current = null;
                  appSessionSettingsRef.current = null;
                  sessionId = null;
                }
                if (!sessionId) {
                  const session = await codexAppSessionStart(project.rootPath, selectedModel, reasoningEffort);
                  sessionId = session.id;
                  appSessionRef.current = session.id;
                  appSessionSettingsRef.current = codexSettingsKey;
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
      const message = friendlyAssistantError(caught);
      setError(message);
      setMessages((current) => [...current, { role: "system", content: message, route: "unavailable" }]);
    } finally {
      activeStreamRef.current = null;
      setBusy(false);
    }
  }

  async function saveSelectedDrafts() {
    setBusy(true);
    setError(null);
    try {
      const tickets = [...project.tickets];
      let ticketsChanged = false;
      const notePlans: PlannedProjectFile[] = [];
      const threadSummaryPlans: PlannedProjectFile[] = [];
      const noteReservedPaths = new Set<string>();
      const threadSummaryReservedPaths = new Set<string>();

      for (const [index, draft] of drafts.tickets.entries()) {
        if (!selected[`ticket:${index}`]) continue;
        const normalized = normalizeTicketDraft(draft);
        const existingIndex = normalized.id
          ? tickets.findIndex((ticket) => ticket.id === normalized.id)
          : -1;
        const existingTicket = existingIndex >= 0 ? tickets[existingIndex] : null;
        const nextTicket: Ticket = {
          ...(existingTicket ?? {}),
          id: existingTicket ? existingTicket.id : uniqueTicketId(recordId(normalized.title), tickets),
          title: normalized.title,
          status: normalized.status,
          priority: normalized.priority,
          summary: normalized.summary,
          acceptance_criteria: normalized.acceptance_criteria,
          linked_files: normalized.linked_files,
          linked_decisions: normalized.linked_decisions,
          linked_threads: normalized.linked_threads,
          generated_prompts: existingTicket?.generated_prompts ?? [],
        };
        if (existingIndex >= 0) tickets[existingIndex] = nextTicket;
        else tickets.push(nextTicket);
        ticketsChanged = true;
      }

      for (const [index, idea] of drafts.ideas.entries()) {
        if (!selected[`idea:${index}`]) continue;
        const normalized = normalizeNoteDraft(idea);
        notePlans.push(await planNoteFile(
          project,
          "idea",
          normalized.title,
          normalized.body,
          normalized.linked_tickets ?? [],
          noteReservedPaths,
        ));
      }

      for (const [index, decision] of drafts.decisions.entries()) {
        if (!selected[`decision:${index}`]) continue;
        const normalized = normalizeNoteDraft(decision);
        notePlans.push(await planNoteFile(
          project,
          "decision",
          normalized.title,
          normalized.body,
          normalized.linked_tickets ?? [],
          noteReservedPaths,
        ));
      }

      const threads = [...project.threads];
      for (const [index, thread] of drafts.threads.entries()) {
        if (!selected[`thread:${index}`]) continue;
        const normalized = normalizeThreadDraft(thread);
        const summaryPlan = normalized.summary?.trim()
          ? await planThreadSummaryFile(project, normalized.title, normalized.summary, threadSummaryReservedPaths)
          : null;
        if (summaryPlan) threadSummaryPlans.push(summaryPlan);
        threads.push({
          id: recordId(normalized.title),
          provider: "codex",
          title: normalized.title,
          status: normalized.status,
          url: normalized.url ?? null,
          summary_file: summaryPlan?.relativePath,
          linked_tickets: normalized.linked_tickets ?? [],
        });
      }
      const threadsChanged = threads.length !== project.threads.length;
      const transactionPaths = [
        ticketsChanged ? projectMemoryPath(project, "tickets.yaml") : null,
        threadsChanged ? projectMemoryPath(project, "threads.yaml") : null,
        ...notePlans.map((plan) => plan.path),
        ...threadSummaryPlans.map((plan) => plan.path),
      ].filter((path): path is string => Boolean(path));

      await recordTransaction(
        "Save assistant drafts",
        transactionPaths,
        async () => {
          if (ticketsChanged) await saveTickets(project, tickets);
          for (const plan of notePlans) {
            await writePlannedProjectFile(plan);
          }
          for (const plan of threadSummaryPlans) {
            await writePlannedProjectFile(plan);
          }
          if (threadsChanged) await saveThreads(project, threads);
        },
        "Saved selected assistant drafts.",
      );

      setDrafts(emptyDraftSet("codex"));
      setSelected({});
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function handleCommandEnter(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    const inDraftReview = event.target instanceof HTMLElement && Boolean(event.target.closest("[data-draft-review]"));
    if (inDraftReview) {
      if (!busy && selectedDraftCount > 0) void saveSelectedDrafts();
      return;
    }
    handlePrimaryAction();
  }

  function handlePrimaryAction() {
    if (primaryDisabled) return;
    if (mode !== "capture" && !ack) {
      void runAssistant(mode, { grantConsent: true });
      return;
    }
    void runAssistant(mode);
  }

  useEffect(() => {
    if (!pendingAutoRunId || mode === "capture" || !ack || !canContactCodex || !prompt.trim()) return;
    setPendingAutoRunId(null);
    void runAssistant(mode);
    // The effect intentionally runs only when the pending request becomes sendable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ack, canContactCodex, mode, pendingAutoRunId, prompt]);

  return (
    <div className="assistant-layout flex h-full min-h-0 flex-col gap-3.5" onKeyDown={handleCommandEnter}>
      <div className="shrink-0 flex items-start gap-3 justify-between">
        <div>
          <h2 className="m-0 text-[16px] text-ink font-semibold flex items-center gap-2">
            <Bot size={16} className="text-ai-fg" /> {activeActionLabel}
          </h2>
          <p className="m-0 mt-1 text-[12.5px] text-ink-faint max-w-[720px] leading-[1.5]">
            {activeExplanation}
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

      <Card className="shrink-0 p-3.5 overflow-visible">
        <div className="grid gap-2.5 mb-3">
          {mode === "capture" ? (
            <Notice tone="warn">
              <FileInput size={13} /> Import parses pasted draft JSON locally. It does not contact Codex.
            </Notice>
          ) : (
            <div className="ai-context-notice">
              <div className="flex items-start gap-2">
                {ack ? <Check size={13} className="mt-0.5 shrink-0 text-ai-fg" /> : <Sparkles size={13} className="mt-0.5 shrink-0 text-ai-fg" />}
                <div className="min-w-0">
                  <div>
                    Codex will receive the selected project context. Nothing is written until you review and save drafts.
                  </div>
                  <div className="mt-1 text-[11px] text-ink-mute">
                    {ack
                      ? "Approved for this app session."
                      : pendingAutoRunId
                        ? "Click Send to Codex to run this recommendation."
                        : "Click Send to Codex when you are ready."}
                    {status.state !== "ready" ? " Codex is not connected; open Advanced to connect or check status." : ""}
                  </div>
                </div>
              </div>
            </div>
          )}

          <details className="rounded-[5px] border border-line-soft bg-surface-input-2">
            <summary className="cursor-pointer select-none px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint hover:text-ink">
              Advanced
            </summary>
            <div className="grid gap-2.5 border-t border-line-soft p-2.5">
              <div className="assistant-mode-switch w-full grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))]" aria-label="Assistant action">
                <ModeButton active={mode === "brainstorm"} onClick={() => setManualMode("brainstorm")} tooltip="Chat with Codex about the project. Consumes tokens when you run it.">Chat</ModeButton>
                <ModeButton active={mode === "structure"} onClick={() => setManualMode("structure")} tooltip="Ask Codex for editable tickets, ideas, decisions, or thread references. Consumes tokens when you run it.">Draft records</ModeButton>
                <ModeButton active={mode === "capture"} onClick={() => setManualMode("capture")} tooltip="Paste structured draft JSON from another Codex session. This is local only.">
                  <FileInput size={12} /> Import
                </ModeButton>
              </div>

              <div className="rounded-[5px] border border-line-soft bg-surface-input-2 p-2 grid gap-2">
                <div className="flex items-start gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.09em] text-ink-mute font-semibold">
                      Assistant connection
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-soft truncate" title={status.detail}>
                      {status.state === "ready" ? "Connected through Codex" : `OpenAI account is ${connectionStatusLabel(status.state).toLowerCase()}`}
                    </div>
                  </div>
                  <StatusPill status={status} route={route} compact />
                </div>
                <div className="flex flex-wrap items-end gap-1.5">
                  <AssistantSelect label="Route" value={route} onChange={(value) => setRoute(value as CodexRoute)} className="min-w-[104px] flex-1">
                    <option value="app-server">App server</option>
                    <option value="cli">CLI</option>
                  </AssistantSelect>
                  <div ref={modelSettingsRef} className="relative">
                    <Btn
                      type="button"
                      onClick={() => setModelSettingsOpen((open) => !open)}
                      aria-haspopup="dialog"
                      aria-expanded={modelSettingsOpen}
                      title="Model and reasoning settings"
                      className="min-w-[126px] justify-center"
                    >
                      <SlidersHorizontal size={11} />
                      {modelLabel(model)} · {reasoningLabel(reasoningEffort)}
                    </Btn>
                    {modelSettingsOpen ? (
                      <div
                        role="dialog"
                        aria-label="Model settings"
                        className="absolute right-0 top-[calc(100%+6px)] z-50 w-[264px] rounded-[6px] border border-line bg-surface-2 p-2.5 shadow-[0_14px_42px_oklch(0_0_0_/_0.42)]"
                      >
                        <SettingGroup label="Model">
                          <div className="grid grid-cols-2 gap-1">
                            {(["latest", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini"] as AssistantModelChoice[]).map((choice) => (
                              <SettingChoice key={choice} active={model === choice} onClick={() => setModel(choice)}>
                                {modelLabel(choice)}
                              </SettingChoice>
                            ))}
                          </div>
                        </SettingGroup>
                        <SettingGroup label="Reasoning">
                          <div className="grid grid-cols-4 gap-1">
                            {(["low", "medium", "high", "xhigh"] as AssistantReasoningEffort[]).map((choice) => (
                              <SettingChoice key={choice} active={reasoningEffort === choice} onClick={() => setReasoningEffort(choice)}>
                                {reasoningLabel(choice)}
                              </SettingChoice>
                            ))}
                          </div>
                        </SettingGroup>
                      </div>
                    ) : null}
                  </div>
                  <Btn type="button" onClick={refreshCodexStatus} disabled={!isTauri() || checkingCodex}>
                    {checkingCodex ? <Loader2 size={11} className="animate-spin" /> : null}
                    {checkingCodex ? "Checking" : "Check"}
                  </Btn>
                  <Btn type="button" onClick={openCodexConnection} disabled={!isTauri()}>
                    {status.state === "ready" ? <RefreshCw size={11} /> : <LogIn size={11} />}
                    {connectionActionLabel}
                  </Btn>
                </div>
                {codexCheckFeedback ? (
                  <div className="min-w-0 truncate font-mono text-[10.5px] text-ink-mute" title={codexCheckFeedback}>
                    {codexCheckFeedback}
                  </div>
                ) : null}
              </div>

              <InlineTooltip tooltip="Fill the prompt with an onboarding-draft request. It will not contact Codex until you press Run Codex." className="w-full">
                <Btn
                  variant="ai"
                  type="button"
                  className="w-full justify-center"
                  onClick={() => {
                    setManualMode("structure");
                    setActiveActionLabel("Draft onboarding records");
                    setActiveExplanation("Ask Codex to draft reviewable onboarding records for this project.");
                    setPrompt(onboardingPrompt);
                  }}
                  disabled={busy}
                >
                  <Sparkles size={11} /> Draft onboarding records
                </Btn>
              </InlineTooltip>
            </div>
          </details>
        </div>

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
            placeholder={mode === "structure" ? "Describe the tickets, ideas, decisions, or thread notes you want drafted…" : "Ask Codex about project direction, tradeoffs, risks, or next steps…"}
            className="assistant-input min-h-[132px]"
          />
        )}

        {busy && mode !== "capture" ? (
          <div className="codex-run-note mt-3">
            Codex is running. You can still read the conversation and inspect the current drafts while Waymark waits for a response.
          </div>
        ) : null}

        <div className="flex justify-end gap-2 mt-3">
          <InlineTooltip tooltip={primaryTooltip}>
            <Btn
              variant={mode === "capture" ? "primary" : "codex"}
              onClick={handlePrimaryAction}
              disabled={primaryDisabled}
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : primaryIcon} {primaryLabel}
            </Btn>
          </InlineTooltip>
        </div>
      </Card>

      <div className="assistant-workspace-grid">
        <Card className="assistant-chat-card flex min-h-0 flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-line-soft flex items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.09em] text-ink-faint font-semibold flex-1">
              Conversation
            </div>
            {busy && route === "app-server" ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ai-fg">
                <span className="h-1.5 w-1.5 rounded-full bg-ai animate-pulse" />
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

function AssistantSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("min-w-0", className)}>
      <span className="mb-1 block text-[10px] uppercase tracking-[0.09em] text-ink-mute font-semibold">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-surface border border-line-soft rounded-[4px] h-7 px-2 text-[12px] text-ink-soft"
      >
        {children}
      </select>
    </label>
  );
}

function SettingGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 mb-2 last:mb-0">
      <div className="text-[10px] uppercase tracking-[0.09em] text-ink-mute font-semibold">{label}</div>
      {children}
    </div>
  );
}

function SettingChoice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "h-7 rounded-[4px] border px-2 text-[11.5px] text-center min-w-0",
        active
          ? "border-ai-deep bg-ai-soft text-ai-fg font-semibold"
          : "border-line-soft bg-surface-input-2 text-ink-faint hover:text-ink hover:bg-surface-4",
      )}
    >
      {children}
    </button>
  );
}

function modelLabel(model: AssistantModelChoice) {
  if (model === "latest") return "Latest";
  if (model === "gpt-5.5") return "GPT-5.5";
  if (model === "gpt-5.4") return "GPT-5.4";
  return "GPT-5.4 Mini";
}

function reasoningLabel(reasoning: AssistantReasoningEffort) {
  if (reasoning === "xhigh") return "XHigh";
  return reasoning[0].toUpperCase() + reasoning.slice(1);
}

function connectionStatusLabel(state: CodexStatus["state"]) {
  if (state === "ready") return "Connected";
  if (state === "needsLogin") return "Login needed";
  if (state === "running") return "Checking";
  if (state === "errored") return "Connection error";
  return "Not connected";
}

function StatusPill({ status, route, compact = false }: { status: CodexStatus; route: CodexRoute; compact?: boolean }) {
  const color = status.state === "ready" ? "text-lane-done" : status.state === "needsLogin" ? "text-warn" : "text-ink-mute";
  return (
    <div className="text-right">
      <div className={cx("font-mono text-[11px]", color)}>{connectionStatusLabel(status.state)}</div>
      {compact ? <div className="font-mono text-[10.5px] text-ink-faint">{route}</div> : null}
      {compact ? null : (
        <div className="text-[10.5px] text-ink-mute max-w-[280px] truncate" title={status.detail}>{status.detail}</div>
      )}
    </div>
  );
}

function ChatMessage({ message, streaming }: { message: AssistantMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [mode, setMode] = useState<MarkdownDisplayMode>("preview");
  const content = message.content || (streaming ? "Thinking" : "");

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
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setMode(mode === "preview" ? "source" : "preview")}
            className="rounded-[3px] px-1 py-0.5 normal-case tracking-normal text-ink-faint hover:bg-surface-3 hover:text-ink"
          >
            {mode === "preview" ? "Source" : "Rendered"}
          </button>
        </div>
        <div className="min-w-0 text-[13px] leading-[1.55] text-ink-soft">
          {mode === "preview" ? (
            <MarkdownView source={content} compact className="text-[13px]" />
          ) : (
            <pre className="m-0 whitespace-pre-wrap font-mono text-[11.5px] leading-[1.55] text-ink-soft">
              {content}
            </pre>
          )}
          {streaming ? <span className="assistant-stream-caret" /> : null}
        </div>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, tooltip, children }: { active: boolean; onClick: () => void; tooltip: string; children: ReactNode }) {
  return (
    <InlineTooltip tooltip={tooltip} className="w-full">
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        className={cx(
          "h-7 w-full px-2 rounded-[4px] border text-[12px] inline-flex items-center justify-center gap-1.5 min-w-0",
          active ? "bg-ai text-ai-ink border-ai-deep font-semibold" : "bg-transparent text-ink-faint border-transparent hover:text-ink",
        )}
      >
        {children}
      </button>
    </InlineTooltip>
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
    <Card data-draft-review="true" className="flex min-h-0 flex-col">
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
        <div className="min-h-0 flex-1 overflow-auto">
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
      {draft.id ? (
        <div className="inline-flex w-fit rounded-[3px] border border-ai-deep bg-ai-soft px-1.5 py-px font-mono text-[10px] text-ai-fg">
          updates {draft.id}
        </div>
      ) : null}
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

function uniqueTicketId(baseId: string, tickets: Ticket[]) {
  const used = new Set(tickets.map((ticket) => ticket.id));
  if (!used.has(baseId)) return baseId;
  let index = 2;
  while (used.has(`${baseId}-${index}`)) index += 1;
  return `${baseId}-${index}`;
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function friendlyAssistantError(caught: unknown) {
  const raw = caught instanceof Error ? caught.message : String(caught);
  if (raw.includes("Invalid schema for response_format") || raw.includes("invalid_json_schema")) {
    return "Codex rejected Waymark's structured draft schema. The schema has been updated; try running the request again.";
  }
  if (raw.length <= 900) return raw;
  return `${raw.slice(0, 900).trimEnd()}\n\n…error details truncated.`;
}
