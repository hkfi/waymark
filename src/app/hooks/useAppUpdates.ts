import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "../../tauri";
import type { AppUpdateState } from "../../types";

type FeedbackActions = {
  setError: (message: string | null) => void;
  setNotice: (message: string | null) => void;
};

const INITIAL_STATE: AppUpdateState = {
  status: "idle",
  currentVersion: null,
  version: null,
  notes: null,
  progress: null,
  error: null,
};

export function useAppUpdates({ setError, setNotice }: FeedbackActions) {
  const pendingUpdate = useRef<Update | null>(null);
  const [state, setState] = useState<AppUpdateState>(() =>
    isTauri() ? INITIAL_STATE : { ...INITIAL_STATE, status: "unsupported" },
  );

  const checkForUpdate = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!isTauri()) {
        if (!silent) setNotice("Run Waymark through Tauri to check for app updates.");
        setState({ ...INITIAL_STATE, status: "unsupported" });
        return null;
      }

      setState((current) => ({
        ...current,
        status: "checking",
        error: null,
        progress: null,
      }));

      try {
        const update = await check({ timeout: 10_000 });
        pendingUpdate.current = update;

        if (!update) {
          setState((current) => ({
            ...INITIAL_STATE,
            status: "idle",
            currentVersion: current.currentVersion,
          }));
          if (!silent) setNotice("Waymark is up to date.");
          return null;
        }

        const nextState: AppUpdateState = {
          status: "available",
          currentVersion: update.currentVersion,
          version: update.version,
          notes: update.body ?? null,
          progress: null,
          error: null,
        };

        setState(nextState);
        if (!silent) setNotice(`Waymark ${update.version} is ready to install.`);
        return update;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setState((current) => ({
          ...current,
          status: "error",
          error: message,
          progress: null,
        }));

        if (silent) {
          console.warn("Waymark update check failed.", caught);
        } else {
          setError(`Could not check for app updates: ${message}`);
        }

        return null;
      }
    },
    [setError, setNotice],
  );

  const installUpdate = useCallback(async () => {
    const update = pendingUpdate.current ?? await checkForUpdate();
    if (!update) return;

    let downloaded = 0;
    let contentLength: number | null = null;

    const onDownload = (event: DownloadEvent) => {
      if (event.event === "Started") {
        downloaded = 0;
        contentLength = event.data.contentLength ?? null;
        setState((current) => ({ ...current, status: "installing", progress: 0, error: null }));
        return;
      }

      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        setState((current) => ({
          ...current,
          status: "installing",
          progress: contentLength ? Math.min(downloaded / contentLength, 1) : null,
        }));
        return;
      }

      setState((current) => ({ ...current, status: "installing", progress: 1 }));
    };

    try {
      setState((current) => ({ ...current, status: "installing", progress: 0, error: null }));
      await update.downloadAndInstall(onDownload);
      pendingUpdate.current = null;
      setState((current) => ({ ...current, status: "restarting", progress: 1 }));
      setNotice("Update installed. Restarting Waymark.");
      await relaunch();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setState((current) => ({ ...current, status: "error", error: message, progress: null }));
      setError(`Could not install the app update: ${message}`);
    }
  }, [checkForUpdate, setError, setNotice]);

  useEffect(() => {
    void checkForUpdate({ silent: true });
  }, [checkForUpdate]);

  return useMemo(
    () => ({
      ...state,
      checkForUpdate,
      installUpdate,
    }),
    [checkForUpdate, installUpdate, state],
  );
}
