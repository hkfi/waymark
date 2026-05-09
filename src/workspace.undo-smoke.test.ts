import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHistoryController, type FileAccess } from "./app/history";
import type { ThreadRecord, Ticket, WaymarkProject } from "./types";

type WorkspaceModule = typeof import("./workspace");

let rootPath = "";
let workspace: WorkspaceModule;

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeText(filePath: string, contents: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}

async function readText(filePath: string) {
  return fs.readFile(filePath, "utf8");
}

async function removeTextFile(filePath: string) {
  await fs.rm(filePath, { force: true });
}

function nodeFileAccess(): FileAccess {
  return {
    pathExists: exists,
    readTextFile: readText,
    writeTextFile: writeText,
    removeFile: removeTextFile,
  };
}

function createController() {
  let index = 0;
  return createHistoryController({
    files: nodeFileAccess(),
    now: () => new Date("2026-05-09T00:00:00.000Z"),
    id: () => `workspace-history-${index += 1}`,
  });
}

function dumpYaml(value: unknown) {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

async function writeYaml(filePath: string, value: unknown) {
  await writeText(filePath, dumpYaml(value));
}

async function readYaml<T>(filePath: string) {
  return yaml.load(await readText(filePath)) as T;
}

async function seedWorkspace() {
  const projectRoot = path.join(rootPath, "projects", "smoke");
  await fs.mkdir(path.join(projectRoot, "ideas"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "decisions"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "ai", "prompts"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "ai", "thread-summaries"), { recursive: true });

  await writeYaml(path.join(rootPath, "waymark.yaml"), {
    version: 1,
    name: "Undo Smoke Workspace",
    projects_dir: "projects",
  });
  await writeYaml(path.join(projectRoot, "project.yaml"), {
    version: 1,
    name: "Smoke",
    slug: "smoke",
    status: "active",
    stage: "mvp",
    summary: "Disposable workspace for undo and redo verification.",
    current_focus: "Exercise project-memory writes.",
    repos: [
      {
        id: "app",
        name: "App",
        path: rootPath,
      },
    ],
  });
  await writeYaml(path.join(projectRoot, "tickets.yaml"), {
    version: 1,
    tickets: [
      {
        id: "delete-me",
        title: "Delete me",
        status: "now",
        priority: "high",
        summary: "A ticket used by undo smoke tests.",
        acceptance_criteria: ["Delete can be undone."],
        linked_files: [],
        linked_decisions: [],
        linked_threads: [],
        generated_prompts: [],
      },
      {
        id: "keep-me",
        title: "Keep me",
        status: "next",
        priority: "medium",
        summary: "A control ticket that should remain in place.",
        acceptance_criteria: [],
        linked_files: [],
        linked_decisions: [],
        linked_threads: [],
        generated_prompts: [],
      },
    ],
  });
  await writeYaml(path.join(projectRoot, "links.yaml"), {
    version: 1,
    links: [],
  });
  await writeYaml(path.join(projectRoot, "threads.yaml"), {
    version: 1,
    threads: [
      {
        id: "existing-thread",
        provider: "codex",
        title: "Existing thread",
        status: "active",
        url: null,
        linked_tickets: ["keep-me"],
      },
    ],
  });
}

async function loadProject() {
  const loaded = await workspace.loadWorkspace(rootPath);
  const project = loaded.projects.find((candidate) => candidate.config.slug === "smoke");
  if (!project) throw new Error("Missing smoke project.");
  return project;
}

async function ticketIds(ticketsPath: string) {
  const data = await readYaml<{ tickets: Ticket[] }>(ticketsPath);
  return data.tickets.map((ticket) => ticket.id);
}

async function threadIds(threadsPath: string) {
  const data = await readYaml<{ threads: ThreadRecord[] }>(threadsPath);
  return data.threads.map((thread) => thread.id);
}

beforeEach(async () => {
  rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "waymark-undo-smoke-"));
  vi.resetModules();
  vi.doMock("./tauri", () => ({
    pathExists: exists,
    readTextFile: readText,
    writeTextFile: writeText,
    removeFile: removeTextFile,
    createDirAll: async (dirPath: string) => {
      await fs.mkdir(dirPath, { recursive: true });
    },
    listDir: async (dirPath: string) => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        is_dir: entry.isDirectory(),
      }));
    },
  }));
  workspace = await import("./workspace");
  await seedWorkspace();
});

