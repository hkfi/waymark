import { useCallback, useEffect, useMemo, useState } from "react";
import { chooseDirectory, isTauri } from "../../tauri";
import type { ProjectConfig, WaymarkProject, WorkspaceData } from "../../types";
import {
  buildDemoWorkspace,
  createProject as createProjectFiles,
  createSampleWorkspace,
  createWorkspace as createWorkspaceFiles,
  loadWorkspace,
} from "../../workspace";
import { defaultWorkspacePath } from "../model";

type FeedbackApi = {
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
};

export function useWorkspaceState({ setError, setNotice }: FeedbackApi) {
  const [rootPath, setRootPath] = useState(defaultWorkspacePath);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const selectedProject = useMemo<WaymarkProject | null>(() => {
    if (!data) return null;
    return (
      data.projects.find((project) => project.config.slug === selectedSlug) ??
      data.projects[0] ??
      null
    );
  }, [data, selectedSlug]);

  const refresh = useCallback(
    async (path = rootPath) => {
      setError(null);
      try {
        if (!isTauri()) {
          if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
            setData(buildDemoWorkspace());
            setNotice("Reloaded demo workspace.");
            return;
          }
          setNotice("Run Waymark through Tauri to reload a local workspace.");
          return;
        }

        const next = await loadWorkspace(path);
        setData(next);
        setSelectedSlug((current) => current ?? next.projects[0]?.config.slug ?? null);
        setNotice(`Reloaded ${next.config.name}.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [rootPath, setError, setNotice],
  );

  const chooseWorkspace = useCallback(async () => {
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to choose a workspace folder.");
      return;
    }

    try {
      const path = await chooseDirectory();
      if (!path) return;
      setRootPath(path);
      await refresh(path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [refresh, setError, setNotice]);

  const seedWorkspace = useCallback(async () => {
    if (!isTauri()) {
      setError("Run Waymark through Tauri to seed a local workspace.");
      return;
    }
    await createSampleWorkspace(rootPath);
    setNotice(`Created sample workspace at ${rootPath}`);
    await refresh(rootPath);
  }, [refresh, rootPath, setError, setNotice]);

  const createWorkspace = useCallback(
    async (path: string, name: string) => {
      try {
        await createWorkspaceFiles(path, name);
        setRootPath(path);
        await refresh(path);
        setNotice(`Created workspace at ${path}.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        throw caught;
      }
    },
    [refresh, setError, setNotice],
  );

  const createProject = useCallback(
    async (config: ProjectConfig) => {
      if (!data) return;
      try {
        await createProjectFiles(data, config);
        await refresh(rootPath);
        setSelectedSlug(config.slug);
        setNotice(`Created project ${config.name}.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        throw caught;
      }
    },
    [data, refresh, rootPath, setError, setNotice],
  );

  useEffect(() => {
    if (isTauri()) {
      refresh().catch((caught) => setError(String(caught)));
      return;
    }
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
      setData(buildDemoWorkspace());
    }
    // Initial workspace loading is intentionally tied to app startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    () => ({
      rootPath,
      setRootPath,
      data,
      selectedProject,
      selectProject: setSelectedSlug,
      refresh,
      chooseDirectory,
      chooseWorkspace,
      seedWorkspace,
      createWorkspace,
      createProject,
    }),
    [chooseWorkspace, createProject, createWorkspace, data, refresh, rootPath, seedWorkspace, selectedProject],
  );
}
