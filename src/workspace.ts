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
  ThreadRecord,
  Ticket,
  WaymarkProject,
  WorkspaceConfig,
  WorkspaceData,
} from "./types";

const workspaceSchema = z.object({
  version: z.number().default(1),
  name: z.string().min(1),
  projects_dir: z.string().default("projects"),
});

const repoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().optional(),
  url: z.string().url().optional(),
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
  links: z.record(z.string()).optional(),
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
  url: z.string().url(),
  type: z.enum(["repo", "deploy", "dashboard", "doc", "design", "other"]),
  environment: z.enum(["production", "staging", "preview", "local", "other"]).optional(),
});

const today = () => new Date().toISOString().slice(0, 10);

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

function parseYaml<T>(raw: string, fallback: T): T {
  const parsed = yaml.load(raw);
  return (parsed ?? fallback) as T;
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

function frontmatter(raw: string) {
  if (!raw.startsWith("---")) {
    return { meta: {}, body: raw.trim() };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { meta: {}, body: raw.trim() };
  }

  const meta = parseYaml<Record<string, unknown>>(raw.slice(3, end), {});
  const body = raw.slice(end + 4).trim();
  return { meta, body };
}

async function readYamlIfPresent<T>(path: string, fallback: T) {
  if (!(await pathExists(path))) {
    return fallback;
  }

  return parseYaml<T>(await readTextFile(path), fallback);
}

async function loadNotes(projectPath: string, type: "idea" | "decision") {
  const folder = joinPath(projectPath, type === "idea" ? "ideas" : "decisions");
  if (!(await pathExists(folder))) {
    return [];
  }

  const entries = (await listDir(folder)).filter((entry) => !entry.is_dir && entry.name.endsWith(".md"));
  const notes: NoteRecord[] = [];

  for (const entry of entries) {
    const raw = await readTextFile(entry.path);
    const { meta, body } = frontmatter(raw);
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

  return notes.sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""));
}

function validateProject(project: WaymarkProject) {
  const warnings = [...project.warnings];
  const { config } = project;

  if (!config.current_focus) warnings.push("Project is missing a current focus.");
  if (!config.repos?.length) warnings.push("Project has no linked repos.");
  if (!Object.keys(config.links ?? {}).length && !project.links.length) warnings.push("Project has no important links.");
  if (!project.tickets.length) warnings.push("Project has no local tickets.");
  if (["mvp", "alpha", "beta", "production"].includes(config.stage) && !config.links?.production) {
    warnings.push("Project has no production link.");
  }

  for (const ticket of project.tickets) {
    if (!ticket.summary) warnings.push(`Ticket "${ticket.title}" is missing a summary.`);
    if (!ticket.acceptance_criteria?.length) {
      warnings.push(`Ticket "${ticket.title}" has no acceptance criteria.`);
    }
  }

  for (const thread of project.threads) {
    if (!thread.summary_file) warnings.push(`Thread "${thread.title}" has no summary file.`);
  }

  return warnings;
}

