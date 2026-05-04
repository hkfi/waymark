import { invoke } from "@tauri-apps/api/core";
import type { CodexStatus } from "./types";

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

export async function chooseDirectory() {
  return invoke<string | null>("choose_directory");
}

export interface NativeCodexRunRequest {
  cwd: string;
  prompt: string;
  schema?: string | null;
  timeoutMs?: number | null;
  model?: string | null;
  modelReasoningEffort?: string | null;
}

export interface NativeCodexRunResult {
  route: string;
  output: string;
  stderr: string;
}

export interface NativeCodexAppSession {
  id: string;
  route: string;
  detail: string;
}

export async function codexStatus() {
  return invoke<CodexStatus>("codex_status");
}

export async function codexLogin() {
  return invoke<void>("codex_login");
}

export async function codexRunStructured(request: NativeCodexRunRequest) {
  return invoke<NativeCodexRunResult>("codex_run_structured", { request });
}

export async function codexAppSessionStart(cwd: string, model?: string | null, modelReasoningEffort?: string | null) {
  return invoke<NativeCodexAppSession>("codex_app_session_start", { cwd, model, modelReasoningEffort });
}

export async function codexAppTurnSend(sessionId: string, request: NativeCodexRunRequest) {
  return invoke<NativeCodexRunResult>("codex_app_turn_send", { sessionId, request });
}

export async function codexAppSessionStop(sessionId: string) {
  return invoke<void>("codex_app_session_stop", { sessionId });
}
