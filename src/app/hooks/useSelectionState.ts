import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssistantLaunchInput, AssistantLaunchRequest } from "../../assistant";
import { contextRowKey, contextRows, type ContextRow } from "../../contextRows";
import type { NoteRecord, ThreadRecord, Ticket, WaymarkProject } from "../../types";
import type { InspectorMode } from "../model";

let assistantLaunchCounter = 0;

function nextAssistantLaunchId() {
  assistantLaunchCounter += 1;
  return `assistant-launch-${assistantLaunchCounter}`;
}

export function useSelectionState(project: WaymarkProject | null) {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
  const [selectedContextKey, setSelectedContextKey] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("ticket");
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [assistantLaunchRequest, setAssistantLaunchRequest] = useState<AssistantLaunchRequest | null>(null);

  const selectedTicket = useMemo(() => {
    if (!project) return null;
    return project.tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  }, [project, selectedTicketId]);

  const editingTicket = useMemo(() => {
    if (!project || !editingTicketId) return null;
    return project.tickets.find((ticket) => ticket.id === editingTicketId) ?? null;
  }, [editingTicketId, project]);

  const selectedThread = useMemo(() => {
    if (!project || !selectedThreadId) return null;
    return project.threads.find((thread) => thread.id === selectedThreadId) ?? null;
  }, [project, selectedThreadId]);

  const selectedNote = useMemo(() => {
    if (!project || !selectedNotePath) return null;
    return [...project.decisions, ...project.ideas].find((note) => note.path === selectedNotePath) ?? null;
  }, [project, selectedNotePath]);

  const selectedContext = useMemo(() => {
    if (!project || !selectedContextKey) return null;
    return contextRows(project).find((row) => contextRowKey(row) === selectedContextKey) ?? null;
  }, [project, selectedContextKey]);

  useEffect(() => {
    if (!project) {
      setSelectedTicketId(null);
      setSelectedThreadId(null);
      setSelectedNotePath(null);
      setSelectedContextKey(null);
      setMulti([]);
      setAssistantLaunchRequest(null);
      return;
    }

    setMulti((current) => current.filter((id) => project.tickets.some((ticket) => ticket.id === id)));
    setSelectedTicketId((current) => {
      if (current && project.tickets.some((ticket) => ticket.id === current)) return current;
      return project.tickets[0]?.id ?? null;
    });
    setSelectedThreadId((current) => {
      if (current && project.threads.some((thread) => thread.id === current)) return current;
      return project.threads[0]?.id ?? null;
    });
    setSelectedNotePath((current) => {
      const notes = [...project.decisions, ...project.ideas];
      if (current && notes.some((note) => note.path === current)) return current;
      return project.decisions[0]?.path ?? project.ideas[0]?.path ?? null;
    });
    setSelectedContextKey((current) => {
      const rows = contextRows(project);
      if (current && rows.some((row) => contextRowKey(row) === current)) return current;
      return rows[0] ? contextRowKey(rows[0]) : null;
    });
  }, [project]);

  const selectTicket = useCallback((ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
    setInspectorMode("ticket");
  }, []);

  const selectThread = useCallback((thread: ThreadRecord) => {
    setSelectedThreadId(thread.id);
    setInspectorMode("thread");
  }, []);

  const selectNote = useCallback((note: NoteRecord) => {
    setSelectedNotePath(note.path);
    setInspectorMode("note");
  }, []);

  const selectContext = useCallback((row: ContextRow) => {
    setSelectedContextKey(contextRowKey(row));
    setInspectorMode("context");
  }, []);

  const editTicket = useCallback((ticket: Ticket) => {
    setEditingTicketId(ticket.id);
  }, []);

  const clearEditingTicket = useCallback(() => {
    setEditingTicketId(null);
  }, []);

  const openAssistant = useCallback((request?: AssistantLaunchInput) => {
    if (request) {
      setAssistantLaunchRequest({ ...request, id: nextAssistantLaunchId() });
    }
    setInspectorMode("assistant");
  }, []);

  const clearAssistantLaunchRequest = useCallback(() => {
    setAssistantLaunchRequest(null);
  }, []);

  const toggleMulti = useCallback((id: string) => {
    setMulti((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  return useMemo(
    () => ({
      selectedTicketId,
      selectedTicket,
      selectedThread,
      selectedNote,
      selectedContext,
      selectedContextKey,
      editingTicket,
      assistantLaunchRequest,
      multi,
      inspectorMode,
      selectTicket,
      selectThread,
      selectNote,
      selectContext,
      setInspectorMode,
      editTicket,
      clearEditingTicket,
      openAssistant,
      clearAssistantLaunchRequest,
      toggleMulti,
    }),
    [
      assistantLaunchRequest,
      clearEditingTicket,
      clearAssistantLaunchRequest,
      editTicket,
      editingTicket,
      inspectorMode,
      multi,
      selectNote,
      selectContext,
      selectThread,
      selectTicket,
      selectedContext,
      selectedContextKey,
      selectedNote,
      selectedThread,
      selectedTicket,
      selectedTicketId,
      openAssistant,
      toggleMulti,
    ],
  );
}
