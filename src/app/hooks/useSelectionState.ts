import { useCallback, useEffect, useMemo, useState } from "react";
import type { NoteRecord, ThreadRecord, Ticket, WaymarkProject } from "../../types";
import type { InspectorMode } from "../model";

export function useSelectionState(project: WaymarkProject | null) {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("ticket");
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!project) {
      setSelectedTicketId(null);
      setSelectedThreadId(null);
      setSelectedNotePath(null);
      setMulti([]);
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

  const editTicket = useCallback((ticket: Ticket) => {
    setEditingTicketId(ticket.id);
  }, []);

  const clearEditingTicket = useCallback(() => {
    setEditingTicketId(null);
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
      editingTicket,
      multi,
      inspectorMode,
      selectTicket,
      selectThread,
      selectNote,
      setInspectorMode,
      editTicket,
      clearEditingTicket,
      toggleMulti,
    }),
    [
      clearEditingTicket,
      editTicket,
      editingTicket,
      inspectorMode,
      multi,
      selectNote,
      selectThread,
      selectTicket,
      selectedNote,
      selectedThread,
      selectedTicket,
      selectedTicketId,
      toggleMulti,
    ],
  );
}
