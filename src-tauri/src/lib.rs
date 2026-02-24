use std::path::PathBuf;
use std::sync::Mutex;
use nix::sys::statvfs::statvfs;
use serde::Serialize;
use tauri::{Manager, WindowEvent};
use tauri_plugin_shell::{ShellExt, process::CommandChild};
use walkdir::WalkDir;

struct ServerState(Mutex<Option<CommandChild>>);

#[derive(Serialize)]
pub struct StorageInfo {
    manga_bytes: u64,
    total_bytes: u64,
    free_bytes:  u64,
    path:        String,
}

fn resolve_downloads_path(downloads_path: &str) -> PathBuf {
    if !downloads_path.trim().is_empty() {
        return PathBuf::from(downloads_path);
    }
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("/"))
                .join(".local/share")
        });
    base.join("Tachidesk/downloads")
}

#[tauri::command]
fn get_storage_info(downloads_path: String) -> Result<StorageInfo, String> {
    let path = resolve_downloads_path(&downloads_path);

    let manga_bytes = if path.exists() {
        WalkDir::new(&path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter_map(|e| e.metadata().ok())
            .filter(|m| m.is_file())
            .map(|m| m.len())
            .sum()
    } else {
        0
    };

    let stat_path = if path.exists() { path.clone() } else {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
    };
    let vfs = statvfs(&stat_path).map_err(|e| e.to_string())?;

    let frsize      = vfs.fragment_size() as u64;
    let total_bytes = vfs.blocks()           * frsize;
    let free_bytes  = vfs.blocks_available() * frsize;

    Ok(StorageInfo {
        manga_bytes,
        total_bytes,
        free_bytes,
        path: path.to_string_lossy().into_owned(),
    })
}

fn kill_tachidesk(app: &tauri::AppHandle) {
    // Kill the tracked child handle
    let state = app.state::<ServerState>();
    let mut guard = state.0.lock().unwrap();
    if let Some(child) = guard.take() {
        let _ = child.kill();
        println!("Killed tracked server child.");
    }
    // Belt-and-suspenders: the JVM registers its process name as "tachidesk",
    // not "tachidesk-server", so pkill must target the short name.
    let _ = std::process::Command::new("pkill")
        .arg("-f")
        .arg("tachidesk")
        .status();
}

/// Spawn the server. Guards against double-spawn — if a child is already
/// tracked, this is a no-op (handles React StrictMode double-invoke in dev).
#[tauri::command]
fn spawn_server(binary: String, app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<ServerState>();
    {
        let guard = state.0.lock().unwrap();
        if guard.is_some() {
            println!("Server already running, skipping spawn.");
            return Ok(());
        }
    }

    let shell = app.shell();
    match shell.command(&binary).spawn() {
        Ok((_rx, child)) => {
            println!("Spawned server: {}", binary);
            let mut guard = state.0.lock().unwrap();
            *guard = Some(child);
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to spawn {}: {}", binary, e);
            Err(e.to_string())
        }
    }
}

/// Explicit kill — called from App.tsx cleanup. The window-close handler
/// below is the authoritative kill path; this is a secondary safety net.
#[tauri::command]
fn kill_server(app: tauri::AppHandle) -> Result<(), String> {
    kill_tachidesk(&app);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_storage_info,
            spawn_server,
            kill_server,
        ])
        .setup(|_app| Ok(()))
        .on_window_event(|window, event| {
            // Kill the server when the main window is actually destroyed.
            // This fires reliably on close regardless of whether the JS
            // cleanup callback ran.
            if let WindowEvent::Destroyed = event {
                kill_tachidesk(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running moku");
}