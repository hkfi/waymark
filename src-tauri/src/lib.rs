mod codex;
mod file_commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            Ok(())
        })
        .manage(codex::CodexSessions::new())
        .invoke_handler(tauri::generate_handler![
            file_commands::path_exists,
            file_commands::read_text_file,
            file_commands::write_text_file,
            file_commands::remove_file,
            file_commands::create_dir_all,
            file_commands::list_dir,
            file_commands::open_path,
            file_commands::choose_directory,
            codex::codex_status,
            codex::codex_login,
            codex::codex_run_structured,
            codex::codex_app_session_start,
            codex::codex_app_turn_send,
            codex::codex_app_session_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running Waymark");
}