export async function loadWorkspace(rootPath: string): Promise<WorkspaceData> {
  const workspacePath = joinPath(rootPath, "waymark.yaml");
  if (!(await pathExists(workspacePath))) {
    throw new Error(`No waymark.yaml found at ${workspacePath}`);
  }

  const rawWorkspace = parseYaml<WorkspaceConfig>(await readTextFile(workspacePath), {
    version: 1,
    name: "Waymark",
    projects_dir: "projects",
  });
  const parsedWorkspace = workspaceSchema.safeParse(rawWorkspace);
  if (!parsedWorkspace.success) {
    throw new Error(parsedWorkspace.error.issues.map((issue) => issue.message).join(", "));
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

    const rawProject = parseYaml<ProjectConfig>(await readTextFile(projectYamlPath), {} as ProjectConfig);
    const parsedProject = projectSchema.safeParse(rawProject);
    const projectWarnings: string[] = [];
    if (!parsedProject.success) {
      projectWarnings.push(
        ...parsedProject.error.issues.map((issue) => `project.yaml: ${issue.path.join(".")} ${issue.message}`),
      );
      continue;
    }

    const linksYaml = await readYamlIfPresent<{ links?: LinkRecord[] }>(joinPath(dir.path, "links.yaml"), {
      links: [],
    });
    const ticketsYaml = await readYamlIfPresent<{ tickets?: Ticket[] }>(joinPath(dir.path, "tickets.yaml"), {
      tickets: [],
    });
    const threadsYaml = await readYamlIfPresent<{ threads?: ThreadRecord[] }>(joinPath(dir.path, "threads.yaml"), {
      threads: [],
    });

    const links = (linksYaml.links ?? []).filter((link) => linkSchema.safeParse(link).success);
    const tickets = (ticketsYaml.tickets ?? []).filter((ticket) => ticketSchema.safeParse(ticket).success);
    const threads = (threadsYaml.threads ?? []).filter((thread) => threadSchema.safeParse(thread).success);

    const project: WaymarkProject = {
      rootPath: dir.path,
      config: parsedProject.data,
      links,
      tickets,
      threads,
      ideas: await loadNotes(dir.path, "idea"),
      decisions: await loadNotes(dir.path, "decision"),
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
  await createDirAll(joinPath(rootPath, "projects", "glossa", "ai", "prompts"));
  await createDirAll(joinPath(rootPath, "projects", "glossa", "ai", "thread-summaries"));
  await createDirAll(joinPath(rootPath, "projects", "glossa", "ideas"));
  await createDirAll(joinPath(rootPath, "projects", "glossa", "decisions"));
  await createDirAll(joinPath(rootPath, "projects", "openclaw", "ai", "prompts"));
  await createDirAll(joinPath(rootPath, "projects", "openclaw", "ideas"));
  await createDirAll(joinPath(rootPath, "projects", "openclaw", "decisions"));

  await writeTextFile(
    joinPath(rootPath, "waymark.yaml"),
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
      links: {
        production: "https://glossa.app",
        design: "https://figma.com/example",
      },
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
          id: "vercel",
          label: "Vercel production",
          url: "https://vercel.com/example/glossa",
          type: "deploy",
          environment: "production",
        },
        {
          id: "sentry",
          label: "Sentry project",
          url: "https://sentry.io/",
          type: "dashboard",
          environment: "production",
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
      links: {},
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

export async function saveGeneratedPrompt(project: WaymarkProject, ticket: Ticket, prompt: string) {
  const promptPath = `ai/prompts/${today()}-${ticket.id}.md`;
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
  const saved = await Promise.all(
    prompts.map(async ({ ticket, prompt }) => {
      const promptPath = `ai/prompts/${today()}-${ticket.id}.md`;
      await writeTextFile(joinPath(project.rootPath, promptPath), prompt);
      return { ticketId: ticket.id, promptPath };
    }),
  );

  const promptByTicket = new Map(saved.map((entry) => [entry.ticketId, entry.promptPath]));
  const tickets = project.tickets.map((ticket) => {
    const promptPath = promptByTicket.get(ticket.id);
    if (!promptPath) return ticket;
    return {
      ...ticket,
      generated_prompts: Array.from(new Set([...(ticket.generated_prompts ?? []), promptPath])),
    };
  });
  await saveTickets(project, tickets);
  return saved;
}

export function buildPrompt(project: WaymarkProject, ticket: Ticket, selectedContext: string[]) {
  const linkedDecisions = project.decisions.filter((decision) => ticket.linked_decisions?.includes(decision.id));
  const linkedThreads = project.threads.filter((thread) => ticket.linked_threads?.includes(thread.id));
  const repos = project.config.repos ?? [];
  const links = [
    ...Object.entries(project.config.links ?? {}).map(([label, url]) => `${label}: ${url}`),
    ...project.links.map((link) => `${link.label}: ${link.url}`),
  ];

  const include = (key: string) => selectedContext.includes(key);

  return `# Task: ${ticket.title}

## Goal

${ticket.summary || "Clarify and implement this ticket."}

## Project

${project.config.name}

${project.config.summary}

Current focus: ${project.config.current_focus || "Not set"}

## Acceptance Criteria

${ticket.acceptance_criteria?.length ? ticket.acceptance_criteria.map((item) => `- ${item}`).join("\n") : "- Add acceptance criteria before implementation if this is too vague."}

${include("repos") ? `## Repositories\n\n${repos.length ? repos.map((repo) => `- ${repo.name} (${repo.id})${repo.path ? `\n  - Local: ${repo.path}` : ""}${repo.url ? `\n  - URL: ${repo.url}` : ""}`).join("\n") : "- No linked repos."}\n` : ""}
${include("files") ? `## Relevant Files\n\n${ticket.linked_files?.length ? ticket.linked_files.map((file) => `- ${file}`).join("\n") : "- No linked files were provided."}\n` : ""}
${include("decisions") ? `## Linked Decisions\n\n${linkedDecisions.length ? linkedDecisions.map((decision) => `### ${decision.title}\n\n${decision.body}`).join("\n\n") : "- No linked decisions."}\n` : ""}
${include("threads") ? `## AI Thread References\n\n${linkedThreads.length ? linkedThreads.map((thread) => `- ${thread.title} (${thread.provider}, ${thread.status})${thread.url ? `: ${thread.url}` : ""}${thread.summary_file ? `\n  - Summary: ${thread.summary_file}` : ""}`).join("\n") : "- No linked thread references."}\n` : ""}
${include("links") ? `## Project Links\n\n${links.length ? links.map((link) => `- ${link}`).join("\n") : "- No important project links."}\n` : ""}
## Instructions

- Make the smallest reasonable change.
- Follow the existing project conventions.
- Ask before broad refactors.
- Add or update tests when appropriate.
- Update relevant Waymark notes, tickets, or decisions if behavior changes.
- When done, summarize changed files, verification, and any follow-up tasks.
`;
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
      links: { production: "https://glossa.app", design: "https://figma.com/example" },
    },
    links: [],
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
    warnings: ['Ticket "Article import flow" has no acceptance criteria.'],
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
      links: {},
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
    warnings: [],
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
  if (!ticket.summary) warnings.push("Missing ticket summary.");
  if (!ticket.acceptance_criteria?.length) warnings.push("Missing acceptance criteria.");
  if (!project.config.repos?.length) warnings.push("Project has no linked repos.");
  if (!ticket.linked_files?.length) warnings.push("No linked files.");
  if (!ticket.linked_decisions?.length) warnings.push("No linked decisions.");
  if (!ticket.linked_threads?.length) warnings.push("No linked AI threads.");
  return warnings;
}
