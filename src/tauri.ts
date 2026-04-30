import { invoke } from "@tauri-apps/api/core";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export interface DirEntryInfo {
  name: string;
  path: string;
  is_dir: boolean;
}

export const isTauri = () => Boolean(window.__TAURI_INTERNALS__);

export async function pathExists(path: string) {
  return invoke<boolean>("path_exists", { path });
}

export async function readTextFile(path: string) {
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, contents: string) {
  return invoke<void>("write_text_file", { path, contents });
}

export async function createDirAll(path: string) {
  return invoke<void>("create_dir_all", { path });
}

export async function listDir(path: string) {
  return invoke<DirEntryInfo[]>("list_dir", { path });
}

export async function openPath(path: string) {
  return invoke<void>("open_path", { path });
}
