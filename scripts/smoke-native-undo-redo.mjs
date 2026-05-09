import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { remote } from "webdriverio";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAST_WORKSPACE_PATH_KEY = "waymark:last-workspace-path";
const SELECTED_PROJECT_PREFIX = "waymark:selected-project:";

function fail(message) {
  throw new Error(message);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeText(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}

async function writeYaml(filePath, value) {
  await writeText(
    filePath,
    yaml.dump(value, {
      lineWidth: 100,
      noRefs: true,
      sortKeys: false,
    }),
  );
}

async function seedWorkspace(rootPath) {
  const projectRoot = path.join(rootPath, "projects", "smoke");
  await fs.mkdir(path.join(projectRoot, "ideas"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "decisions"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "ai", "prompts"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "ai", "thread-summaries"), { recursive: true });
  await writeYaml(path.join(rootPath, "waymark.yaml"), {
    version: 1,
    name: "Native Undo Smoke Workspace",
    projects_dir: "projects",
  });
  await writeYaml(path.join(projectRoot, "project.yaml"), {
    version: 1,
    name: "Smoke",
    slug: "smoke",
    status: "active",
    stage: "mvp",
    summary: "Disposable workspace for native undo and redo verification.",
    current_focus: "Exercise actual filesystem writes through the app.",
    repos: [{ id: "app", name: "App", path: repoRoot }],
  });
  await writeYaml(path.join(projectRoot, "tickets.yaml"), {
    version: 1,
    tickets: [
      {
        id: "delete-me",
        title: "Delete me",
        status: "now",
        priority: "high",
        summary: "A ticket used by native undo smoke tests.",
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
  await writeYaml(path.join(projectRoot, "links.yaml"), { version: 1, links: [] });
  await writeYaml(path.join(projectRoot, "threads.yaml"), { version: 1, threads: [] });
}

async function ticketIds(ticketsPath) {
  const data = yaml.load(await fs.readFile(ticketsPath, "utf8"));
  return Array.isArray(data?.tickets) ? data.tickets.map((ticket) => ticket.id) : [];
}

async function waitFor(check, description, timeoutMs = 12000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (caught) {
      lastError = caught;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  fail(`${description} timed out.${suffix}`);
}

async function assertTicketPresence(ticketsPath, id, expected) {
  await waitFor(async () => {
    const ids = await ticketIds(ticketsPath);
    return expected ? ids.includes(id) : !ids.includes(id);
  }, expected ? `Waiting for ${id} to be restored` : `Waiting for ${id} to be removed`);
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error("Unable to allocate a local WebDriver port."));
        else resolve(port);
      });
    });
  });
}

async function waitForPort(port, driverProcess, logs) {
  await waitFor(
    () =>
      new Promise((resolve, reject) => {
        if (driverProcess.exitCode !== null) {
          reject(new Error(`tauri-driver exited early.\n${logs.text}`));
          return;
        }
        const socket = net.createConnection({ host: "127.0.0.1", port });
        socket.on("connect", () => {
          socket.end();
          resolve(true);
        });
        socket.on("error", () => resolve(false));
      }),
    "Waiting for tauri-driver",
    10000,
  );
}

function assertTauriDriverInstalled() {
  const check = spawnSync("tauri-driver", ["--help"], { stdio: "ignore" });
  if (check.error?.code === "ENOENT") {
    fail("tauri-driver is required for native undo/redo smoke tests. Install it with: cargo install tauri-driver");
  }
  if (check.error) {
    fail(`Could not start tauri-driver: ${check.error.message}`);
  }
}

async function buildDebugApp() {
  const binaryName = process.platform === "win32" ? "waymark.exe" : "waymark";
  const appBinary = path.join(repoRoot, "src-tauri", "target", "debug", binaryName);
  if (process.env.WAYMARK_NATIVE_SMOKE_SKIP_BUILD !== "1") {
    try {
      execFileSync("pnpm", ["tauri", "build", "--debug"], {
        cwd: repoRoot,
        stdio: "inherit",
      });
    } catch (caught) {
      if (!(await exists(appBinary))) {
        throw caught;
      }
      console.warn("pnpm tauri build --debug failed after producing the debug binary; continuing with the local debug app.");
    }
  }
  if (!(await exists(appBinary))) {
    fail(`Debug app was not found at ${appBinary}. Run pnpm tauri build --debug and try again.`);
  }
  return appBinary;
}

async function clickToastAction(client, expectedLabel) {
  const action = await client.$('[data-testid="toast-action"]');
  await action.waitForDisplayed({ timeout: 10000 });
  const label = await action.getText();
  if (expectedLabel && label.trim() !== expectedLabel) {
    fail(`Expected toast action "${expectedLabel}", found "${label}".`);
  }
  await action.click();
}

async function main() {
  if (process.platform === "darwin") {
    fail("Official tauri-driver does not support macOS WKWebView. Run this smoke on Linux or Windows, or add a macOS-specific automation driver.");
  }
  if (process.platform !== "linux" && process.platform !== "win32") {
    fail("Native undo/redo smoke requires official tauri-driver desktop support, which is currently Linux and Windows.");
  }
  assertTauriDriverInstalled();

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "waymark-native-undo-"));
  const ticketsPath = path.join(tempRoot, "projects", "smoke", "tickets.yaml");
  let client = null;
  let driverProcess = null;
  const driverLogs = { text: "" };

  try {
    await seedWorkspace(tempRoot);
    const appBinary = await buildDebugApp();
    const port = await getFreePort();
    driverProcess = spawn("tauri-driver", ["--port", String(port)], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    driverProcess.stdout.on("data", (chunk) => {
      driverLogs.text += chunk.toString();
    });
    driverProcess.stderr.on("data", (chunk) => {
      driverLogs.text += chunk.toString();
    });
    await waitForPort(port, driverProcess, driverLogs);

    client = await remote({
      hostname: "127.0.0.1",
      port,
      logLevel: "error",
      capabilities: {
        browserName: "wry",
        "tauri:options": {
          application: appBinary,
        },
      },
    });

    await client.execute(
      (workspacePath, workspaceKey, selectedKey) => {
        window.localStorage.setItem(workspaceKey, workspacePath);
        window.localStorage.setItem(selectedKey, "smoke");
      },
      tempRoot,
      LAST_WORKSPACE_PATH_KEY,
      `${SELECTED_PROJECT_PREFIX}${tempRoot}`,
    );
    await client.refresh();

    const row = await client.$('[data-testid="ticket-row-delete-me"]');
    await row.waitForDisplayed({ timeout: 15000 });
    await row.click();

    const deleteButton = await client.$('[data-testid="delete-ticket-button"]');
    await deleteButton.waitForDisplayed({ timeout: 10000 });
    await deleteButton.click();
    await client.acceptAlert();
    await assertTicketPresence(ticketsPath, "delete-me", false);

    await clickToastAction(client, "Undo");
    await assertTicketPresence(ticketsPath, "delete-me", true);

    await clickToastAction(client, "Redo");
    await assertTicketPresence(ticketsPath, "delete-me", false);

    console.log("Native undo/redo smoke passed.");
  } finally {
    if (client) {
      await client.deleteSession().catch(() => undefined);
    }
    if (driverProcess && driverProcess.exitCode === null) {
      driverProcess.kill();
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((caught) => {
  console.error(caught instanceof Error ? caught.message : String(caught));
  process.exitCode = 1;
});
