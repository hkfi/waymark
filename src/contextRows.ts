import type { LinkRecord, RepoRef, Ticket, WaymarkProject } from "./types";
import { resolveProjectPath } from "./app/model";
import { shouldIncludeContextInHandoff } from "./workspace";

export type ContextRowSource = "project" | "link" | "ticket";

export type ContextRow = {
  kind: string;
  id: string;
  label: string;
  value: string;
  actionPath?: string;
  includeInHandoff?: boolean;
  link?: LinkRecord;
  repo?: RepoRef;
  ticket?: Ticket;
  source: ContextRowSource;
};

export function contextRowKey(row: ContextRow) {
  return `${row.source}-${row.kind}-${row.id}-${row.value}`;
}

export function contextRows(project: WaymarkProject): ContextRow[] {
  return [
    ...(project.config.repos ?? []).map((repo) => ({
      kind: "repo",
      id: repo.id,
      label: repo.name,
      value: repo.path ?? repo.url ?? repo.name,
      actionPath: repo.path ?? repo.url,
      includeInHandoff: true,
      repo,
      source: "project" as const,
    })),
    ...project.links.map((link) => ({
      kind: link.type,
      id: link.id,
      label: link.label,
      value: link.url ?? link.path ?? "",
      actionPath: link.url ?? (link.path ? resolveProjectPath(project, link.path) : undefined),
      includeInHandoff: shouldIncludeContextInHandoff(link),
      link,
      source: "link" as const,
    })),
    ...project.tickets.flatMap((ticket) =>
      (ticket.linked_files ?? []).map((file) => ({
        kind: "ticket file",
        id: ticket.id,
        label: ticket.title,
        value: file,
        actionPath: resolveProjectPath(project, file),
        includeInHandoff: true,
        ticket,
        source: "ticket" as const,
      })),
    ),
  ];
}

export function contextRowRemoveLabel(row: ContextRow) {
  if (row.source === "project") return "Remove repo reference";
  if (row.source === "ticket") return "Unlink file";
  return "Delete context item";
}

export function contextRowRemoveConfirmation(row: ContextRow) {
  if (row.source === "project") {
    return `Remove repo reference "${row.label}" from project.yaml? This does not delete the repository folder.`;
  }
  if (row.source === "ticket") {
    return `Unlink "${row.value}" from ticket "${row.label}"? This does not delete the file.`;
  }
  return `Delete context item "${row.label}" from links.yaml? This does not delete the target path or URL.`;
}
