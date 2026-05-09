import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContextRow } from "../../contextRows";
import { isTauri, removeFile } from "../../tauri";
import type { LinkRecord, NoteRecord, RepoRef, ThreadRecord, Ticket, TicketStatus, WaymarkProject } from "../../types";
import {
  addReposToProject,
  buildHandoffContextOptions,
  buildPrompt,
  planGeneratedPrompts,
  planNoteFile,
  projectMemoryPath,
  saveGeneratedPromptPlan,
  saveLinks,
  saveProjectConfig,
  saveThreads,
  saveTickets,
  writePlannedProjectFile,
} from "../../workspace";
import type { RepoInstructionDraft } from "../../workspace";
import { LANE_LABEL, lines, recordId, type CapturePayload, type InspectorMode, type Lane } from "../model";
import type { RecordTransaction } from "./useUndoRedoState";

type ProjectActionDeps = {
  project: WaymarkProject | null;
  selectedTicket: Ticket | null;
  multi: string[];
  inspectorMode: InspectorMode;
  setInspectorMode: (mode: InspectorMode) => void;
  refresh: () => Promise<void>;
  clearEditingTicket: () => void;
  closeCapture: () => void;
  closeFileModal: () => void;
  closeRepoOnboarding: () => void;
  recordTransaction: RecordTransaction;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
};

