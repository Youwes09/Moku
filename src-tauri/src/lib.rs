use std::path::PathBuf;
use std::sync::Mutex;
use nix::sys::statvfs::statvfs;
use serde::Serialize;
use tauri::Manager;
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

    // f_frsize is the fundamental block size used for block counts.
    // f_bsize (block_size()) is just the preferred I/O size and must not be
    // used with blocks()/blocks_free() — that gives wildly wrong numbers.
    let frsize      = vfs.fragment_size() as u64;
    let total_bytes = vfs.blocks()            * frsize;
    let free_bytes  = vfs.blocks_available()  * frsize;

    Ok(StorageInfo {
        manga_bytes,
        total_bytes,
        free_bytes,
        path: path.to_string_lossy().into_owned(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_storage_info])
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