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
}

export interface LinkRecord {
  id: string;
  label: string;
  url?: string;
  path?: string;
  type: "repo" | "file" | "deploy" | "dashboard" | "doc" | "design" | "service" | "domain" | "other";
  environment?: "production" | "staging" | "preview" | "local" | "other";
  include_in_handoff?: boolean;
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

export type AppUpdateStatus = "unsupported" | "idle" | "checking" | "available" | "installing" | "restarting" | "error";

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string | null;
  version: string | null;
  notes: string | null;
  progress: number | null;
  error: string | null;
}

export type CodexConnectionState = "unavailable" | "needsLogin" | "ready" | "running" | "errored";
export type CodexRoute = "app-server" | "app-server-fallback" | "cli" | "unavailable";

export interface CodexStatus {
  state: CodexConnectionState;
  path: string | null;
  detail: string;
}

export interface WaymarkAssistantMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  route: CodexRoute;
  status: "sending" | "complete" | "error";
  timestamp: string;
}

export interface DraftTicket {
  id?: string;
  title: string;
  status: TicketStatus;
  priority?: Priority;
  summary?: string;
  acceptance_criteria?: string[];
  linked_files?: string[];
  linked_decisions?: string[];
  linked_threads?: string[];
}

export interface DraftNote {
  title: string;
  body: string;
  linked_tickets?: string[];
}

export interface DraftThread {
  title: string;
  status: ThreadRecord["status"];
  url?: string | null;
  summary?: string;
  linked_tickets?: string[];
}

export interface WaymarkDraftSet {
  summary: string;
  source: "codex" | "pasted";
  tickets: DraftTicket[];
  ideas: DraftNote[];
  decisions: DraftNote[];
  threads: DraftThread[];
  warnings: string[];
}

export interface CodexRunRequest {
  projectSlug: string;
  taskMode: "brainstorm" | "structure" | "capture";
  userPrompt: string;
  selectedContextIds: string[];
  routePreference: "app-server" | "cli" | "auto";
}
