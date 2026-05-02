import { useCallback, useMemo, useState } from "react";
import { isTauri } from "../../tauri";
import type { FileModalMode } from "../model";

export function useModalState(setNotice: (value: string) => void) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [fileModalMode, setFileModalMode] = useState<FileModalMode | null>(null);

  const openCreateWorkspace = useCallback(() => {
    setCreateWorkspaceOpen(true);
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to create a local workspace.");
    }
  }, [setNotice]);

  const openCreateProject = useCallback(() => {
    setCreateProjectOpen(true);
    if (!isTauri()) {
      setNotice("Run Waymark through Tauri to create a local project.");
    }
  }, [setNotice]);

  return useMemo(
    () => ({
      captureOpen,
      createWorkspaceOpen,
      createProjectOpen,
      fileModalMode,
      openCapture: () => setCaptureOpen(true),
      closeCapture: () => setCaptureOpen(false),
      openCreateWorkspace,
      closeCreateWorkspace: () => setCreateWorkspaceOpen(false),
      openCreateProject,
      closeCreateProject: () => setCreateProjectOpen(false),
      openFileModal: () => setFileModalMode("file"),
      openLinkModal: () => setFileModalMode("link"),
      closeFileModal: () => setFileModalMode(null),
    }),
    [captureOpen, createProjectOpen, createWorkspaceOpen, fileModalMode, openCreateProject, openCreateWorkspace],
  );
}
