import { useCallback, useMemo } from "react";
import { isTauri } from "../../tauri";
import type { LinkRecord, RepoRef, ThreadRecord, Ticket, TicketStatus, WaymarkProject } from "../../types";
import {
  addRepoToProject,
  buildPrompt,
  createNote,
  saveGeneratedPrompts,
  saveLinks,
  saveThreads,
  saveTickets,
} from "../../workspace";
import { LANE_LABEL, lines, recordId, type CapturePayload, type InspectorMode, type Lane } from "../model";

type ProjectActionDeps = {
  project: WaymarkProject | null;
  selectedTicket: Ticket | null;
  multi: string[];
  setInspectorMode: (mode: InspectorMode) => void;
  refresh: () => Promise<void>;
  clearEditingTicket: () => void;
  closeCapture: () => void;
  closeFileModal: () => void;
  closeRepoOnboarding: () => void;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
};

export function useProjectActions({
  project,
  selectedTicket,
  multi,
  setInspectorMode,
  refresh,
  clearEditingTicket,
  closeCapture,
  closeFileModal,
  closeRepoOnboarding,
  setError,
  setNotice,
}: ProjectActionDeps) {
  const sendHandoff = useCallback(async () => {
    if (!project) return;
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
      setNotice(`Saved ${saved.length} prompt${saved.length === 1 ? "" : "s"} and copied to clipboard.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [multi, project, refresh, selectedTicket, setError, setInspectorMode, setNotice]);

  const changeStatus = useCallback(
    async (ticket: Ticket, status: TicketStatus) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to update local ticket YAML.");
        return;
      }

      try {
        await saveTickets(
          project,
          project.tickets.map((candidate) =>
            candidate.id === ticket.id ? { ...candidate, status } : candidate,
          ),
        );
        setNotice(`Moved ${ticket.title} to ${LANE_LABEL[status as Lane] ?? status}.`);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [project, refresh, setError, setNotice],
  );

  const saveTicket = useCallback(
    async (ticket: Ticket) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to edit local ticket YAML.");
        return;
      }

      try {
        await saveTickets(
          project,
          project.tickets.map((candidate) => (candidate.id === ticket.id ? ticket : candidate)),
        );
        setNotice(`Updated ${ticket.title}.`);
        clearEditingTicket();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [clearEditingTicket, project, refresh, setError, setNotice],
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
          await saveTickets(project, [...project.tickets, ticket]);
        } else if (payload.kind === "idea" || payload.kind === "decision") {
          await createNote(
            project,
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
          await saveThreads(project, [...project.threads, thread]);
        }

        setNotice(`Captured ${payload.title}.`);
        closeCapture();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [closeCapture, project, refresh, setError, setNotice],
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
        await saveTickets(
          project,
          project.tickets.map((ticket) =>
            ticket.id === ticketId
              ? { ...ticket, linked_files: Array.from(new Set([...(ticket.linked_files ?? []), cleanPath])) }
              : ticket,
          ),
        );
        setNotice(`Linked ${cleanPath}.`);
        closeFileModal();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [closeFileModal, project, refresh, setError, setNotice],
  );

  const addLink = useCallback(
    async (link: LinkRecord) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to add links.");
        return;
      }

      try {
        await saveLinks(project, [...project.links.filter((item) => item.id !== link.id), link]);
        setNotice(`Added ${link.label}.`);
        closeFileModal();
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [closeFileModal, project, refresh, setError, setNotice],
  );

  const updateLink = useCallback(
    async (link: LinkRecord) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to update context links.");
        return;
      }

      try {
        await saveLinks(
          project,
          project.links.map((item) => (item.id === link.id ? link : item)),
        );
        setNotice(`Updated ${link.label}.`);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [project, refresh, setError, setNotice],
  );

  const deleteLink = useCallback(
    async (link: LinkRecord) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to remove context links.");
        return;
      }

      try {
        await saveLinks(project, project.links.filter((item) => item.id !== link.id));
        setNotice(`Removed ${link.label}.`);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [project, refresh, setError, setNotice],
  );

  const onboardRepo = useCallback(
    async (repo: RepoRef) => {
      if (!project) return;
      if (!isTauri()) {
        setNotice("Run Waymark through Tauri to onboard local repos.");
        return;
      }

      try {
        const saved = await addRepoToProject(project, repo);
        const scaffoldText = saved.scaffolded.length
          ? ` Created ${saved.scaffolded.length} missing scaffold item${saved.scaffolded.length === 1 ? "" : "s"}.`
          : "";
        setNotice(`Onboarded ${saved.repo.name}.${scaffoldText}`);
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
      capture,
      addFile,
      addLink,
      updateLink,
      deleteLink,
      onboardRepo,
    }),
    [addFile, addLink, capture, changeStatus, deleteLink, onboardRepo, saveTicket, sendHandoff, updateLink],
  );
}