export function useProjectActions({
  project,
  selectedTicket,
  multi,
  inspectorMode,
  setInspectorMode,
  refresh,
  clearEditingTicket,
  closeCapture,
  closeFileModal,
  closeRepoOnboarding,
  recordTransaction,
  setError,
  setNotice,
}: ProjectActionDeps) {
  const handoffTickets = useMemo(() => {
    if (!project) return [];
    const ids = multi.length ? multi : selectedTicket ? [selectedTicket.id] : [];
    return project.tickets.filter((ticket) => ids.includes(ticket.id));
  }, [multi, project, selectedTicket]);

  const handoffTicketKey = useMemo(
    () => handoffTickets.map((ticket) => ticket.id).sort().join("|"),
    [handoffTickets],
  );
  const [handoffContextOverrides, setHandoffContextOverrides] = useState<Record<string, boolean>>({});
  const handoffOptions = useMemo(
    () => (project ? buildHandoffContextOptions(project, handoffTickets) : []),
    [handoffTickets, project],
  );

  useEffect(() => {
    setHandoffContextOverrides({});
  }, [handoffTicketKey, project?.rootPath]);

  const selectedHandoffContextIds = useMemo(
    () =>
      handoffOptions
        .filter((option) => handoffContextOverrides[option.id] ?? option.defaultIncluded)
        .map((option) => option.id),
    [handoffContextOverrides, handoffOptions],
  );

  const toggleHandoffContext = useCallback(
    (id: string) => {
      const option = handoffOptions.find((candidate) => candidate.id === id);
      if (!option) return;
      setHandoffContextOverrides((current) => ({
        ...current,
        [id]: !(current[id] ?? option.defaultIncluded),
      }));
    },
    [handoffOptions],
  );

  const sendHandoff = useCallback(async () => {
    if (!project) return;
    if (handoffTickets.length === 0) {
      setError("Select a ticket to send to an agent.");
      return;
    }

    setInspectorMode("prompt");
    if (inspectorMode !== "prompt") {
      setNotice("Review suggested context, then save or copy the handoff prompt.");
      return;
    }

    const promptForCopy = handoffTickets
      .map((ticket) => buildPrompt(project, ticket, selectedHandoffContextIds))
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
      const prompts = handoffTickets.map((ticket) => ({
        ticket,
        prompt: buildPrompt(project, ticket, selectedHandoffContextIds),
      }));
      const plans = await planGeneratedPrompts(project, prompts);
      await recordTransaction(
        `Save ${plans.length} handoff prompt${plans.length === 1 ? "" : "s"}`,
        [projectMemoryPath(project, "tickets.yaml"), ...plans.map((plan) => plan.path)],
        () => saveGeneratedPromptPlan(project, plans),
        (result) => `Saved ${result.length} prompt${result.length === 1 ? "" : "s"} and copied to clipboard.`,
      );
      try {
        await navigator.clipboard.writeText(promptForCopy);
      } catch {
        /* clipboard not always available */
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [handoffTickets, inspectorMode, project, recordTransaction, refresh, selectedHandoffContextIds, setError, setInspectorMode, setNotice]);

  const changeStatus = useCallback(
    async (ticket: Ticket, status: TicketStatus) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to update local ticket YAML.");
        return;
      }

      try {
        await recordTransaction(
          `Move ${ticket.title} to ${LANE_LABEL[status as Lane] ?? status}`,
          [projectMemoryPath(project, "tickets.yaml")],
          () =>
            saveTickets(
              project,
              project.tickets.map((candidate) =>
                candidate.id === ticket.id ? { ...candidate, status } : candidate,
              ),
            ),
          `Moved ${ticket.title} to ${LANE_LABEL[status as Lane] ?? status}.`,
        );
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [project, recordTransaction, refresh, setError, setNotice],
  );

  const saveTicket = useCallback(
    async (ticket: Ticket) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to edit local ticket YAML.");
        return;
      }

      try {
        await recordTransaction(
          `Update ${ticket.title}`,
          [projectMemoryPath(project, "tickets.yaml")],
          () =>
            saveTickets(
              project,
              project.tickets.map((candidate) => (candidate.id === ticket.id ? ticket : candidate)),
            ),
          `Updated ${ticket.title}.`,
        );
        clearEditingTicket();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [clearEditingTicket, project, recordTransaction, refresh, setError, setNotice],
  );

  const deleteTicket = useCallback(
    async (ticket: Ticket) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to delete local ticket YAML.");
        return;
      }

      try {
        await recordTransaction(
          `Delete ${ticket.title}`,
          [projectMemoryPath(project, "tickets.yaml")],
          () => saveTickets(project, project.tickets.filter((candidate) => candidate.id !== ticket.id)),
          `Deleted ${ticket.title}.`,
        );
        clearEditingTicket();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [clearEditingTicket, project, recordTransaction, refresh, setError, setNotice],
  );

  const deletePromptReference = useCallback(
    async (ticket: Ticket, promptPath: string) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to update generated prompt references.");
        return;
      }

      try {
        await recordTransaction(
          `Remove prompt reference from ${ticket.title}`,
          [projectMemoryPath(project, "tickets.yaml")],
          () =>
            saveTickets(
              project,
              project.tickets.map((candidate) =>
                candidate.id === ticket.id
                  ? {
                      ...candidate,
                      generated_prompts: (candidate.generated_prompts ?? []).filter((path) => path !== promptPath),
                    }
                  : candidate,
              ),
            ),
          `Removed prompt reference from ${ticket.title}. Prompt file was not deleted.`,
        );
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [project, recordTransaction, refresh, setError, setNotice],
  );

  const capture = useCallback(
    async (payload: CapturePayload) => {
      if (!project) return;
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
          await recordTransaction(
            `Capture ${payload.title}`,
            [projectMemoryPath(project, "tickets.yaml")],
            () => saveTickets(project, [...project.tickets, ticket]),
            `Captured ${payload.title}.`,
          );
        } else if (payload.kind === "idea" || payload.kind === "decision") {
          const notePlan = await planNoteFile(
            project,
            payload.kind,
            payload.title,
            payload.summary || payload.body || "Captured from Waymark.",
            lines(payload.linkedTickets),
          );
          await recordTransaction(
            `Capture ${payload.title}`,
            [notePlan.path],
            () => writePlannedProjectFile(notePlan),
            `Captured ${payload.title}.`,
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
          await recordTransaction(
            `Capture ${payload.title}`,
            [projectMemoryPath(project, "threads.yaml")],
            () => saveThreads(project, [...project.threads, thread]),
            `Captured ${payload.title}.`,
          );
        }

        closeCapture();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [closeCapture, project, recordTransaction, refresh, setError, setNotice],
  );

  const addFile = useCallback(
    async (ticketId: string, path: string) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to add linked files.");
        return;
      }
      const cleanPath = path.trim();
      if (!cleanPath) return;

      try {
        await recordTransaction(
          `Link ${cleanPath}`,
          [projectMemoryPath(project, "tickets.yaml")],
          () =>
            saveTickets(
              project,
              project.tickets.map((ticket) =>
                ticket.id === ticketId
                  ? { ...ticket, linked_files: Array.from(new Set([...(ticket.linked_files ?? []), cleanPath])) }
                  : ticket,
              ),
            ),
          `Linked ${cleanPath}.`,
        );
        closeFileModal();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [closeFileModal, project, recordTransaction, refresh, setError, setNotice],
  );

  const addLink = useCallback(
    async (link: LinkRecord) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to add links.");
        return;
      }

      try {
        await recordTransaction(
          `Add ${link.label}`,
          [projectMemoryPath(project, "links.yaml")],
          () => saveLinks(project, [...project.links.filter((item) => item.id !== link.id), link]),
          `Added ${link.label}.`,
        );
        closeFileModal();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [closeFileModal, project, recordTransaction, refresh, setError, setNotice],
  );

  const updateLink = useCallback(
    async (link: LinkRecord) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to update context links.");
        return;
      }

      try {
        await recordTransaction(
          `Update ${link.label}`,
          [projectMemoryPath(project, "links.yaml")],
          () =>
            saveLinks(
              project,
              project.links.map((item) => (item.id === link.id ? link : item)),
            ),
          `Updated ${link.label}.`,
        );
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [project, recordTransaction, refresh, setError, setNotice],
  );

  const deleteContextRow = useCallback(
    async (row: ContextRow) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to update local project context.");
        return;
      }

      try {
        if (row.source === "link" && row.link) {
          await recordTransaction(
            `Delete context item ${row.label}`,
            [projectMemoryPath(project, "links.yaml")],
            () => saveLinks(project, project.links.filter((item) => item.id !== row.link?.id)),
            `Deleted context item ${row.label}.`,
          );
        } else if (row.source === "project" && row.repo) {
          const repos = (project.config.repos ?? []).filter((repo) => repo.id !== row.repo?.id);
          await recordTransaction(
            `Remove repo reference ${row.label}`,
            [projectMemoryPath(project, "project.yaml")],
            () => saveProjectConfig(project, { ...project.config, repos }),
            `Removed repo reference ${row.label}.`,
          );
        } else if (row.source === "ticket" && row.ticket) {
          await recordTransaction(
            `Unlink ${row.value}`,
            [projectMemoryPath(project, "tickets.yaml")],
            () =>
              saveTickets(
                project,
                project.tickets.map((ticket) =>
                  ticket.id === row.ticket?.id
                    ? { ...ticket, linked_files: (ticket.linked_files ?? []).filter((file) => file !== row.value) }
                    : ticket,
                ),
              ),
            `Unlinked ${row.value} from ${row.label}.`,
          );
        } else {
          setError("This context row cannot be removed from Waymark yet.");
          return;
        }
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [project, recordTransaction, refresh, setError, setNotice],
  );

  const deleteThread = useCallback(
    async (thread: ThreadRecord) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to delete local thread references.");
        return;
      }

      try {
        await recordTransaction(
          `Delete thread reference ${thread.title}`,
          [projectMemoryPath(project, "threads.yaml"), projectMemoryPath(project, "tickets.yaml")],
          async () => {
            await saveThreads(project, project.threads.filter((candidate) => candidate.id !== thread.id));
            await saveTickets(
              project,
              project.tickets.map((ticket) => ({
                ...ticket,
                linked_threads: (ticket.linked_threads ?? []).filter((threadId) => threadId !== thread.id),
              })),
            );
          },
          `Deleted thread reference ${thread.title}. Summary file was not deleted.`,
        );
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [project, recordTransaction, refresh, setError, setNotice],
  );

  const deleteNote = useCallback(
    async (note: NoteRecord) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice(`Run Waymark through Tauri to delete local ${note.type} files.`);
        return;
      }

      try {
        const paths = note.type === "decision"
          ? [note.path, projectMemoryPath(project, "tickets.yaml")]
          : [note.path];
        await recordTransaction(
          `Delete ${note.type} ${note.title}`,
          paths,
          async () => {
            await removeFile(note.path);
            if (note.type === "decision") {
              await saveTickets(
                project,
                project.tickets.map((ticket) => ({
                  ...ticket,
                  linked_decisions: (ticket.linked_decisions ?? []).filter((decisionId) => decisionId !== note.id),
                })),
              );
            }
          },
          `Deleted ${note.type} ${note.title}.`,
        );
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [project, recordTransaction, refresh, setError, setNotice],
  );

  const onboardRepo = useCallback(
    async (repos: RepoRef[], instructionDrafts: RepoInstructionDraft[] = []) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to onboard local repos.");
        return;
      }

      try {
        const saved = await addReposToProject(project, repos, instructionDrafts);
        const scaffoldText = saved.scaffolded.length
          ? ` Created ${saved.scaffolded.length} missing scaffold item${saved.scaffolded.length === 1 ? "" : "s"}.`
          : "";
        const repoFileText = saved.writtenRepoFiles.length
          ? ` Wrote ${saved.writtenRepoFiles.length} repo instruction file${saved.writtenRepoFiles.length === 1 ? "" : "s"}.`
          : "";
        setNotice(`Onboarded ${saved.repos.length} repo${saved.repos.length === 1 ? "" : "s"}.${scaffoldText}${repoFileText}`);
        closeRepoOnboarding();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        throw caught;
      }
    },
    [closeRepoOnboarding, project, refresh, setError, setNotice],
  );

  return useMemo(
    () => ({
      sendHandoff,
      changeStatus,
      saveTicket,
      deleteTicket,
      deletePromptReference,
      capture,
      addFile,
      addLink,
      updateLink,
      deleteContextRow,
      deleteThread,
      deleteNote,
      onboardRepo,
      handoffOptions,
      selectedHandoffContextIds,
      toggleHandoffContext,
    }),
    [
      addFile,
      addLink,
      capture,
      changeStatus,
      deleteContextRow,
      deleteTicket,
      deleteNote,
      deletePromptReference,
      deleteThread,
      handoffOptions,
      onboardRepo,
      saveTicket,
      selectedHandoffContextIds,
      sendHandoff,
      toggleHandoffContext,
      updateLink,
    ],
  );
}
