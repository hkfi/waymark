import type { LinkRecord, WaymarkProject } from "./types";
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
        source: "ticket" as const,
      })),
    ),
  ];
}
