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

#[derive(Serialize)]
struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
struct CodexStatus {
    state: String,
    path: Option<String>,
    detail: String,
}

#[derive(Serialize)]
struct CodexRunResult {
    route: String,
    output: String,
    stderr: String,
}

#[derive(Serialize)]
struct CodexAppSession {
    id: String,
    route: String,
    detail: String,
}

#[derive(Deserialize)]
struct CodexRunRequest {
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

struct CodexSessions(Arc<Mutex<HashMap<String, CodexAppRuntime>>>);

#[derive(Serialize, Clone)]
struct CodexAssistantDelta {
    session_id: String,
    route: String,
    delta: String,
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&expand_tilde(&path)).exists()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(expand_tilde(&path)).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let path = expand_tilde(&path);
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_dir_all(path: String) -> Result<(), String> {
    fs::create_dir_all(expand_tilde(&path)).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let mut entries = Vec::new();

    for entry in fs::read_dir(expand_tilde(&path)).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        entries.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
        });
    }

    entries.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(entries)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(expand_tilde(&path))
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn choose_directory() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .arg("-e")
            .arg("POSIX path of (choose folder with prompt \"Open Waymark workspace\")")
            .output()
            .map_err(|error| error.to_string())?;

        if !output.status.success() {
            return Ok(None);
        }

        let path = String::from_utf8(output.stdout)
            .map_err(|error| error.to_string())?
            .trim()
            .trim_end_matches('/')
            .to_string();

        if path.is_empty() {
            return Ok(None);
        }

        return Ok(Some(path));
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Folder picker is not available on this platform yet.".to_string())
    }
}

