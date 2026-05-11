import { z } from "zod";
import type { DraftNote, DraftThread, DraftTicket, NoteRecord, ThreadRecord, Ticket, TicketStatus, WaymarkDraftSet, WaymarkProject } from "./types";

const ticketStatus = z.enum(["idea", "now", "next", "later", "blocked", "done"]);
const priority = z.enum(["low", "medium", "high"]);
const threadStatus = z.enum(["active", "completed", "paused", "abandoned"]);

const draftTicket = z.object({
  id: z.string().optional(),
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
        required: ["id", "title", "status", "priority", "summary", "acceptance_criteria", "linked_files", "linked_decisions", "linked_threads"],
        properties: {
          id: { type: "string" },
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

export type AssistantMode = "brainstorm" | "structure" | "capture";
export type AssistantLaunchMode = Exclude<AssistantMode, "capture">;
export type AssistantLaunchRequest = {
  id: string;
  mode: AssistantLaunchMode;
  prompt: string;
  notice?: string;
  autoRun?: boolean;
  actionLabel?: string;
  explanation?: string;
};
export type AssistantLaunchInput = Omit<AssistantLaunchRequest, "id">;

export type AssistantContextSelection = {
  ticket?: Ticket | null;
  thread?: ThreadRecord | null;
  note?: NoteRecord | null;
  bundle?: string[];
};

export function buildAssistantPrompt(
  project: WaymarkProject,
  userPrompt: string,
  mode: AssistantMode,
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
      acceptance_criteria: ticket.acceptance_criteria ?? [],
      linked_files: ticket.linked_files ?? [],
      linked_decisions: ticket.linked_decisions ?? [],
      linked_threads: ticket.linked_threads ?? [],
    })),
    links: project.links.map((link) => ({
      id: link.id,
      label: link.label,
      type: link.type,
      path: link.path ?? "",
      url: link.url ?? "",
      include_in_handoff: link.include_in_handoff,
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
            acceptance_criteria: selection.ticket.acceptance_criteria ?? [],
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

Produce concise, reviewable Waymark drafts. Prefer fewer high-quality records over many speculative records. Use existing ticket, decision, and thread IDs only when they clearly apply. For ticket drafts, set id to an existing ticket id only when the draft should update that ticket; otherwise set id to an empty string.`;
}

export type TicketRecommendationTarget = "summary" | "acceptance" | "next-steps";

export function buildTicketRecommendationPrompt(ticket: Ticket, target: TicketRecommendationTarget) {
  const currentAcceptance = ticket.acceptance_criteria?.length
    ? ticket.acceptance_criteria.map((item) => `- ${item}`).join("\n")
    : "(empty)";
  const currentSummary = ticket.summary?.trim() || "(empty)";
  const base = `Selected ticket:
- id: ${ticket.id}
- title: ${ticket.title}
- status: ${ticket.status}
- priority: ${ticket.priority ?? "medium"}
- current summary: ${currentSummary}
- current acceptance criteria:
${currentAcceptance}

Return structured Waymark drafts. If you recommend changing the selected ticket, include a ticket draft with id "${ticket.id}" so Waymark updates that ticket in the review flow. For any new ticket draft, set id to an empty string. Do not invent IDs for new tickets. Preserve useful linked files, decisions, and threads from the selected ticket when relevant.`;

  if (target === "summary") {
    return `${base}

Recommend a clearer ticket summary for the selected ticket. Keep it concise, implementation-oriented, and useful for a future Codex handoff. Include acceptance criteria only if you see an obvious missing check.`;
  }

  if (target === "acceptance") {
    return `${base}

Draft crisp acceptance criteria for the selected ticket. Prefer concrete observable checks over vague quality statements. Keep the existing summary unless it needs a small clarification.`;
  }

  return `${base}

Suggest the next useful moves for this ticket. Prefer several scoped options with short rationale. Use ticket drafts for concrete work, decision drafts for product or architecture choices, and idea drafts for things worth parking.`;
}

export function buildNoteRecommendationPrompt(note: NoteRecord) {
  return `Selected ${note.type}:
- id: ${note.id}
- title: ${note.title}
- status: ${note.status ?? "open"}
- linked tickets: ${note.linked_tickets.length ? note.linked_tickets.join(", ") : "(none)"}

Body:
${note.body || "(empty)"}

Return structured Waymark drafts that turn this ${note.type} into useful project memory. Prefer candidate tickets, follow-up decisions, or concise ideas. Link to existing ticket IDs only when they clearly apply. For new ticket drafts, set id to an empty string. Do not invent IDs for new tickets.`;
}

export function buildProjectNextStepsPrompt(project: WaymarkProject) {
  const repoSummary = project.config.repos?.length
    ? project.config.repos.map((repo) => `- ${repo.name} (${repo.id})${repo.path ? ` at ${repo.path}` : ""}${repo.url ? `, ${repo.url}` : ""}`).join("\n")
    : "- No linked repos yet.";
  const contextSummary = project.links.length
    ? project.links.map((link) => `- ${link.label} (${link.type})`).join("\n")
    : "- No typed context records yet.";

  return `Suggest practical next steps for this Waymark project.

Project:
- name: ${project.config.name}
- stage: ${project.config.stage}
- status: ${project.config.status}
- summary: ${project.config.summary}
- current focus: ${project.config.current_focus || "(not set)"}

Linked repos:
${repoSummary}

Typed context:
${contextSummary}

Return structured Waymark drafts for the next useful project-memory records. Prefer:
- 3 to 5 concrete tickets with clear summaries and acceptance criteria
- 1 or 2 decision drafts if the direction is ambiguous
- concise ideas only for things worth parking

For new ticket drafts, set id to an empty string. Do not invent IDs. Keep the output reviewable and avoid asking Waymark to scan whole repositories.`;
}

export function parseDraftSet(raw: string, source: WaymarkDraftSet["source"], project: WaymarkProject): WaymarkDraftSet {
  const parsed = draftSetSchema.parse(parseJson(raw));
  const warnings = [...parsed.warnings];

  const tickets = parsed.tickets.map((ticket) => ({
    ...ticket,
    id: validExistingTicketId(ticket.id, project.tickets.map((candidate) => candidate.id), warnings),
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

function validExistingTicketId(id: string | undefined, allowed: string[], warnings: string[]) {
  if (!id) return undefined;
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
    warnings.push(`Ignored malformed ticket id: ${id}`);
    return undefined;
  }
  if (!allowed.includes(id)) {
    warnings.push(`Ignored unknown ticket id for update: ${id}`);
    return undefined;
  }
  return id;
}
