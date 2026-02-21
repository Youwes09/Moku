use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::{ShellExt, process::CommandChild};

struct ServerState(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerState(Mutex::new(None)))
        .setup(|app| {
            let shell = app.shell();
            let app_handle = app.handle().clone();

            let status = shell.command("tachidesk-server").spawn();

            match status {
                Ok((_rx, child)) => {
                    println!("Tachidesk server process spawned successfully.");
                    let state = app_handle.state::<ServerState>();
                    let mut guard = state.0.lock().unwrap();
                    *guard = Some(child);
                }
                Err(e) => {
                    eprintln!("Failed to spawn Tachidesk server: {}", e);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running moku");
}