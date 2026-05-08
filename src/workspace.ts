import yaml from "js-yaml";
import { z } from "zod";
import {
  createDirAll,
  listDir,
  pathExists,
  readTextFile,
  writeTextFile,
} from "./tauri";
import type {
  LinkRecord,
  NoteRecord,
  ProjectConfig,
  RepoRef,
  ThreadRecord,
  Ticket,
  WaymarkProject,
  WorkspaceConfig,
  WorkspaceData,
} from "./types";

const workspaceSchema = z.object({
  version: z.number().default(1),
  name: z.string().min(1),
  projects_dir: z.string().min(1).default("projects"),
});

const repoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1).optional(),
  url: z.string().url().optional(),
}).refine((repo) => Boolean(repo.path || repo.url), {
  message: "Repo records need a path or url.",
  path: ["path"],
});

const projectSchema = z.object({
  version: z.number().default(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  status: z.enum(["active", "paused", "exploring", "archived"]),
  stage: z.enum(["idea", "spec", "prototype", "mvp", "alpha", "beta", "production"]),
  summary: z.string().min(1),
  current_focus: z.string().optional(),
  tags: z.array(z.string()).optional(),
  repos: z.array(repoSchema).optional(),
});

const ticketSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["idea", "now", "next", "later", "blocked", "done"]),
  priority: z.enum(["low", "medium", "high"]).optional(),
  summary: z.string().optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  linked_files: z.array(z.string()).optional(),
  linked_decisions: z.array(z.string()).optional(),
  linked_threads: z.array(z.string()).optional(),
  generated_prompts: z.array(z.string()).optional(),
});

const threadSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["codex", "claude", "chatgpt", "cursor", "other"]),
  title: z.string().min(1),
  status: z.enum(["active", "completed", "paused", "abandoned"]),
  url: z.string().nullable().optional(),
  summary_file: z.string().optional(),
  linked_tickets: z.array(z.string()).optional(),
});

const linkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  url: z.string().url().optional(),
  path: z.string().min(1).optional(),
  type: z.enum(["repo", "file", "deploy", "dashboard", "doc", "design", "service", "domain", "other"]),
  environment: z.enum(["production", "staging", "preview", "local", "other"]).optional(),
  include_in_handoff: z.boolean().optional(),
}).refine((link) => Boolean(link.url || link.path), {
  message: "Link records need a url or path.",
  path: ["path"],
});

const today = () => new Date().toISOString().slice(0, 10);

export type ProjectScaffoldItem = {
  label: string;
  path: string;
  kind: "file" | "directory";
};

export type RepoInstructionDraft = {
  repoId: string;
  repoName: string;
  repoPath: string;
  path: string;
  exists: boolean;
  contents: string;
};

export type HandoffContextKind = "standards" | "repo" | "file" | "decision" | "thread" | "link";

export type HandoffContextOption = {
  id: string;
  kind: HandoffContextKind;
  label: string;
  detail: string;
  reason: string;
  defaultIncluded: boolean;
};

const PROJECT_SCAFFOLD_ITEMS: ProjectScaffoldItem[] = [
  { label: "tickets.yaml", path: "tickets.yaml", kind: "file" },
  { label: "links.yaml", path: "links.yaml", kind: "file" },
  { label: "threads.yaml", path: "threads.yaml", kind: "file" },
  { label: "ideas/", path: "ideas", kind: "directory" },
  { label: "decisions/", path: "decisions", kind: "directory" },
  { label: "ai/prompts/", path: "ai/prompts", kind: "directory" },
  { label: "ai/thread-summaries/", path: "ai/thread-summaries", kind: "directory" },
];

const PROJECT_STANDARDS_CONTEXT_PATHS = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "docs/development-standards.md",
  "docs/ai-workflows.md",
  "docs/mvp-boundaries.md",
  "docs/mvp-exit-criteria.md",
  "docs/roadmap.md",
  "docs/release-policy.md",
  ".agent/rules/",
  ".agent/workflows/feature-handoff.md",
];

function isoDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

export function joinPath(...parts: string[]) {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/")
    .replace(":/", "://");
}

