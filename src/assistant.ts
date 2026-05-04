import { z } from "zod";
import type { DraftNote, DraftThread, DraftTicket, NoteRecord, ThreadRecord, Ticket, TicketStatus, WaymarkDraftSet, WaymarkProject } from "./types";

const ticketStatus = z.enum(["idea", "now", "next", "later", "blocked", "done"]);
const priority = z.enum(["low", "medium", "high"]);
const threadStatus = z.enum(["active", "completed", "paused", "abandoned"]);

const draftTicket = z.object({
  title: z.string().min(1),
  status: ticketStatus.default("next"),
  priority: priority.optional(),
  summary: z.string().optional(),
  acceptance_criteria: z.array(z.string()).default([]),
  linked_files: z.array(z.string()).default([]),
  linked_decisions: z.array(z.string()).default([]),
  linked_threads: z.array(z.string()).default([]),
});

const draftNote = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  linked_tickets: z.array(z.string()).default([]),
});

const draftThread = z.object({
  title: z.string().min(1),
  status: threadStatus.default("active"),
  url: z.string().nullable().optional(),
  summary: z.string().optional(),
  linked_tickets: z.array(z.string()).default([]),
});

const draftSetSchema = z.object({
  summary: z.string().default(""),
  tickets: z.array(draftTicket).default([]),
  ideas: z.array(draftNote).default([]),
  decisions: z.array(draftNote).default([]),
  threads: z.array(draftThread).default([]),
  warnings: z.array(z.string()).default([]),
});

export const WAYMARK_DRAFT_JSON_SCHEMA = JSON.stringify({
  type: "object",
  additionalProperties: false,
  required: ["summary", "tickets", "ideas", "decisions", "threads", "warnings"],
  properties: {
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    tickets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "status", "priority", "summary", "acceptance_criteria", "linked_files", "linked_decisions", "linked_threads"],
        properties: {
          title: { type: "string" },
          status: { type: "string", enum: ["idea", "now", "next", "later", "blocked", "done"] },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          summary: { type: "string" },
          acceptance_criteria: { type: "array", items: { type: "string" } },
          linked_files: { type: "array", items: { type: "string" } },
          linked_decisions: { type: "array", items: { type: "string" } },
          linked_threads: { type: "array", items: { type: "string" } },
        },
      },
    },
    ideas: draftNoteArraySchema(),
    decisions: draftNoteArraySchema(),
    threads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "status", "url", "summary", "linked_tickets"],
        properties: {
          title: { type: "string" },
          status: { type: "string", enum: ["active", "completed", "paused", "abandoned"] },
          url: { anyOf: [{ type: "string" }, { type: "null" }] },
          summary: { type: "string" },
          linked_tickets: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
});

function draftNoteArraySchema() {
  return {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["title", "body", "linked_tickets"],
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        linked_tickets: { type: "array", items: { type: "string" } },
      },
    },
  };
}

export type AssistantContextSelection = {
  ticket?: Ticket | null;
  thread?: ThreadRecord | null;
  note?: NoteRecord | null;
  bundle?: string[];
};

