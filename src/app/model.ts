import type {
  Priority,
  ThreadRecord,
  Ticket,
  TicketStatus,
  WaymarkProject,
  WorkspaceData,
} from "../types";

export type NavId = "home" | "tickets" | "memory" | "context";
export type InspectorMode = "ticket" | "prompt" | "assistant" | "thread" | "note";
export type Lane = "now" | "next" | "later" | "blocked" | "done";
export type CaptureKind = "ticket" | "idea" | "decision" | "thread";
export type FileModalMode = "file" | "link";
export type CapturePayload =
  | {
      kind: "ticket";
      title: string;
      status: TicketStatus;
      priority: Priority;
      summary: string;
      acceptanceCriteria: string;
      linkedFiles: string;
      linkedDecisions: string;
      linkedThreads: string;
    }
  | {
      kind: "idea" | "decision";
      title: string;
      summary: string;
      body: string;
      linkedTickets: string;
    }
  | {
      kind: "thread";
      title: string;
      provider: ThreadRecord["provider"];
      threadStatus: ThreadRecord["status"];
      url: string;
      summaryFile: string;
      linkedTickets: string;
    };

export const LANES_IN_QUEUE: Lane[] = ["now", "next", "blocked", "later"];
export const LANE_LABEL: Record<Lane, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
  blocked: "Blocked",
  done: "Done",
};
export const PROJECT_PALETTE = [
  "oklch(0.78 0.135 75)",
  "oklch(0.74 0.13 150)",
  "oklch(0.74 0.11 235)",
  "oklch(0.74 0.12 295)",
  "oklch(0.62 0.005 250)",
];
export const defaultWorkspacePath = "~/Documents/Waymark Sample Workspace";
export const LAST_WORKSPACE_PATH_KEY = "waymark:last-workspace-path";
export const SELECTED_PROJECT_PREFIX = "waymark:selected-project:";
export const LEFT_WIDTH_KEY = "waymark:left-sidebar-width";
export const RIGHT_WIDTH_KEY = "waymark:right-inspector-width";
export const LEFT_WIDTH_DEFAULT = 240;
export const RIGHT_WIDTH_DEFAULT = 380;
export const LEFT_WIDTH_MIN = 188;
export const LEFT_WIDTH_MAX = 360;
export const RIGHT_WIDTH_MIN = 300;
export const RIGHT_WIDTH_MAX = 560;

/* -------------------------------- utils --------------------------------- */

export function projectColor(slug: string, index: number) {
  if (slug.toLowerCase().startsWith("waymark")) return PROJECT_PALETTE[0];
  return PROJECT_PALETTE[index % PROJECT_PALETTE.length];
}
export function projectMark(slug: string) {
  return slug.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
}
export function projectStatusKind(project: WaymarkProject): "warn" | "ok" | "idle" {
  if (project.config.status === "paused" || project.config.status === "archived") return "idle";
  if (project.warnings.length > 0) return "warn";
  return "ok";
}
export function activeLane(status: TicketStatus): Lane | null {
  if (status === "idea") return null;
  return status as Lane;
}
export function projectFile(project: WaymarkProject, ticket: Ticket) {
  if (ticket.linked_files?.length) return ticket.linked_files[0];
  return `${project.config.slug}/tickets/${ticket.id}.yaml`;
}
export function resolveProjectPath(project: WaymarkProject, path: string) {
  if (/^(https?:|file:|\/|~\/)/.test(path)) return path;
  return `${project.rootPath}/${path}`;
}
export function ticketHasFlag(ticket: Ticket, kind: "ac" | "decision" | "thread") {
  if (kind === "ac") return (ticket.acceptance_criteria?.length ?? 0) > 0;
  if (kind === "decision") return (ticket.linked_decisions?.length ?? 0) > 0;
  return (ticket.linked_threads?.length ?? 0) > 0;
}
export function matchesSearch(values: Array<string | undefined | null>, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}
export function recordId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `item-${Date.now()}`
  );
}
export function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
export function storedWidth(key: string, fallback: number, min: number, max: number) {
  if (typeof window === "undefined") return fallback;
  const value = Number(window.localStorage.getItem(key));
  if (!Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}
export function addPromptPath(ticket: Ticket, promptPath: string): Ticket {
  return {
    ...ticket,
    generated_prompts: Array.from(new Set([...(ticket.generated_prompts ?? []), promptPath])),
  };
}
export function tokenEstimate(prompt: string) {
  return Math.max(120, Math.round(prompt.length / 4));
}

export type Activity = { t: string; kind: string; proj: string; text: string };

export function buildActivity(workspace: WorkspaceData, project: WaymarkProject | null): Activity[] {
  const rows: Activity[] = [];
  const slug = project?.config.slug ?? "";
  for (const decision of project?.decisions.slice(0, 2) ?? []) {
    rows.push({ t: decision.date ?? "—", kind: "decision", proj: projectMark(slug), text: decision.title });
  }
  for (const thread of (project?.threads ?? []).slice(0, 2)) {
    rows.push({ t: thread.status, kind: "thread", proj: projectMark(slug), text: thread.title });
  }
  for (const ticket of (project?.tickets ?? []).slice(0, 3)) {
    rows.push({ t: ticket.status, kind: ticket.status, proj: projectMark(slug), text: ticket.title });
  }
  if (rows.length === 0) {
    for (const proj of workspace.projects.slice(0, 4)) {
      rows.push({
        t: proj.config.stage,
        kind: "ticket",
        proj: projectMark(proj.config.slug),
        text: proj.config.current_focus || proj.config.summary,
      });
    }
  }
  return rows.slice(0, 6);
}