afterEach(async () => {
  vi.doUnmock("./tauri");
  vi.resetModules();
  if (rootPath) {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
  rootPath = "";
});

describe("workspace undo smoke", () => {
  it("loads a temp workspace and undo/redoes ticket deletion through real files", async () => {
    const project = await loadProject();
    const ticketsPath = workspace.projectMemoryPath(project, "tickets.yaml");
    const history = createController();

    await history.recordTransaction(
      "Delete ticket",
      [ticketsPath],
      async () => {
        await workspace.saveTickets(
          project,
          project.tickets.filter((ticket) => ticket.id !== "delete-me"),
        );
      },
    );

    await expect(ticketIds(ticketsPath)).resolves.toEqual(["keep-me"]);

    await history.undo();
    await expect(ticketIds(ticketsPath)).resolves.toEqual(["delete-me", "keep-me"]);

    await history.redo();
    await expect(ticketIds(ticketsPath)).resolves.toEqual(["keep-me"]);
  });

  it("undo/redoes Assistant-like bulk saves as one real-file transaction", async () => {
    const project: WaymarkProject = await loadProject();
    const ticketsPath = workspace.projectMemoryPath(project, "tickets.yaml");
    const threadsPath = workspace.projectMemoryPath(project, "threads.yaml");
    const ideaPath = workspace.projectMemoryPath(project, "ideas/generated-idea.md");
    const summaryPath = workspace.projectMemoryPath(project, "ai/thread-summaries/generated-thread.md");
    const history = createController();

    const newTicket: Ticket = {
      id: "generated-ticket",
      title: "Generated ticket",
      status: "next",
      priority: "medium",
      summary: "A ticket generated from an Assistant draft.",
      acceptance_criteria: ["Drafts save as one transaction."],
      linked_files: [],
      linked_decisions: [],
      linked_threads: ["generated-thread"],
      generated_prompts: [],
    };
    const newThread: ThreadRecord = {
      id: "generated-thread",
      provider: "codex",
      title: "Generated thread",
      status: "completed",
      url: null,
      summary_file: "ai/thread-summaries/generated-thread.md",
      linked_tickets: ["generated-ticket"],
    };

    await history.recordTransaction(
      "Save assistant drafts",
      [ticketsPath, threadsPath, ideaPath, summaryPath],
      async () => {
        await workspace.saveTickets(project, [...project.tickets, newTicket]);
        await workspace.saveThreads(project, [...project.threads, newThread]);
        await workspace.writePlannedProjectFile({
          path: ideaPath,
          relativePath: "ideas/generated-idea.md",
          contents: "---\nid: generated-idea\ntitle: Generated idea\nlinked_tickets:\n  - generated-ticket\n---\n\n# Generated idea\n\nKeep the cockpit focused.\n",
        });
        await workspace.writePlannedProjectFile({
          path: summaryPath,
          relativePath: "ai/thread-summaries/generated-thread.md",
          contents: "# Generated thread\n\nAssistant summarized a useful implementation direction.\n",
        });
      },
    );

    await expect(ticketIds(ticketsPath)).resolves.toEqual(["delete-me", "keep-me", "generated-ticket"]);
    await expect(threadIds(threadsPath)).resolves.toEqual(["existing-thread", "generated-thread"]);
    await expect(exists(ideaPath)).resolves.toBe(true);
    await expect(exists(summaryPath)).resolves.toBe(true);

    await history.undo();
    await expect(ticketIds(ticketsPath)).resolves.toEqual(["delete-me", "keep-me"]);
    await expect(threadIds(threadsPath)).resolves.toEqual(["existing-thread"]);
    await expect(exists(ideaPath)).resolves.toBe(false);
    await expect(exists(summaryPath)).resolves.toBe(false);

    await history.redo();
    await expect(ticketIds(ticketsPath)).resolves.toEqual(["delete-me", "keep-me", "generated-ticket"]);
    await expect(threadIds(threadsPath)).resolves.toEqual(["existing-thread", "generated-thread"]);
    await expect(exists(ideaPath)).resolves.toBe(true);
    await expect(exists(summaryPath)).resolves.toBe(true);
  });
});