export function buildAssistantPrompt(
  project: WaymarkProject,
  userPrompt: string,
  mode: "brainstorm" | "structure" | "capture",
  selection: AssistantContextSelection = {},
) {
  const context = {
    project: {
      name: project.config.name,
      slug: project.config.slug,
      summary: project.config.summary,
      current_focus: project.config.current_focus ?? "",
      stage: project.config.stage,
    },
    repos: (project.config.repos ?? []).map((repo) => ({
      id: repo.id,
      name: repo.name,
      path: repo.path ?? "",
      url: repo.url ?? "",
    })),
    tickets: project.tickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      summary: ticket.summary,
    })),
    decisions: project.decisions.map((decision) => ({
      id: decision.id,
      title: decision.title,
      status: decision.status,
    })),
    threads: project.threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      provider: thread.provider,
      status: thread.status,
    })),
    selection: {
      ticket: selection.ticket
        ? {
            id: selection.ticket.id,
            title: selection.ticket.title,
            status: selection.ticket.status,
            priority: selection.ticket.priority,
            summary: selection.ticket.summary,
            linked_files: selection.ticket.linked_files ?? [],
            linked_decisions: selection.ticket.linked_decisions ?? [],
            linked_threads: selection.ticket.linked_threads ?? [],
          }
        : null,
      thread: selection.thread
        ? {
            id: selection.thread.id,
            title: selection.thread.title,
            provider: selection.thread.provider,
            status: selection.thread.status,
            summary_file: selection.thread.summary_file,
          }
        : null,
      note: selection.note
        ? {
            id: selection.note.id,
            type: selection.note.type,
            title: selection.note.title,
            status: selection.note.status,
            linked_tickets: selection.note.linked_tickets,
          }
        : null,
      handoff_bundle: selection.bundle ?? [],
    },
  };

  if (mode === "brainstorm") {
    return `You are helping maintain Waymark project memory.

Respond conversationally and concisely. Brainstorm useful product direction, risks, tradeoffs, and possible Waymark records, but do not output JSON unless the user explicitly asks for structured drafts. Do not edit files, run commands, or ask for tool access.

Project context:
${JSON.stringify(context, null, 2)}

User input:
${userPrompt}`;
  }

  return `You are helping maintain Waymark project memory.

Return only valid JSON matching the provided schema. Do not edit files, run commands, or ask for tool access.

Mode: ${mode}

Project context:
${JSON.stringify(context, null, 2)}

User input:
${userPrompt}

Produce concise, reviewable Waymark drafts. Prefer fewer high-quality records over many speculative records. Use existing ticket, decision, and thread IDs only when they clearly apply.`;
}

export function parseDraftSet(raw: string, source: WaymarkDraftSet["source"], project: WaymarkProject): WaymarkDraftSet {
  const parsed = draftSetSchema.parse(parseJson(raw));
  const warnings = [...parsed.warnings];

  const tickets = parsed.tickets.map((ticket) => ({
    ...ticket,
    linked_decisions: validIds(ticket.linked_decisions, project.decisions.map((decision) => decision.id), warnings, "decision"),
    linked_threads: validIds(ticket.linked_threads, project.threads.map((thread) => thread.id), warnings, "thread"),
  }));

  return {
    summary: parsed.summary,
    source,
    tickets,
    ideas: parsed.ideas.map((idea) => ({
      ...idea,
      linked_tickets: validIds(idea.linked_tickets, project.tickets.map((ticket) => ticket.id), warnings, "ticket"),
    })),
    decisions: parsed.decisions.map((decision) => ({
      ...decision,
      linked_tickets: validIds(decision.linked_tickets, project.tickets.map((ticket) => ticket.id), warnings, "ticket"),
    })),
    threads: parsed.threads.map((thread) => ({
      ...thread,
      linked_tickets: validIds(thread.linked_tickets, project.tickets.map((ticket) => ticket.id), warnings, "ticket"),
    })),
    warnings,
  };
}

export function emptyDraftSet(source: WaymarkDraftSet["source"]): WaymarkDraftSet {
  return { summary: "", source, tickets: [], ideas: [], decisions: [], threads: [], warnings: [] };
}

export function normalizeTicketDraft(ticket: DraftTicket): DraftTicket {
  return {
    ...ticket,
    status: (ticket.status || "next") as TicketStatus,
    priority: ticket.priority || "medium",
    acceptance_criteria: ticket.acceptance_criteria ?? [],
    linked_files: ticket.linked_files ?? [],
    linked_decisions: ticket.linked_decisions ?? [],
    linked_threads: ticket.linked_threads ?? [],
  };
}

export function normalizeNoteDraft(note: DraftNote): DraftNote {
  return { ...note, linked_tickets: note.linked_tickets ?? [] };
}

export function normalizeThreadDraft(thread: DraftThread): DraftThread {
  return { ...thread, status: thread.status || "active", linked_tickets: thread.linked_tickets ?? [] };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Codex did not return JSON drafts.");
    return JSON.parse(match[0]);
  }
}

function validIds(ids: string[] | undefined, allowed: string[], warnings: string[], kind: string) {
  const allowedSet = new Set(allowed);
  const clean: string[] = [];
  for (const id of ids ?? []) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
      warnings.push(`Ignored malformed ${kind} id: ${id}`);
      continue;
    }
    if (!allowedSet.has(id)) {
      warnings.push(`Ignored unknown ${kind} id: ${id}`);
      continue;
    }
    clean.push(id);
  }
  return Array.from(new Set(clean));
}