function dumpYaml(value: unknown) {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeRepoPath(path: string) {
  return path.trim().replace(/\/+$/, "");
}

function basename(path: string) {
  const parts = normalizeRepoPath(path).split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function fieldPath(parts: Array<string | number>) {
  if (!parts.length) return "(root)";
  return parts.reduce((path, part) => {
    if (typeof part === "number") return `${path}[${part}]`;
    return path ? `${path}.${part}` : part;
  }, "");
}

function zodWarnings(file: string, issues: z.ZodIssue[], prefix: Array<string | number> = []) {
  return issues.map((issue) => `${file}: ${fieldPath([...prefix, ...issue.path])}: ${issue.message}`);
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught);
}

function uniqueRepoId(baseId: string, repos: RepoRef[]) {
  const base = slugify(baseId) || "repo";
  const existing = new Set(repos.map((repo) => repo.id));
  if (!existing.has(base)) return base;

  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function parseYaml<T>(raw: string, fallback: T, source = "YAML"): T {
  try {
    const parsed = yaml.load(raw);
    return (parsed ?? fallback) as T;
  } catch (caught) {
    throw new Error(`${source}: invalid YAML: ${errorMessage(caught)}`);
  }
}

function frontmatter(raw: string, source = "Markdown frontmatter") {
  if (!raw.startsWith("---")) {
    return { meta: {}, body: raw.trim() };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { meta: {}, body: raw.trim() };
  }

  const meta = parseYaml<Record<string, unknown>>(raw.slice(3, end), {}, source);
  const body = raw.slice(end + 4).trim();
  return { meta, body };
}

function relativeProjectPath(projectPath: string, path: string) {
  const prefix = `${normalizeRepoPath(projectPath)}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

async function loadNotes(projectPath: string, type: "idea" | "decision") {
  const folder = joinPath(projectPath, type === "idea" ? "ideas" : "decisions");
  if (!(await pathExists(folder))) {
    return { notes: [], warnings: [] };
  }

  const entries = (await listDir(folder)).filter((entry) => !entry.is_dir && entry.name.endsWith(".md"));
  const notes: NoteRecord[] = [];
  const warnings: string[] = [];

  for (const entry of entries) {
    const raw = await readTextFile(entry.path);
    const file = relativeProjectPath(projectPath, entry.path);
    let meta: Record<string, unknown>;
    let body: string;
    try {
      ({ meta, body } = frontmatter(raw, `${file}: frontmatter`));
    } catch (caught) {
      warnings.push(errorMessage(caught));
      continue;
    }
    if (meta.linked_tickets !== undefined && !Array.isArray(meta.linked_tickets)) {
      warnings.push(`${file}: linked_tickets: Expected a list of ticket ids.`);
    }
    const titleFromBody = body.match(/^#\s+(.+)$/m)?.[1];
    notes.push({
      id: String(meta.id ?? entry.name.replace(/\.md$/, "")),
      type,
      title: String(meta.title ?? titleFromBody ?? entry.name.replace(/\.md$/, "")),
      path: entry.path,
      date: isoDate(meta.date),
      status: meta.status ? String(meta.status) : undefined,
      linked_tickets: Array.isArray(meta.linked_tickets)
        ? meta.linked_tickets.map(String)
        : [],
      body,
    });
  }

  return {
    notes: notes.sort((left, right) => (right.date ?? "").localeCompare(left.date ?? "")),
    warnings,
  };
}

async function loadRecordList<T>(
  projectPath: string,
  fileName: string,
  key: string,
  schema: z.ZodType<T>,
) {
  const filePath = joinPath(projectPath, fileName);
  if (!(await pathExists(filePath))) {
    return { records: [] as T[], warnings: [] as string[] };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml<unknown>(await readTextFile(filePath), {}, fileName);
  } catch (caught) {
    return { records: [] as T[], warnings: [errorMessage(caught)] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { records: [] as T[], warnings: [`${fileName}: (root): Expected a YAML object.`] };
  }

  const data = parsed as Record<string, unknown>;
  const warnings: string[] = [];
  if (data.version !== undefined && typeof data.version !== "number") {
    warnings.push(`${fileName}: version: Expected a number.`);
  }

  const rawRecords = data[key] ?? [];
  if (!Array.isArray(rawRecords)) {
    return { records: [] as T[], warnings: [...warnings, `${fileName}: ${key}: Expected a list.`] };
  }

  const records: T[] = [];
  rawRecords.forEach((record, index) => {
    const parsedRecord = schema.safeParse(record);
    if (parsedRecord.success) {
      records.push(parsedRecord.data);
      return;
    }
    warnings.push(...zodWarnings(fileName, parsedRecord.error.issues, [key, index]));
  });

  return { records, warnings };
}

function recordField(collection: string, id: string, field: string) {
  return `${collection}[id="${id}"].${field}`;
}

function needsReadinessDetails(ticket: Ticket) {
  return ["now", "next", "blocked"].includes(ticket.status);
}

function threadNeedsSummary(project: WaymarkProject, thread: ThreadRecord) {
  const ticketIds = new Set(project.tickets.map((ticket) => ticket.id));
  const linkedFromThread = (thread.linked_tickets ?? []).some((ticketId) => ticketIds.has(ticketId));
  const linkedFromTicket = project.tickets.some((ticket) => ticket.linked_threads?.includes(thread.id));
  return thread.status === "completed" || linkedFromThread || linkedFromTicket;
}

function validateProject(project: WaymarkProject) {
  const warnings = [...project.warnings];
  const { config } = project;
  const folderName = basename(project.rootPath);

  if (folderName && folderName !== config.slug) {
    warnings.push(`project.yaml: slug: Expected "${folderName}" to match the project folder.`);
  }
  if (!config.current_focus) warnings.push("project.yaml: current_focus: Missing current focus.");
  if (!config.repos?.length) warnings.push("project.yaml: repos: No linked repos.");
  if (!project.links.length) {
    warnings.push("links.yaml: links: No typed context records.");
  }
  if (!project.tickets.length) warnings.push("tickets.yaml: tickets: No local tickets.");
  const hasProductionContext = project.links.some((link) =>
    link.environment === "production" || link.id === "production" || link.type === "deploy",
  );
  if (["mvp", "alpha", "beta", "production"].includes(config.stage) && !hasProductionContext) {
    warnings.push("links.yaml: links: No production context.");
  }

  const ticketIds = new Set(project.tickets.map((ticket) => ticket.id));
  const decisionIds = new Set(project.decisions.map((decision) => decision.id));
  const threadIds = new Set(project.threads.map((thread) => thread.id));

  for (const ticket of project.tickets) {
    if (needsReadinessDetails(ticket)) {
      if (!ticket.summary) warnings.push(`tickets.yaml: ${recordField("tickets", ticket.id, "summary")}: Missing ticket summary.`);
      if (!ticket.acceptance_criteria?.length) {
        warnings.push(`tickets.yaml: ${recordField("tickets", ticket.id, "acceptance_criteria")}: No acceptance criteria.`);
      }
    }
    for (const decisionId of ticket.linked_decisions ?? []) {
      if (!decisionIds.has(decisionId)) {
        warnings.push(`tickets.yaml: ${recordField("tickets", ticket.id, "linked_decisions")}: Unknown decision id "${decisionId}".`);
      }
    }
    for (const threadId of ticket.linked_threads ?? []) {
      if (!threadIds.has(threadId)) {
        warnings.push(`tickets.yaml: ${recordField("tickets", ticket.id, "linked_threads")}: Unknown thread id "${threadId}".`);
      }
    }
  }

  for (const thread of project.threads) {
    if (!thread.summary_file && threadNeedsSummary(project, thread)) {
      warnings.push(`threads.yaml: ${recordField("threads", thread.id, "summary_file")}: Missing thread summary file.`);
    }
    for (const ticketId of thread.linked_tickets ?? []) {
      if (!ticketIds.has(ticketId)) {
        warnings.push(`threads.yaml: ${recordField("threads", thread.id, "linked_tickets")}: Unknown ticket id "${ticketId}".`);
      }
    }
  }

  for (const note of [...project.ideas, ...project.decisions]) {
    const file = relativeProjectPath(project.rootPath, note.path);
    for (const ticketId of note.linked_tickets ?? []) {
      if (!ticketIds.has(ticketId)) {
        warnings.push(`${file}: linked_tickets: Unknown ticket id "${ticketId}".`);
      }
    }
  }

  return warnings;
}

export async function loadWorkspace(rootPath: string): Promise<WorkspaceData> {
  const workspacePath = joinPath(rootPath, "waymark.yaml");
  if (!(await pathExists(workspacePath))) {
    throw new Error(`No waymark.yaml found at ${workspacePath}`);
  }

  const rawWorkspace = parseYaml<WorkspaceConfig>(
    await readTextFile(workspacePath),
    {
      version: 1,
      name: "Waymark",
      projects_dir: "projects",
    },
    "waymark.yaml",
  );
  const parsedWorkspace = workspaceSchema.safeParse(rawWorkspace);
  if (!parsedWorkspace.success) {
    throw new Error(zodWarnings("waymark.yaml", parsedWorkspace.error.issues).join(", "));
  }

  const config = parsedWorkspace.data;
  const projectsRoot = joinPath(rootPath, config.projects_dir);
  const projectDirs = (await listDir(projectsRoot)).filter((entry) => entry.is_dir);
  const projects: WaymarkProject[] = [];
  const warnings: string[] = [];

  for (const dir of projectDirs) {
    const projectYamlPath = joinPath(dir.path, "project.yaml");
    if (!(await pathExists(projectYamlPath))) {
      warnings.push(`Skipped ${dir.name}: missing project.yaml.`);
      continue;
    }

    let rawProject: ProjectConfig;
    try {
      rawProject = parseYaml<ProjectConfig>(
        await readTextFile(projectYamlPath),
        {} as ProjectConfig,
        `projects/${dir.name}/project.yaml`,
      );
    } catch (caught) {
      warnings.push(`Skipped ${dir.name}: ${errorMessage(caught)}`);
      continue;
    }
    const parsedProject = projectSchema.safeParse(rawProject);
    const projectWarnings: string[] = [];
    if (!parsedProject.success) {
      warnings.push(...zodWarnings(`projects/${dir.name}/project.yaml`, parsedProject.error.issues));
      continue;
    }

    const links = await loadRecordList<LinkRecord>(dir.path, "links.yaml", "links", linkSchema);
    const tickets = await loadRecordList<Ticket>(dir.path, "tickets.yaml", "tickets", ticketSchema);
    const threads = await loadRecordList<ThreadRecord>(dir.path, "threads.yaml", "threads", threadSchema);
    const ideas = await loadNotes(dir.path, "idea");
    const decisions = await loadNotes(dir.path, "decision");
    projectWarnings.push(...links.warnings, ...tickets.warnings, ...threads.warnings, ...ideas.warnings, ...decisions.warnings);

    const project: WaymarkProject = {
      rootPath: dir.path,
      config: parsedProject.data,
      links: links.records,
      tickets: tickets.records,
      threads: threads.records,
      ideas: ideas.notes,
      decisions: decisions.notes,
      warnings: projectWarnings,
    };

    project.warnings = validateProject(project);
    projects.push(project);
  }

  return {
    rootPath,
    config,
    projects: projects.sort((left, right) => left.config.name.localeCompare(right.config.name)),
    warnings,
  };
}

export async function createSampleWorkspace(rootPath: string) {
  const configPath = joinPath(rootPath, "waymark.yaml");
  if (await pathExists(configPath)) {
    throw new Error(`Workspace already exists at ${configPath}`);
  }

  await createDirAll(joinPath(rootPath, "projects", "glossa", "ai", "prompts"));
  await createDirAll(joinPath(rootPath, "projects", "glossa", "ai", "thread-summaries"));
  await createDirAll(joinPath(rootPath, "projects", "glossa", "ideas"));
  await createDirAll(joinPath(rootPath, "projects", "glossa", "decisions"));
  await createDirAll(joinPath(rootPath, "projects", "openclaw", "ai", "prompts"));
  await createDirAll(joinPath(rootPath, "projects", "openclaw", "ai", "thread-summaries"));
  await createDirAll(joinPath(rootPath, "projects", "openclaw", "ideas"));
  await createDirAll(joinPath(rootPath, "projects", "openclaw", "decisions"));

  await writeTextFile(
    configPath,
    dumpYaml({ version: 1, name: "Waymark Sample", projects_dir: "projects" }),
  );

  await writeTextFile(
    joinPath(rootPath, "projects", "glossa", "project.yaml"),
    dumpYaml({
      version: 1,
      name: "Glossa",
      slug: "glossa",
      status: "active",
      stage: "mvp",
      summary: "AI language learning app focused on daily reading, roleplay, and learner-friendly explanations.",
      current_focus: "Ship the daily reading MVP.",
      tags: ["ai", "language-learning", "mobile"],
      repos: [
        { id: "web", name: "Web app", path: "~/Code/glossa-web", url: "https://github.com/example/glossa-web" },
        { id: "mobile", name: "Mobile app", path: "~/Code/glossa-mobile", url: "https://github.com/example/glossa-mobile" },
      ],
    }),
  );

  await writeTextFile(
    joinPath(rootPath, "projects", "glossa", "tickets.yaml"),
    dumpYaml({
      version: 1,
      tickets: [
        {
          id: "daily-reading-mvp",
          title: "Daily reading MVP",
          status: "now",
          priority: "high",
          summary: "Build the first usable daily reading flow with saved progress and feedback.",
          acceptance_criteria: [
            "User can open today's reading.",
            "User can answer comprehension questions.",
            "Progress is saved locally or remotely.",
            "Errors are visible during QA.",
          ],
          linked_files: ["specs/daily-reading.md"],
          linked_decisions: ["mvp-reading-first"],
          linked_threads: ["codex-daily-reading"],
          generated_prompts: [],
        },
        {
          id: "article-import",
          title: "Article import flow",
          status: "next",
          priority: "medium",
          summary: "Let a learner import an article and turn it into a reading lesson.",
          acceptance_criteria: [],
          linked_files: [],
          linked_decisions: [],
          linked_threads: [],
          generated_prompts: [],
        },
      ],
    }),
  );

  await writeTextFile(
    joinPath(rootPath, "projects", "glossa", "links.yaml"),
    dumpYaml({
      version: 1,
      links: [
        {
          id: "production-app",
          label: "Production app",
          url: "https://glossa.app",
          type: "deploy",
          environment: "production",
          include_in_handoff: true,
        },
        {
          id: "design",
          label: "Design file",
          url: "https://figma.com/example",
          type: "design",
          include_in_handoff: true,
        },
        {
          id: "vercel",
          label: "Vercel production",
          url: "https://vercel.com/example/glossa",
          type: "deploy",
          environment: "production",
          include_in_handoff: true,
        },
        {
          id: "sentry",
          label: "Sentry project",
          url: "https://sentry.io/",
          type: "dashboard",
          environment: "production",
          include_in_handoff: false,
        },
        {
          id: "namecheap",
          label: "Namecheap registrar",
          url: "https://ap.www.namecheap.com/",
          type: "domain",
          environment: "production",
          include_in_handoff: false,
        },
        {
          id: "reading-spec",
          label: "Daily reading spec",
          path: "specs/daily-reading.md",
          type: "file",
          environment: "local",
          include_in_handoff: true,
        },
      ],
    }),
  );

  await writeTextFile(
    joinPath(rootPath, "projects", "glossa", "threads.yaml"),
    dumpYaml({
      version: 1,
      threads: [
        {
          id: "codex-daily-reading",
          provider: "codex",
          title: "Daily reading implementation brainstorm",
          status: "active",
          url: null,
          summary_file: "ai/thread-summaries/codex-daily-reading.md",
          linked_tickets: ["daily-reading-mvp"],
        },
      ],
    }),
  );

  await writeTextFile(
    joinPath(rootPath, "projects", "glossa", "ai", "thread-summaries", "codex-daily-reading.md"),
    "# Daily reading implementation brainstorm\n\nCodex explored the daily reading flow and recommended starting with a thin vertical slice: reading text, quiz, saved progress, and visible QA errors.\n",
  );

  await writeTextFile(
    joinPath(rootPath, "projects", "glossa", "decisions", "mvp-reading-first.md"),
    "---\nid: mvp-reading-first\ntitle: MVP reading first\ndate: 2026-04-29\nstatus: accepted\nlinked_tickets:\n  - daily-reading-mvp\n---\n\n# MVP reading first\n\nPrioritize the daily reading loop before roleplay or flashcards so the first release has one complete habit-forming workflow.\n",
  );

  await writeTextFile(
    joinPath(rootPath, "projects", "glossa", "ideas", "coach-voice.md"),
    "---\nid: coach-voice\ntitle: Coach voice experiments\ndate: 2026-04-29\nstatus: open\nlinked_tickets: []\n---\n\n# Coach voice experiments\n\nTry a warmer explanation tone that gives one grammar insight and one confidence-building note after every reading.\n",
  );

  await writeTextFile(
    joinPath(rootPath, "projects", "openclaw", "project.yaml"),
    dumpYaml({
      version: 1,
      name: "OpenClaw",
      slug: "openclaw",
      status: "exploring",
      stage: "prototype",
      summary: "Embeddable AI clone widget for product sites.",
      current_focus: "Define the widget API and demo embed flow.",
      tags: ["widget", "ai", "saas"],
      repos: [{ id: "widget", name: "Widget repo", path: "~/Code/openclaw", url: "https://github.com/example/openclaw" }],
    }),
  );

  await writeTextFile(
    joinPath(rootPath, "projects", "openclaw", "tickets.yaml"),
    dumpYaml({
      version: 1,
      tickets: [
        {
          id: "embed-api",
          title: "Widget embed API",
          status: "now",
          priority: "high",
          summary: "Design the script tag and initialization contract for hosted demos.",
          acceptance_criteria: ["A static HTML page can embed the widget.", "The widget accepts a public config object."],
          linked_files: [],
          linked_decisions: [],
          linked_threads: [],
          generated_prompts: [],
        },
      ],
    }),
  );

  await writeTextFile(joinPath(rootPath, "projects", "openclaw", "links.yaml"), dumpYaml({ version: 1, links: [] }));
  await writeTextFile(joinPath(rootPath, "projects", "openclaw", "threads.yaml"), dumpYaml({ version: 1, threads: [] }));
}

export async function createWorkspace(rootPath: string, name = "Waymark Workspace") {
  const configPath = joinPath(rootPath, "waymark.yaml");
  if (await pathExists(configPath)) {
    throw new Error(`Workspace already exists at ${configPath}`);
  }
  await createDirAll(joinPath(rootPath, "projects"));
  await writeTextFile(
    configPath,
    dumpYaml({ version: 1, name, projects_dir: "projects" }),
  );
}

export async function createProject(workspace: WorkspaceData, config: ProjectConfig) {
  const projectsDir = workspace.config.projects_dir || "projects";
  const projectRoot = joinPath(workspace.rootPath, projectsDir, config.slug);
  const projectYamlPath = joinPath(projectRoot, "project.yaml");
  if (await pathExists(projectYamlPath)) {
    throw new Error(`Project already exists at ${projectYamlPath}`);
  }

  await createDirAll(projectRoot);
  await createDirAll(joinPath(projectRoot, "ideas"));
  await createDirAll(joinPath(projectRoot, "decisions"));
  await createDirAll(joinPath(projectRoot, "ai", "prompts"));
  await createDirAll(joinPath(projectRoot, "ai", "thread-summaries"));
  await writeTextFile(joinPath(projectRoot, "project.yaml"), dumpYaml(config));
  await writeTextFile(joinPath(projectRoot, "tickets.yaml"), dumpYaml({ version: 1, tickets: [] }));
  await writeTextFile(joinPath(projectRoot, "links.yaml"), dumpYaml({ version: 1, links: [] }));
  await writeTextFile(joinPath(projectRoot, "threads.yaml"), dumpYaml({ version: 1, threads: [] }));
}

export async function missingProjectScaffold(project: WaymarkProject) {
  const missing: ProjectScaffoldItem[] = [];
  for (const item of PROJECT_SCAFFOLD_ITEMS) {
    if (!(await pathExists(joinPath(project.rootPath, item.path)))) {
      missing.push(item);
    }
  }
  return missing;
}

export async function saveProjectConfig(project: WaymarkProject, config: ProjectConfig) {
  await writeTextFile(joinPath(project.rootPath, "project.yaml"), dumpYaml(config));
}

export async function ensureProjectScaffold(project: WaymarkProject) {
  const missing = await missingProjectScaffold(project);
  for (const item of missing) {
    const path = joinPath(project.rootPath, item.path);
    if (item.kind === "directory") {
      await createDirAll(path);
    } else if (item.path === "tickets.yaml") {
      await writeTextFile(path, dumpYaml({ version: 1, tickets: [] }));
    } else if (item.path === "links.yaml") {
      await writeTextFile(path, dumpYaml({ version: 1, links: [] }));
    } else if (item.path === "threads.yaml") {
      await writeTextFile(path, dumpYaml({ version: 1, threads: [] }));
    }
  }
  return missing;
}

export async function addRepoToProject(project: WaymarkProject, repo: RepoRef) {
  const saved = await addReposToProject(project, [repo], []);
  return { repo: saved.repos[0], scaffolded: saved.scaffolded };
}

export async function addReposToProject(
  project: WaymarkProject,
  reposToAdd: RepoRef[],
  instructionDrafts: RepoInstructionDraft[] = [],
) {
  const repos = project.config.repos ?? [];
  const nextRepos = [...repos];
  const savedRepos: RepoRef[] = [];
  const seenPaths = new Set(
    repos
      .map((repo) => (repo.path ? normalizeRepoPath(repo.path) : null))
      .filter((path): path is string => Boolean(path)),
  );

  for (const repo of reposToAdd) {
    const cleanPath = repo.path ? normalizeRepoPath(repo.path) : undefined;
    const cleanUrl = repo.url?.trim();
    if (!repo.name.trim()) throw new Error("Repo name is required.");
    if (!cleanPath && !cleanUrl) throw new Error("Repo path or URL is required.");
    if (cleanUrl && !/^https?:\/\//.test(cleanUrl)) {
      throw new Error("Repo URL must start with http:// or https://.");
    }
    if (cleanPath && seenPaths.has(cleanPath)) {
      throw new Error(`Repo path is already linked to the project: ${cleanPath}`);
    }

    const cleanRepo: RepoRef = {
      id: uniqueRepoId(repo.id || repo.name || basename(cleanPath ?? cleanUrl ?? "repo"), nextRepos),
      name: repo.name.trim(),
      ...(cleanPath ? { path: cleanPath } : {}),
      ...(cleanUrl ? { url: cleanUrl } : {}),
    };

    if (cleanPath) seenPaths.add(cleanPath);
    nextRepos.push(cleanRepo);
    savedRepos.push(cleanRepo);
  }

  const scaffolded = await ensureProjectScaffold(project);
  await saveProjectConfig(project, {
    ...project.config,
    repos: nextRepos,
  });

  const writtenRepoFiles: RepoInstructionDraft[] = [];
  for (const draft of instructionDrafts) {
    if (draft.exists) continue;
    if (!savedRepos.some((repo) => repo.id === draft.repoId)) continue;
    await writeTextFile(draft.path, draft.contents);
    writtenRepoFiles.push(draft);
  }

  return { repos: savedRepos, scaffolded, writtenRepoFiles };
}

export async function buildRepoInstructionDraft(project: WaymarkProject, repo: RepoRef): Promise<RepoInstructionDraft | null> {
  const cleanPath = repo.path ? normalizeRepoPath(repo.path) : undefined;
  if (!cleanPath) return null;

  const path = joinPath(cleanPath, "AGENTS.md");
  const exists = await pathExists(path);
  const contents = `# AGENTS.md

This repository is linked from the Waymark project "${project.config.name}".

## Waymark Context

- Project: ${project.config.name}
- Summary: ${project.config.summary}
- Current focus: ${project.config.current_focus || "Not set"}
- Repo id: ${repo.id}
- Repo name: ${repo.name}

## Agent Workflow

1. Read this repo's local instructions first.
2. Check the Waymark workspace for current tickets, decisions, thread references, and generated handoff prompts before starting broad work.
3. Keep changes local-first and easy to inspect in Git.
4. Do not silently rewrite Waymark project memory. Record project state changes through Waymark's review-gated Markdown/YAML workflows.
`;

  return {
    repoId: repo.id,
    repoName: repo.name,
    repoPath: cleanPath,
    path,
    exists,
    contents,
  };
}

export async function buildRepoInstructionDrafts(project: WaymarkProject, repos: RepoRef[]) {
  const drafts = await Promise.all(repos.map((repo) => buildRepoInstructionDraft(project, repo)));
  return drafts.filter((draft): draft is RepoInstructionDraft => Boolean(draft));
}

export async function saveTickets(project: WaymarkProject, tickets: Ticket[]) {
  await writeTextFile(joinPath(project.rootPath, "tickets.yaml"), dumpYaml({ version: 1, tickets }));
}

export async function saveThreads(project: WaymarkProject, threads: ThreadRecord[]) {
  await writeTextFile(joinPath(project.rootPath, "threads.yaml"), dumpYaml({ version: 1, threads }));
}

export async function saveThreadSummary(project: WaymarkProject, title: string, body: string) {
  const id = slugify(title) || `codex-${Date.now()}`;
  const path = `ai/thread-summaries/${today()}-${id}.md`;
  await writeTextFile(joinPath(project.rootPath, path), `# ${title}\n\n${body.trim()}\n`);
  return path;
}

export async function saveLinks(project: WaymarkProject, links: LinkRecord[]) {
  await writeTextFile(joinPath(project.rootPath, "links.yaml"), dumpYaml({ version: 1, links }));
}

export function shouldIncludeContextInHandoff(link: LinkRecord) {
  if (typeof link.include_in_handoff === "boolean") return link.include_in_handoff;
  return ["repo", "file", "doc", "deploy", "design"].includes(link.type);
}

function addTicketReason(map: Map<string, Set<string>>, key: string, ticketId: string) {
  const ticketIds = map.get(key) ?? new Set<string>();
  ticketIds.add(ticketId);
  map.set(key, ticketIds);
}

function ticketReason(ticketIds: Set<string>) {
  return Array.from(ticketIds).sort().join(", ");
}

function linkValue(link: LinkRecord) {
  return link.url ?? link.path ?? link.type;
}

export function buildHandoffContextOptions(
  project: WaymarkProject,
  tickets: Ticket[],
): HandoffContextOption[] {
  if (tickets.length === 0) return [];

  const selectedTicketIds = new Set(tickets.map((ticket) => ticket.id));
  const options: HandoffContextOption[] = [
    {
      id: "standards",
      kind: "standards",
      label: "Project standards",
      detail: PROJECT_STANDARDS_CONTEXT_PATHS.join(", "),
      reason: "Canonical project standards from AGENTS.md, docs, and .agent rules.",
      defaultIncluded: true,
    },
  ];

  for (const repo of project.config.repos ?? []) {
    const detail = [repo.path ? `Local: ${repo.path}` : "", repo.url ? `URL: ${repo.url}` : ""]
      .filter(Boolean)
      .join(" · ");
    options.push({
      id: `repo:${repo.id}`,
      kind: "repo",
      label: repo.name,
      detail: detail || repo.id,
      reason: "Project repo reference from project.yaml.",
      defaultIncluded: true,
    });
  }

  const fileTickets = new Map<string, Set<string>>();
  const decisionTickets = new Map<string, Set<string>>();
  const threadTickets = new Map<string, Set<string>>();

  for (const ticket of tickets) {
    for (const file of ticket.linked_files ?? []) {
      addTicketReason(fileTickets, file, ticket.id);
    }
    for (const decisionId of ticket.linked_decisions ?? []) {
      addTicketReason(decisionTickets, decisionId, ticket.id);
    }
    for (const threadId of ticket.linked_threads ?? []) {
      addTicketReason(threadTickets, threadId, ticket.id);
    }
  }

  for (const decision of project.decisions) {
    for (const ticketId of decision.linked_tickets) {
      if (selectedTicketIds.has(ticketId)) addTicketReason(decisionTickets, decision.id, ticketId);
    }
  }

  for (const thread of project.threads) {
    for (const ticketId of thread.linked_tickets ?? []) {
      if (selectedTicketIds.has(ticketId)) addTicketReason(threadTickets, thread.id, ticketId);
    }
  }

  for (const [file, ticketIds] of fileTickets) {
    options.push({
      id: `file:${file}`,
      kind: "file",
      label: file,
      detail: "tickets.yaml linked_files",
      reason: `Linked file on selected ticket: ${ticketReason(ticketIds)}.`,
      defaultIncluded: true,
    });
  }

  for (const decision of project.decisions) {
    const ticketIds = decisionTickets.get(decision.id);
    if (!ticketIds) continue;
    options.push({
      id: `decision:${decision.id}`,
      kind: "decision",
      label: decision.title,
      detail: decision.path,
      reason: `Linked decision for selected ticket: ${ticketReason(ticketIds)}.`,
      defaultIncluded: true,
    });
  }

  for (const thread of project.threads) {
    const ticketIds = threadTickets.get(thread.id);
    if (!ticketIds) continue;
    options.push({
      id: `thread:${thread.id}`,
      kind: "thread",
      label: thread.title,
      detail: thread.summary_file ?? thread.url ?? thread.id,
      reason: `Linked AI thread reference for selected ticket: ${ticketReason(ticketIds)}.`,
      defaultIncluded: true,
    });
  }

  for (const link of project.links.filter(shouldIncludeContextInHandoff)) {
    const explicit = link.include_in_handoff === true;
    options.push({
      id: `link:${link.id}`,
      kind: "link",
      label: link.label,
      detail: linkValue(link),
      reason: explicit
        ? "Explicitly handoff-enabled Context record from links.yaml."
        : "Handoff-eligible Context record from links.yaml.",
      defaultIncluded: true,
    });
  }

  return options;
}

export async function createNote(
  project: WaymarkProject,
  type: "idea" | "decision",
  title: string,
  body: string,
  linkedTickets: string[],
) {
  const id = slugify(title);
  const folder = type === "idea" ? "ideas" : "decisions";
  const path = joinPath(project.rootPath, folder, `${id}.md`);
  const status = type === "idea" ? "open" : "accepted";
  const markdown = `---\nid: ${id}\ntitle: ${title}\ndate: ${today()}\nstatus: ${status}\nlinked_tickets:${linkedTickets.length ? `\n${linkedTickets.map((ticket) => `  - ${ticket}`).join("\n")}` : " []"}\n---\n\n# ${title}\n\n${body.trim()}\n`;
  await writeTextFile(path, markdown);
}

async function allocateGeneratedPromptPath(
  project: WaymarkProject,
  ticket: Ticket,
  reservedPaths = new Set<string>(),
) {
  const basePath = `ai/prompts/${today()}-${ticket.id}`;
  let suffix = 1;

  while (true) {
    const promptPath = `${basePath}${suffix === 1 ? "" : `-${suffix}`}.md`;
    if (!reservedPaths.has(promptPath) && !(await pathExists(joinPath(project.rootPath, promptPath)))) {
      reservedPaths.add(promptPath);
      return promptPath;
    }
    suffix += 1;
  }
}

export async function saveGeneratedPrompt(project: WaymarkProject, ticket: Ticket, prompt: string) {
  const promptPath = await allocateGeneratedPromptPath(project, ticket);
  await writeTextFile(joinPath(project.rootPath, promptPath), prompt);
  const tickets = project.tickets.map((candidate) =>
    candidate.id === ticket.id
      ? {
          ...candidate,
          generated_prompts: Array.from(new Set([...(candidate.generated_prompts ?? []), promptPath])),
        }
      : candidate,
  );
  await saveTickets(project, tickets);
  return promptPath;
}

export async function saveGeneratedPrompts(
  project: WaymarkProject,
  prompts: Array<{ ticket: Ticket; prompt: string }>,
) {
  const reservedPaths = new Set<string>();
  const saved: Array<{ ticketId: string; promptPath: string }> = [];
  for (const { ticket, prompt } of prompts) {
    const promptPath = await allocateGeneratedPromptPath(project, ticket, reservedPaths);
    await writeTextFile(joinPath(project.rootPath, promptPath), prompt);
    saved.push({ ticketId: ticket.id, promptPath });
  }

  const promptsByTicket = new Map<string, string[]>();
  for (const entry of saved) {
    promptsByTicket.set(entry.ticketId, [...(promptsByTicket.get(entry.ticketId) ?? []), entry.promptPath]);
  }
  const tickets = project.tickets.map((ticket) => {
    const promptPaths = promptsByTicket.get(ticket.id);
    if (!promptPaths?.length) return ticket;
    return {
      ...ticket,
      generated_prompts: Array.from(new Set([...(ticket.generated_prompts ?? []), ...promptPaths])),
    };
  });
  await saveTickets(project, tickets);
  return saved;
}

export function buildPrompt(project: WaymarkProject, ticket: Ticket, selectedContext: string[]) {
  const selected = new Set(selectedContext);
  const include = (bucketId: string, optionId: string) => selected.has(bucketId) || selected.has(optionId);
  const includeBucket = (bucketId: string) => selected.has(bucketId);

  const linkedDecisions = project.decisions.filter(
    (decision) =>
      ticket.linked_decisions?.includes(decision.id) ||
      decision.linked_tickets.includes(ticket.id),
  );
  const linkedThreads = project.threads.filter(
    (thread) =>
      ticket.linked_threads?.includes(thread.id) ||
      thread.linked_tickets?.includes(ticket.id),
  );
  const repos = project.config.repos ?? [];
  const selectedRepos = repos.filter((repo) => include("repos", `repo:${repo.id}`));
  const selectedFiles = (ticket.linked_files ?? []).filter((file) => include("files", `file:${file}`));
  const selectedDecisions = linkedDecisions.filter((decision) => include("decisions", `decision:${decision.id}`));
  const selectedThreads = linkedThreads.filter((thread) => include("threads", `thread:${thread.id}`));
  const selectedLinks = project.links
    .filter((link) => shouldIncludeContextInHandoff(link) && include("links", `link:${link.id}`))
    .map((link) => `${link.label} (${link.type})${link.url ? `: ${link.url}` : ""}${link.path ? `: ${link.path}` : ""}`);

  const sections = [
    `# Task: ${ticket.title}

## Goal

${ticket.summary || "Clarify and implement this ticket."}

## Project

${project.config.name}

${project.config.summary}

Current focus: ${project.config.current_focus || "Not set"}

## Acceptance Criteria

${ticket.acceptance_criteria?.length ? ticket.acceptance_criteria.map((item) => `- ${item}`).join("\n") : "- Add acceptance criteria before implementation if this is too vague."}`,
  ];

  if (selected.has("standards")) {
    sections.push(`## Project Standards

Review these standards before implementation when they exist in the target repo or workspace:

${PROJECT_STANDARDS_CONTEXT_PATHS.map((path) => `- ${path}`).join("\n")}`);
  }

  if (includeBucket("repos") || selectedRepos.length > 0) {
    sections.push(`## Repositories

${selectedRepos.length ? selectedRepos.map((repo) => `- ${repo.name} (${repo.id})${repo.path ? `\n  - Local: ${repo.path}` : ""}${repo.url ? `\n  - URL: ${repo.url}` : ""}`).join("\n") : "- No linked repos."}`);
  }

  if (includeBucket("files") || selectedFiles.length > 0) {
    sections.push(`## Relevant Files

${selectedFiles.length ? selectedFiles.map((file) => `- ${file}`).join("\n") : "- No linked files were provided."}`);
  }

  if (includeBucket("decisions") || selectedDecisions.length > 0) {
    sections.push(`## Linked Decisions

${selectedDecisions.length ? selectedDecisions.map((decision) => `### ${decision.title}\n\n${decision.body}`).join("\n\n") : "- No linked decisions."}`);
  }

  if (includeBucket("threads") || selectedThreads.length > 0) {
    sections.push(`## AI Thread References

${selectedThreads.length ? selectedThreads.map((thread) => `- ${thread.title} (${thread.provider}, ${thread.status})${thread.url ? `: ${thread.url}` : ""}${thread.summary_file ? `\n  - Summary: ${thread.summary_file}` : ""}`).join("\n") : "- No linked thread references."}`);
  }

  if (includeBucket("links") || selectedLinks.length > 0) {
    sections.push(`## Project Context

${selectedLinks.length ? selectedLinks.map((link) => `- ${link}`).join("\n") : "- No important project context."}`);
  }

  sections.push(`## Instructions

- Make the smallest reasonable change.
- Follow the existing project conventions.
- Ask before broad refactors.
- Add or update tests when appropriate.
- Update relevant Waymark notes, tickets, or decisions if behavior changes.
- When done, summarize changed files, verification, and any follow-up tasks.`);

  return `${sections.join("\n\n")}\n`;
}

/**
 * Build an in-memory workspace for visual development without Tauri.
 * Used by `App.tsx` when `?demo=1` is present in the URL.
 */
export function buildDemoWorkspace(): WorkspaceData {
  const rootPath = "/demo/sample-workspace";
  const glossa: WaymarkProject = {
    rootPath: `${rootPath}/projects/glossa`,
    config: {
      version: 1,
      name: "Glossa",
      slug: "glossa",
      status: "active",
      stage: "mvp",
      summary:
        "AI language learning app focused on daily reading, roleplay, and learner-friendly explanations.",
      current_focus: "Ship the daily reading MVP.",
      tags: ["ai", "language-learning", "mobile"],
      repos: [
        { id: "web", name: "Web app", path: "~/Code/glossa-web", url: "https://github.com/example/glossa-web" },
        { id: "mobile", name: "Mobile app", path: "~/Code/glossa-mobile", url: "https://github.com/example/glossa-mobile" },
      ],
    },
    links: [
      {
        id: "production-app",
        label: "Production app",
        url: "https://glossa.app",
        type: "deploy",
        environment: "production",
        include_in_handoff: true,
      },
      {
        id: "design",
        label: "Design file",
        url: "https://figma.com/example",
        type: "design",
        include_in_handoff: true,
      },
      {
        id: "vercel",
        label: "Vercel production",
        url: "https://vercel.com/example/glossa",
        type: "deploy",
        environment: "production",
        include_in_handoff: true,
      },
      {
        id: "namecheap",
        label: "Namecheap registrar",
        url: "https://ap.www.namecheap.com/",
        type: "domain",
        environment: "production",
        include_in_handoff: false,
      },
      {
        id: "reading-spec",
        label: "Daily reading spec",
        path: "specs/daily-reading.md",
        type: "file",
        environment: "local",
        include_in_handoff: true,
      },
      {
        id: "sentry",
        label: "Sentry project",
        url: "https://sentry.io/",
        type: "service",
        environment: "production",
        include_in_handoff: false,
      },
    ],
    tickets: [
      {
        id: "daily-reading-mvp",
        title: "Daily reading MVP",
        status: "now",
        priority: "high",
        summary: "Build the first usable daily reading flow with saved progress and feedback.",
        acceptance_criteria: [
          "User can open today's reading.",
          "User can answer comprehension questions.",
          "Progress is saved locally or remotely.",
          "Errors are visible during QA.",
        ],
        linked_files: ["specs/daily-reading.md"],
        linked_decisions: ["mvp-reading-first"],
        linked_threads: ["codex-daily-reading"],
        generated_prompts: [],
      },
      {
        id: "article-import",
        title: "Article import flow",
        status: "next",
        priority: "medium",
        summary: "Let a learner import an article and turn it into a reading lesson.",
        acceptance_criteria: [],
        linked_files: [],
        linked_decisions: [],
        linked_threads: [],
        generated_prompts: [],
      },
    ],
    threads: [
      {
        id: "codex-daily-reading",
        provider: "codex",
        title: "Daily reading implementation brainstorm",
        status: "active",
        summary_file: "ai/thread-summaries/codex-daily-reading.md",
        linked_tickets: ["daily-reading-mvp"],
      },
    ],
    ideas: [
      {
        id: "coach-voice",
        type: "idea",
        title: "Coach voice experiments",
        path: `${rootPath}/projects/glossa/ideas/coach-voice.md`,
        date: "2026-04-29",
        status: "open",
        linked_tickets: [],
        body: "Try a warmer explanation tone.",
      },
    ],
    decisions: [
      {
        id: "mvp-reading-first",
        type: "decision",
        title: "MVP reading first",
        path: `${rootPath}/projects/glossa/decisions/mvp-reading-first.md`,
        date: "2026-04-29",
        status: "accepted",
        linked_tickets: ["daily-reading-mvp"],
        body: "Prioritize the daily reading loop before roleplay or flashcards.",
      },
    ],
    warnings: ['tickets.yaml: tickets[id="article-import"].acceptance_criteria: No acceptance criteria.'],
  };
  const openclaw: WaymarkProject = {
    rootPath: `${rootPath}/projects/openclaw`,
    config: {
      version: 1,
      name: "OpenClaw",
      slug: "openclaw",
      status: "exploring",
      stage: "prototype",
      summary: "Embeddable AI clone widget for product sites.",
      current_focus: "Define the widget API and demo embed flow.",
      tags: ["widget", "ai", "saas"],
      repos: [{ id: "widget", name: "Widget repo", path: "~/Code/openclaw" }],
    },
    links: [],
    tickets: [
      {
        id: "embed-api",
        title: "Widget embed API",
        status: "now",
        priority: "high",
        summary: "Design the script tag and initialization contract for hosted demos.",
        acceptance_criteria: [
          "A static HTML page can embed the widget.",
          "The widget accepts a public config object.",
        ],
        linked_files: [],
        linked_decisions: [],
        linked_threads: [],
        generated_prompts: [],
      },
    ],
    threads: [],
    ideas: [],
    decisions: [],
    warnings: ["links.yaml: links: No typed context records."],
  };
  return {
    rootPath,
    config: { version: 1, name: "Waymark Sample", projects_dir: "projects" },
    projects: [glossa, openclaw],
    warnings: [],
  };
}

export function ticketWarnings(project: WaymarkProject, ticket: Ticket) {
  const warnings: string[] = [];
  if (needsReadinessDetails(ticket)) {
    if (!ticket.summary) warnings.push("Missing ticket summary.");
    if (!ticket.acceptance_criteria?.length) warnings.push("Missing acceptance criteria.");
  }
  if (!project.config.repos?.length) warnings.push("Project has no linked repos.");
  if (!ticket.linked_files?.length) warnings.push("No linked files.");
  if (!ticket.linked_decisions?.length) warnings.push("No linked decisions.");
  if (!ticket.linked_threads?.length) warnings.push("No linked AI threads.");
  return warnings;
}
