use serde::Serialize;
use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub(crate) struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
pub(crate) fn path_exists(path: String) -> bool {
    Path::new(&expand_tilde(&path)).exists()
}

#[tauri::command]
pub(crate) fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(expand_tilde(&path)).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let path = expand_tilde(&path);
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn remove_file(path: String) -> Result<(), String> {
    let path = expand_tilde(&path);
    let file_path = Path::new(&path);
    if file_path.is_dir() {
        return Err("Expected a file path, received a directory.".to_string());
    }

    fs::remove_file(file_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn create_dir_all(path: String) -> Result<(), String> {
    fs::create_dir_all(expand_tilde(&path)).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
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
pub(crate) fn open_path(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(expand_tilde(&path))
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub(crate) async fn choose_directory(
    app: tauri::AppHandle,
    title: Option<String>,
) -> Result<Option<String>, String> {
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let title = title.unwrap_or_else(|| "Open Waymark workspace".to_string());
            app.dialog()
                .file()
                .set_title(&title)
                .blocking_pick_folder()
                .map(|path| {
                    path.into_path()
                        .map(|path| path.to_string_lossy().trim_end_matches('/').to_string())
                        .map_err(|error| error.to_string())
                })
                .transpose()
        })
        .await
        .map_err(|error| error.to_string())?
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("Folder picker is not available on this platform yet.".to_string())
    }
}

pub(crate) fn expand_tilde(path: &str) -> String {
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
