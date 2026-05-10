import { useCallback, useMemo, useState } from "react";
import { isTauri } from "../../tauri";
import type { FileModalMode } from "../model";

export function useModalState(setNotice: (value: string) => void) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [repoOnboardingOpen, setRepoOnboardingOpen] = useState(false);
  const [fileModalMode, setFileModalMode] = useState<FileModalMode | null>(null);

  const openCapture = useCallback(() => setCaptureOpen(true), []);
  const closeCapture = useCallback(() => setCaptureOpen(false), []);
  const closeCreateWorkspace = useCallback(() => setCreateWorkspaceOpen(false), []);
  const closeCreateProject = useCallback(() => setCreateProjectOpen(false), []);
  const openRepoOnboarding = useCallback(() => setRepoOnboardingOpen(true), []);
  const closeRepoOnboarding = useCallback(() => setRepoOnboardingOpen(false), []);
  const openFileModal = useCallback(() => setFileModalMode("file"), []);
  const openLinkModal = useCallback(() => setFileModalMode("link"), []);
  const closeFileModal = useCallback(() => setFileModalMode(null), []);

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
      repoOnboardingOpen,
      fileModalMode,
      openCapture,
      closeCapture,
      openCreateWorkspace,
      closeCreateWorkspace,
      openCreateProject,
      closeCreateProject,
      openRepoOnboarding,
      closeRepoOnboarding,
      openFileModal,
      openLinkModal,
      closeFileModal,
    }),
    [
      captureOpen,
      closeCapture,
      closeCreateProject,
      closeCreateWorkspace,
      closeFileModal,
      closeRepoOnboarding,
      createProjectOpen,
      createWorkspaceOpen,
      fileModalMode,
      openCapture,
      openCreateProject,
      openCreateWorkspace,
      openFileModal,
      openLinkModal,
      openRepoOnboarding,
      repoOnboardingOpen,
    ],
  );
}