#[tauri::command]
fn codex_status() -> CodexStatus {
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
fn codex_login() -> Result<(), String> {
    let path = find_codex_binary().ok_or_else(|| "Codex was not found.".to_string())?;
    Command::new(path)
        .arg("login")
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn codex_run_structured(request: CodexRunRequest) -> Result<CodexRunResult, String> {
    run_codex_exec(request, "cli")
}

#[tauri::command]
async fn codex_app_session_start(
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
        sessions
            .lock()
            .map_err(|_| "Codex session state is unavailable.".to_string())?
            .insert(id.clone(), runtime);
        Ok(CodexAppSession {
            id,
            route: "app-server".to_string(),
            detail: "Connected to Codex app-server using an ephemeral read-only thread."
                .to_string(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn codex_app_turn_send(
    app: tauri::AppHandle,
    state: tauri::State<'_, CodexSessions>,
    session_id: String,
    request: CodexRunRequest,
) -> Result<CodexRunResult, String> {
    let sessions = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut sessions = sessions
            .lock()
            .map_err(|_| "Codex session state is unavailable.".to_string())?;
        let runtime = sessions
            .get_mut(&session_id)
            .ok_or_else(|| "Codex session is not active.".to_string())?;
        run_codex_app_turn(runtime, &session_id, request, &app)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn codex_app_session_stop(
    state: tauri::State<'_, CodexSessions>,
    session_id: String,
) -> Result<(), String> {
    let sessions = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        sessions
            .lock()
            .map_err(|_| "Codex session state is unavailable.".to_string())?
            .remove(&session_id)
            .map(|mut runtime| {
                let _ = runtime.child.kill();
                let _ = runtime.child.wait();
            });
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn expand_tilde(path: &str) -> String {
    if path == "~" {
        return env::var("HOME").unwrap_or_else(|_| path.to_string());
    }

    if let Some(stripped) = path.strip_prefix("~/") {
        if let Ok(home) = env::var("HOME") {
            return format!("{home}/{stripped}");
        }
    }

    path.to_string()
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
                    let _ = sender.send(Err("Codex app-server closed unexpectedly.".to_string()));
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
    let id = runtime.request_counter;
    runtime.request_counter += 1;
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
        if let Some(request_id) = message.get("id").and_then(Value::as_u64) {
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
    let timeout =
        Duration::from_millis(request.timeout_ms.unwrap_or(180_000).clamp(10_000, 600_000));
    let output_schema = request
        .schema
        .as_ref()
        .map(|schema| serde_json::from_str::<Value>(schema).map_err(|error| error.to_string()))
        .transpose()?;
    let id = runtime.request_counter;
    runtime.request_counter += 1;
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

        if let Some(request_id) = message.get("id").and_then(Value::as_u64) {
            if request_id == id {
                if let Some(error) = rpc_error_message(&message) {
                    return Err(error);
                }
                saw_turn_response = true;
                turn_id = message
                    .get("result")
                    .and_then(|result| result.get("turn"))
                    .and_then(|turn| turn.get("id"))
                    .and_then(Value::as_str)
                    .map(str::to_string);
                continue;
            }

            respond_to_codex_app_server_request(runtime, request_id)?;
            continue;
        }

        let method = message.get("method").and_then(Value::as_str).unwrap_or("");
        let params = message.get("params").unwrap_or(&Value::Null);
        match method {
            "item/agentMessage/delta" => {
                if params.get("threadId").and_then(Value::as_str)
                    == Some(runtime.thread_id.as_str())
                {
                    let delta = params
                        .get("delta")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    output.push_str(delta);
                    let _ = app.emit(
                        "codex-assistant-delta",
                        CodexAssistantDelta {
                            session_id: session_id.to_string(),
                            route: "app-server".to_string(),
                            delta: delta.to_string(),
                        },
                    );
                }
            }
            "item/completed" => {
                if params.get("threadId").and_then(Value::as_str)
                    == Some(runtime.thread_id.as_str())
                {
                    if let Some(item) = params.get("item") {
                        if item.get("type").and_then(Value::as_str) == Some("agentMessage") {
                            if let Some(text) = item.get("text").and_then(Value::as_str) {
                                completed_text = Some(text.to_string());
                            }
                        }
                    }
                }
            }
            "turn/completed" => {
                if params.get("threadId").and_then(Value::as_str)
                    != Some(runtime.thread_id.as_str())
                {
                    continue;
                }
                let completed_turn = params
                    .get("turn")
                    .and_then(|turn| turn.get("id"))
                    .and_then(Value::as_str);
                if let Some(active_turn_id) = &turn_id {
                    if completed_turn != Some(active_turn_id.as_str()) {
                        continue;
                    }
                }
                if let Some(error) = params
                    .get("turn")
                    .and_then(|turn| turn.get("error"))
                    .filter(|error| !error.is_null())
                {
                    return Err(error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("Codex turn failed.")
                        .to_string());
                }
                if output.trim().is_empty() {
                    output = completed_text.unwrap_or_default();
                }
                if !saw_turn_response {
                    stderr.push_str("Codex completed before acknowledging turn/start. ");
                }
                return Ok(CodexRunResult {
                    route: "app-server".to_string(),
                    output,
                    stderr,
                });
            }
            "error" => {
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
            return Err("Codex app-server timed out before returning a response.".to_string());
        }

        match runtime.receiver.recv_timeout(timeout - elapsed) {
            Ok(Ok(message)) => return Ok(message),
            Ok(Err(error)) => return Err(error),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                return Err("Codex app-server timed out before returning a response.".to_string());
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err("Codex app-server closed unexpectedly.".to_string());
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

fn rpc_error_message(message: &Value) -> Option<String> {
    message
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn run_codex_exec(request: CodexRunRequest, route: &str) -> Result<CodexRunResult, String> {
    let codex = find_codex_binary().ok_or_else(|| "Codex was not found.".to_string())?;
    let cwd = expand_tilde(&request.cwd);
    let timeout =
        Duration::from_millis(request.timeout_ms.unwrap_or(180_000).clamp(10_000, 600_000));
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
        use std::io::Write;
        stdin
            .write_all(request.prompt.as_bytes())
            .map_err(|error| error.to_string())?;
    }

    let started = Instant::now();
    loop {
        if let Some(_status) = child.try_wait().map_err(|error| error.to_string())? {
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

pub fn run() {
    tauri::Builder::default()
        .manage(CodexSessions(Arc::new(Mutex::new(HashMap::new()))))
        .invoke_handler(tauri::generate_handler![
            path_exists,
            read_text_file,
            write_text_file,
            create_dir_all,
            list_dir,
            open_path,
            choose_directory,
            codex_status,
            codex_login,
            codex_run_structured,
            codex_app_session_start,
            codex_app_turn_send,
            codex_app_session_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running Waymark");
}
