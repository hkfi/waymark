export type ProjectStatus = "active" | "paused" | "exploring" | "archived";
export type ProjectStage = "idea" | "spec" | "prototype" | "mvp" | "alpha" | "beta" | "production";
export type TicketStatus = "idea" | "now" | "next" | "later" | "blocked" | "done";
export type Priority = "low" | "medium" | "high";

export interface WorkspaceConfig {
  version: number;
  name: string;
  projects_dir: string;
}

export interface RepoRef {
  id: string;
  name: string;
  path?: string;
  url?: string;
}

export interface ProjectConfig {
  version: number;
  name: string;
  slug: string;
  status: ProjectStatus;
  stage: ProjectStage;
  summary: string;
  current_focus?: string;
  tags?: string[];
  repos?: RepoRef[];
  links?: Record<string, string>;
}

export interface LinkRecord {
  id: string;
  label: string;
  url: string;
  type: "repo" | "deploy" | "dashboard" | "doc" | "design" | "other";
  environment?: "production" | "staging" | "preview" | "local" | "other";
}

export interface Ticket {
  id: string;
  title: string;
  status: TicketStatus;
  priority?: Priority;
  summary?: string;
  acceptance_criteria?: string[];
  linked_files?: string[];
  linked_decisions?: string[];
  linked_threads?: string[];
  generated_prompts?: string[];
}

export interface ThreadRecord {
  id: string;
  provider: "codex" | "claude" | "chatgpt" | "cursor" | "other";
  title: string;
  status: "active" | "completed" | "paused" | "abandoned";
  url?: string | null;
  summary_file?: string;
  linked_tickets?: string[];
}

export interface NoteRecord {
  id: string;
  type: "idea" | "decision";
  title: string;
  path: string;
  date?: string;
  status?: string;
  linked_tickets: string[];
  body: string;
}

export interface WaymarkProject {
  rootPath: string;
  config: ProjectConfig;
  links: LinkRecord[];
  tickets: Ticket[];
  threads: ThreadRecord[];
  ideas: NoteRecord[];
  decisions: NoteRecord[];
  warnings: string[];
}

export interface WorkspaceData {
  rootPath: string;
  config: WorkspaceConfig;
  projects: WaymarkProject[];
  warnings: string[];
}
