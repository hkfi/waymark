use crate::file_commands::expand_tilde;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const APP_SERVER_ROUTE: &str = "app-server";
const CLI_ROUTE: &str = "cli";
const CODEX_DEFAULT_TIMEOUT_MS: u64 = 180_000;
const CODEX_MIN_TIMEOUT_MS: u64 = 10_000;
const CODEX_MAX_TIMEOUT_MS: u64 = 600_000;
const CODEX_APP_TIMEOUT: &str = "Codex app-server timed out before returning a response.";
const CODEX_APP_CLOSED: &str = "Codex app-server closed unexpectedly.";

#[derive(Serialize)]
pub(crate) struct CodexStatus {
    state: String,
    path: Option<String>,
    detail: String,
}

#[derive(Serialize)]
pub(crate) struct CodexRunResult {
    route: String,
    output: String,
    stderr: String,
}

#[derive(Serialize)]
pub(crate) struct CodexAppSession {
    id: String,
    route: String,
    detail: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexRunRequest {
    cwd: String,
    prompt: String,
    schema: Option<String>,
    timeout_ms: Option<u64>,
}

struct CodexAppRuntime {
    child: Child,
    stdin: ChildStdin,
    receiver: Receiver<Result<Value, String>>,
    thread_id: String,
    request_counter: u64,
}

struct CodexAppSessionState {
    runtime: Mutex<CodexAppRuntime>,
    child_id: u32,
}

pub(crate) struct CodexSessions(Arc<Mutex<HashMap<String, Arc<CodexAppSessionState>>>>);

impl CodexSessions {
    pub(crate) fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

#[derive(Serialize, Clone)]
struct CodexAssistantDelta {
    session_id: String,
    route: String,
    delta: String,
}

#[tauri::command]
pub(crate) fn codex_status() -> CodexStatus {
    let Some(path) = find_codex_binary() else {
        return CodexStatus {
            state: "unavailable".to_string(),
            path: None,
            detail: "Codex was not found on PATH or in /Applications/Codex.app.".to_string(),
        };
    };

    match Command::new(&path).args(["login", "status"]).output() {
        Ok(output) => {
            let raw = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            let detail = redact_codex_output(&raw);
            let lower = raw.to_lowercase();
            let state = if output.status.success() && lower.contains("logged in") {
                "ready"
            } else if lower.contains("not logged") || lower.contains("login") {
                "needsLogin"
            } else {
                "errored"
            };
            CodexStatus {
                state: state.to_string(),
                path: Some(path),
                detail: detail.trim().to_string(),
            }
        }
        Err(error) => CodexStatus {
            state: "errored".to_string(),
            path: Some(path),
            detail: error.to_string(),
        },
    }
}

#[tauri::command]
pub(crate) fn codex_login() -> Result<(), String> {
    let path = find_codex_binary().ok_or_else(|| "Codex was not found.".to_string())?;
    Command::new(path)
        .arg("login")
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn codex_run_structured(request: CodexRunRequest) -> Result<CodexRunResult, String> {
    run_codex_exec(request, CLI_ROUTE)
}

#[tauri::command]
pub(crate) async fn codex_app_session_start(
    state: tauri::State<'_, CodexSessions>,
    cwd: String,
) -> Result<CodexAppSession, String> {
    let sessions = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = find_codex_binary().ok_or_else(|| "Codex was not found.".to_string())?;
        let id = format!("waymark-{}", unique_suffix());
        let mut runtime = start_codex_app_runtime(&path)?;
        initialize_codex_app_runtime(&mut runtime)?;
        let thread_id = start_codex_app_thread(&mut runtime, &cwd)?;
        runtime.thread_id = thread_id;
        let child_id = runtime.child.id();
        let session = Arc::new(CodexAppSessionState {
            runtime: Mutex::new(runtime),
            child_id,
        });

        sessions
            .lock()
            .map_err(|_| "Codex session state is unavailable.".to_string())?
            .insert(id.clone(), session);
        Ok(CodexAppSession {
            id,
            route: APP_SERVER_ROUTE.to_string(),
            detail: "Connected to Codex app-server using an ephemeral read-only thread."
                .to_string(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn codex_app_turn_send(
    app: tauri::AppHandle,
    state: tauri::State<'_, CodexSessions>,
    session_id: String,
    request: CodexRunRequest,
) -> Result<CodexRunResult, String> {
    let sessions = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = {
            let sessions = sessions
                .lock()
                .map_err(|_| "Codex session state is unavailable.".to_string())?;
            sessions
                .get(&session_id)
                .cloned()
                .ok_or_else(|| "Codex session is not active.".to_string())?
        };
        let mut runtime = session
            .runtime
            .lock()
            .map_err(|_| "Codex session runtime is unavailable.".to_string())?;
        run_codex_app_turn(&mut runtime, &session_id, request, &app)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn codex_app_session_stop(
    state: tauri::State<'_, CodexSessions>,
    session_id: String,
) -> Result<(), String> {
    let sessions = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = sessions
            .lock()
            .map_err(|_| "Codex session state is unavailable.".to_string())?
            .remove(&session_id);

        if let Some(session) = session {
            stop_codex_app_session(session);
        }

        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn find_codex_binary() -> Option<String> {
    if let Ok(path_var) = env::var("PATH") {
        for part in path_var.split(':') {
            let candidate = Path::new(part).join("codex");
            if candidate.exists() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }

    let bundled = "/Applications/Codex.app/Contents/Resources/codex";
    if Path::new(bundled).exists() {
        return Some(bundled.to_string());
    }

    None
}

fn start_codex_app_runtime(path: &str) -> Result<CodexAppRuntime, String> {
    let mut child = Command::new(path)
        .arg("app-server")
        .arg("--listen")
        .arg("stdio://")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex app-server stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex app-server stdout is unavailable.".to_string())?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    let _ = sender.send(Err(CODEX_APP_CLOSED.to_string()));
                    break;
                }
                Ok(_) => {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let parsed =
                        serde_json::from_str::<Value>(&line).map_err(|error| error.to_string());
                    if sender.send(parsed).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    let _ = sender.send(Err(error.to_string()));
                    break;
                }
            }
        }
    });

    Ok(CodexAppRuntime {
        child,
        stdin,
        receiver,
        thread_id: String::new(),
        request_counter: 1,
    })
}

fn initialize_codex_app_runtime(runtime: &mut CodexAppRuntime) -> Result<(), String> {
    send_codex_app_request(
        runtime,
        "initialize",
        json!({
            "clientInfo": {
                "name": "waymark",
                "title": "Waymark",
                "version": env!("CARGO_PKG_VERSION"),
            },
            "capabilities": {
                "experimentalApi": true,
                "optOutNotificationMethods": [],
            },
        }),
        Duration::from_secs(15),
    )
    .map(|_| ())
}

fn start_codex_app_thread(runtime: &mut CodexAppRuntime, cwd: &str) -> Result<String, String> {
    let result = send_codex_app_request(
        runtime,
        "thread/start",
        json!({
            "cwd": expand_tilde(cwd),
            "approvalPolicy": "never",
            "sandbox": "read-only",
            "ephemeral": true,
            "serviceName": "Waymark",
            "baseInstructions": "You are the Waymark Assistant. Help with local project memory only. Do not run commands, request tool access, modify files, or scrape private app storage. Return structured drafts only when the user asks to structure or capture project memory.",
        }),
        Duration::from_secs(30),
    )?;

    result
        .get("thread")
        .and_then(|thread| thread.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "Codex app-server did not return a thread id.".to_string())
}

fn send_codex_app_request(
    runtime: &mut CodexAppRuntime,
    method: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value, String> {
    let id = next_request_id(runtime);
    write_codex_app_message(
        runtime,
        &json!({
            "id": id,
            "method": method,
            "params": params,
        }),
    )?;

    let started = Instant::now();
    loop {
        let message = read_codex_app_message(runtime, started, timeout)?;
        if let Some(request_id) = message_id(&message) {
            if request_id == id {
                if let Some(error) = rpc_error_message(&message) {
                    return Err(error);
                }
                return Ok(message.get("result").cloned().unwrap_or(Value::Null));
            }

            respond_to_codex_app_server_request(runtime, request_id)?;
        }
    }
}

fn run_codex_app_turn(
    runtime: &mut CodexAppRuntime,
    session_id: &str,
    request: CodexRunRequest,
    app: &tauri::AppHandle,
) -> Result<CodexRunResult, String> {
    let timeout = codex_timeout(request.timeout_ms);
    let output_schema = parse_output_schema(request.schema.as_ref())?;
    let id = next_request_id(runtime);
    let mut params = json!({
        "threadId": runtime.thread_id,
        "input": [{
            "type": "text",
            "text": request.prompt,
            "text_elements": [],
        }],
        "cwd": expand_tilde(&request.cwd),
        "approvalPolicy": "never",
        "sandboxPolicy": {
            "type": "readOnly",
            "networkAccess": false,
        },
    });
    if let Some(schema) = output_schema {
        params["outputSchema"] = schema;
    }

    write_codex_app_message(
        runtime,
        &json!({
            "id": id,
            "method": "turn/start",
            "params": params,
        }),
    )?;

    let started = Instant::now();
    let mut turn_id: Option<String> = None;
    let mut saw_turn_response = false;
    let mut output = String::new();
    let mut completed_text: Option<String> = None;
    let mut stderr = String::new();

    loop {
        let message = read_codex_app_message(runtime, started, timeout)?;

        if let Some(request_id) = message_id(&message) {
            if request_id == id {
                if let Some(error) = rpc_error_message(&message) {
                    return Err(error);
                }
                saw_turn_response = true;
                turn_id = response_turn_id(&message).map(str::to_string);
                continue;
            }

            respond_to_codex_app_server_request(runtime, request_id)?;
            continue;
        }

        let params = message_params(&message);
        match message_method(&message) {
            Some("item/agentMessage/delta") => {
                if same_thread(params, &runtime.thread_id) {
                    let delta = agent_message_delta(params).unwrap_or_default();
                    output.push_str(delta);
                    let _ = app.emit(
                        "codex-assistant-delta",
                        CodexAssistantDelta {
                            session_id: session_id.to_string(),
                            route: APP_SERVER_ROUTE.to_string(),
                            delta: delta.to_string(),
                        },
                    );
                }
            }
            Some("item/completed") => {
                if same_thread(params, &runtime.thread_id) {
                    if let Some(text) = completed_agent_text(params) {
                        completed_text = Some(text.to_string());
                    }
                }
            }
            Some("turn/completed") => {
                if !same_thread(params, &runtime.thread_id) {
                    continue;
                }

                if let Some(active_turn_id) = &turn_id {
                    if completed_turn_id(params) != Some(active_turn_id.as_str()) {
                        continue;
                    }
                }

                if let Some(error) = turn_error_message(params) {
                    return Err(error.to_string());
                }

                if output.trim().is_empty() {
                    output = completed_text.unwrap_or_default();
                }
                if !saw_turn_response {
                    stderr.push_str("Codex completed before acknowledging turn/start. ");
                }
                return Ok(CodexRunResult {
                    route: APP_SERVER_ROUTE.to_string(),
                    output,
                    stderr,
                });
            }
            Some("error") => {
                if let Some(message) = params.get("message").and_then(Value::as_str) {
                    stderr.push_str(message);
                    stderr.push('\n');
                }
            }
            _ => {}
        }
    }
}

fn write_codex_app_message(runtime: &mut CodexAppRuntime, message: &Value) -> Result<(), String> {
    serde_json::to_writer(&mut runtime.stdin, message).map_err(|error| error.to_string())?;
    runtime
        .stdin
        .write_all(b"\n")
        .map_err(|error| error.to_string())?;
    runtime.stdin.flush().map_err(|error| error.to_string())
}

fn read_codex_app_message(
    runtime: &mut CodexAppRuntime,
    started: Instant,
    timeout: Duration,
) -> Result<Value, String> {
    loop {
        let elapsed = started.elapsed();
        if elapsed > timeout {
            return Err(CODEX_APP_TIMEOUT.to_string());
        }

        match runtime.receiver.recv_timeout(timeout - elapsed) {
            Ok(Ok(message)) => return Ok(message),
            Ok(Err(error)) => return Err(error),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                return Err(CODEX_APP_TIMEOUT.to_string());
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err(CODEX_APP_CLOSED.to_string());
            }
        }
    }
}

fn respond_to_codex_app_server_request(
    runtime: &mut CodexAppRuntime,
    request_id: u64,
) -> Result<(), String> {
    write_codex_app_message(
        runtime,
        &json!({
            "id": request_id,
            "result": {
                "decision": "decline",
                "permissions": {},
                "scope": "turn",
                "contentItems": [],
                "success": false,
            },
        }),
    )
}

fn run_codex_exec(request: CodexRunRequest, route: &str) -> Result<CodexRunResult, String> {
    let codex = find_codex_binary().ok_or_else(|| "Codex was not found.".to_string())?;
    let cwd = expand_tilde(&request.cwd);
    let timeout = codex_timeout(request.timeout_ms);
    let suffix = unique_suffix();
    let out_path = env::temp_dir().join(format!("waymark-codex-output-{suffix}.md"));
    let schema_path = request
        .schema
        .as_ref()
        .map(|schema| {
            let path = env::temp_dir().join(format!("waymark-codex-schema-{suffix}.json"));
            fs::write(&path, schema).map_err(|error| error.to_string())?;
            Ok::<_, String>(path)
        })
        .transpose()?;

    let mut command = Command::new(codex);
    command
        .arg("exec")
        .arg("--ephemeral")
        .arg("--sandbox")
        .arg("read-only")
        .arg("--ask-for-approval")
        .arg("never")
        .arg("--cd")
        .arg(cwd)
        .arg("--output-last-message")
        .arg(&out_path);

    if let Some(path) = &schema_path {
        command.arg("--output-schema").arg(path);
    }

    command.arg("-");
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(request.prompt.as_bytes())
            .map_err(|error| error.to_string())?;
    }

    let started = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_some()
        {
            break;
        }
        if started.elapsed() > timeout {
            let _ = child.kill();
            return Err("Codex timed out before returning a response.".to_string());
        }
        std::thread::sleep(Duration::from_millis(80));
    }

    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    let stderr = redact_codex_output(&String::from_utf8_lossy(&output.stderr));
    let stdout = redact_codex_output(&String::from_utf8_lossy(&output.stdout));
    let final_message = fs::read_to_string(&out_path).unwrap_or_else(|_| stdout.clone());

    let _ = fs::remove_file(&out_path);
    if let Some(path) = schema_path {
        let _ = fs::remove_file(path);
    }

    if !output.status.success() {
        return Err(if stderr.trim().is_empty() {
            "Codex failed without an error message.".to_string()
        } else {
            stderr.trim().to_string()
        });
    }

    Ok(CodexRunResult {
        route: route.to_string(),
        output: final_message,
        stderr,
    })
}

fn stop_codex_app_session(session: Arc<CodexAppSessionState>) {
    terminate_process(session.child_id);
    std::thread::spawn(move || {
        if let Ok(mut runtime) = session.runtime.lock() {
            let _ = runtime.child.kill();
            let _ = runtime.child.wait();
        }
    });
}

#[cfg(unix)]
fn terminate_process(process_id: u32) {
    let _ = Command::new("kill")
        .arg("-TERM")
        .arg(process_id.to_string())
        .status();
}

#[cfg(not(unix))]
fn terminate_process(_process_id: u32) {}

fn next_request_id(runtime: &mut CodexAppRuntime) -> u64 {
    let id = runtime.request_counter;
    runtime.request_counter += 1;
    id
}

fn codex_timeout(timeout_ms: Option<u64>) -> Duration {
    Duration::from_millis(
        timeout_ms
            .unwrap_or(CODEX_DEFAULT_TIMEOUT_MS)
            .clamp(CODEX_MIN_TIMEOUT_MS, CODEX_MAX_TIMEOUT_MS),
    )
}

fn parse_output_schema(schema: Option<&String>) -> Result<Option<Value>, String> {
    schema
        .map(|schema| serde_json::from_str::<Value>(schema).map_err(|error| error.to_string()))
        .transpose()
}

fn message_id(message: &Value) -> Option<u64> {
    message.get("id").and_then(Value::as_u64)
}

fn message_method(message: &Value) -> Option<&str> {
    message.get("method").and_then(Value::as_str)
}

fn message_params(message: &Value) -> &Value {
    message.get("params").unwrap_or(&Value::Null)
}

fn same_thread(params: &Value, thread_id: &str) -> bool {
    params.get("threadId").and_then(Value::as_str) == Some(thread_id)
}

fn agent_message_delta(params: &Value) -> Option<&str> {
    params.get("delta").and_then(Value::as_str)
}

fn completed_agent_text(params: &Value) -> Option<&str> {
    params
        .get("item")
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("agentMessage"))
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
}

fn completed_turn_id(params: &Value) -> Option<&str> {
    params
        .get("turn")
        .and_then(|turn| turn.get("id"))
        .and_then(Value::as_str)
}

fn response_turn_id(message: &Value) -> Option<&str> {
    message
        .get("result")
        .and_then(|result| result.get("turn"))
        .and_then(|turn| turn.get("id"))
        .and_then(Value::as_str)
}

fn turn_error_message(params: &Value) -> Option<&str> {
    params
        .get("turn")
        .and_then(|turn| turn.get("error"))
        .filter(|error| !error.is_null())
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| {
            params
                .get("turn")
                .and_then(|turn| turn.get("error"))
                .filter(|error| !error.is_null())
                .map(|_| "Codex turn failed.")
        })
}

fn rpc_error_message(message: &Value) -> Option<String> {
    message
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn unique_suffix() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("{}-{}", std::process::id(), millis)
}

fn redact_codex_output(raw: &str) -> String {
    raw.split_whitespace()
        .map(|part| {
            if part.contains('@') {
                "[redacted-account]".to_string()
            } else if part.starts_with("sk-") || part.starts_with("sess-") {
                "[redacted-token]".to_string()
            } else {
                part.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_codex_timeouts() {
        assert_eq!(
            codex_timeout(Some(1)).as_millis(),
            CODEX_MIN_TIMEOUT_MS as u128
        );
        assert_eq!(
            codex_timeout(Some(999_999)).as_millis(),
            CODEX_MAX_TIMEOUT_MS as u128
        );
        assert_eq!(
            codex_timeout(None).as_millis(),
            CODEX_DEFAULT_TIMEOUT_MS as u128
        );
    }

    #[test]
    fn redacts_accounts_and_tokens_from_codex_output() {
        let redacted = redact_codex_output("hi dev@example.com sk-secret sess-token ok");
        assert_eq!(
            redacted,
            "hi [redacted-account] [redacted-token] [redacted-token] ok"
        );
    }

    #[test]
    fn extracts_rpc_error_messages() {
        let message = json!({
            "id": 2,
            "error": {
                "message": "Nope"
            }
        });

        assert_eq!(rpc_error_message(&message), Some("Nope".to_string()));
    }

    #[test]
    fn extracts_app_server_event_details() {
        let delta = json!({
            "method": "item/agentMessage/delta",
            "params": {
                "threadId": "thread-1",
                "delta": "hello"
            }
        });
        let params = message_params(&delta);

        assert_eq!(message_method(&delta), Some("item/agentMessage/delta"));
        assert!(same_thread(params, "thread-1"));
        assert_eq!(agent_message_delta(params), Some("hello"));
    }

    #[test]
    fn extracts_completed_agent_text_only_for_agent_messages() {
        let completed = json!({
            "params": {
                "item": {
                    "type": "agentMessage",
                    "text": "final"
                }
            }
        });
        let user_completed = json!({
            "params": {
                "item": {
                    "type": "userMessage",
                    "text": "ignored"
                }
            }
        });

        assert_eq!(
            completed_agent_text(message_params(&completed)),
            Some("final")
        );
        assert_eq!(completed_agent_text(message_params(&user_completed)), None);
    }

    #[test]
    fn extracts_turn_completion_and_errors() {
        let completed = json!({
            "params": {
                "turn": {
                    "id": "turn-1",
                    "error": {
                        "message": "failed"
                    }
                }
            }
        });
        let params = message_params(&completed);

        assert_eq!(completed_turn_id(params), Some("turn-1"));
        assert_eq!(turn_error_message(params), Some("failed"));
    }

    #[test]
    fn parses_optional_output_schema() {
        let schema = "{\"type\":\"object\"}".to_string();

        assert!(parse_output_schema(None).unwrap().is_none());
        assert_eq!(
            parse_output_schema(Some(&schema)).unwrap(),
            Some(json!({ "type": "object" }))
        );
        assert!(parse_output_schema(Some(&"not-json".to_string())).is_err());
    }
}
