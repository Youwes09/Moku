use std::path::PathBuf;
use std::sync::Mutex;
use sysinfo::Disks;
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
            dirs::data_dir()
                .unwrap_or_else(|| PathBuf::from("/"))
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

    let disks = Disks::new_with_refreshed_list();
    let disk = disks
        .iter()
        .filter(|d| stat_path.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .ok_or_else(|| "Could not find disk for path".to_string())?;

    let total_bytes = disk.total_space();
    let free_bytes  = disk.available_space();

    Ok(StorageInfo {
        manga_bytes,
        total_bytes,
        free_bytes,
        path: path.to_string_lossy().into_owned(),
    })
}

/// Returns the true OS-level scale factor for the main window.
/// On Linux this bypasses WebKitGTK's unreliable devicePixelRatio.
/// On macOS the value comes directly from the native window.
#[tauri::command]
fn get_scale_factor(window: tauri::Window) -> f64 {
    window.scale_factor().unwrap_or(1.0)
}

fn kill_tachidesk(app: &tauri::AppHandle) {
    let state = app.state::<ServerState>();
    let mut guard = state.0.lock().unwrap();
    if let Some(child) = guard.take() {
        let _ = child.kill();
        println!("Killed tracked server child.");
    }

    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/FI", "IMAGENAME eq tachidesk*"])
        .status();

    #[cfg(not(target_os = "windows"))]
    let _ = std::process::Command::new("pkill")
        .arg("-f")
        .arg("tachidesk")
        .status();
}

/// The default server.conf we seed on first launch.
/// Mirrors the Flatpak wrapper: headless, no tray, no browser pop-up.
const DEFAULT_SERVER_CONF: &str = r#"server.ip = "127.0.0.1"
server.port = 4567
server.webUIEnabled = false
server.initialOpenInBrowserEnabled = false
server.systemTrayEnabled = false
server.webUIInterface = "browser"
server.webUIFlavor = "WebUI"
server.webUIChannel = "stable"
server.electronPath = ""
server.debugLogsEnabled = false
server.downloadAsCbz = true
server.autoDownloadNewChapters = false
server.globalUpdateInterval = 12
server.maxSourcesInParallel = 6
server.extensionRepos = []
"#;

/// Ensure the Suwayomi data dir and server.conf exist, and that the three
/// keys that cause GUI/JCEF crashes are always set to safe values.
/// This mirrors the shell-script logic in the Flatpak's tachidesk-server wrapper.
fn seed_server_conf(data_dir: &PathBuf) {
    let conf_path = data_dir.join("server.conf");

    if !conf_path.exists() {
        if let Err(e) = std::fs::create_dir_all(data_dir) {
            eprintln!("Could not create Suwayomi data dir: {e}");
            return;
        }
        if let Err(e) = std::fs::write(&conf_path, DEFAULT_SERVER_CONF) {
            eprintln!("Could not write server.conf: {e}");
        }
        return;
    }

    // Conf already exists — patch the three critical keys in-place.
    let Ok(contents) = std::fs::read_to_string(&conf_path) else { return };

    let patched = patch_conf_key(
        patch_conf_key(
            patch_conf_key(
                contents,
                "server.webUIEnabled",
                "false",
            ),
            "server.initialOpenInBrowserEnabled",
            "false",
        ),
        "server.systemTrayEnabled",
        "false",
    );

    let _ = std::fs::write(&conf_path, patched);
}

/// Replace `key = <value>` in a HOCON/properties-style conf, or append it
/// if the key is absent.
fn patch_conf_key(mut text: String, key: &str, value: &str) -> String {
    let replacement = format!("{key} = {value}");
    // Find a line that starts with the key (tolerant of surrounding whitespace)
    if let Some(pos) = text.lines().position(|l| l.trim_start().starts_with(key)) {
        let mut lines: Vec<&str> = text.lines().collect();
        // We need an owned replacement; rebuild from scratch.
        let owned: Vec<String> = lines
            .iter()
            .enumerate()
            .map(|(i, l)| {
                if i == pos { replacement.clone() } else { l.to_string() }
            })
            .collect();
        return owned.join("\n");
    }
    // Key absent — append.
    if !text.ends_with('\n') { text.push('\n'); }
    text.push_str(&replacement);
    text.push('\n');
    text
}

/// Resolve the Suwayomi data directory.
///
/// - Linux:  $XDG_DATA_HOME/moku/tachidesk  (matches Flatpak path)
/// - macOS:  ~/Library/Application Support/dev.moku.app/tachidesk
fn suwayomi_data_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        dirs::data_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from("~")))
            .join("dev.moku.app/tachidesk")
    }
    #[cfg(not(target_os = "macos"))]
    {
        let base = std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                dirs::data_dir().unwrap_or_else(|| PathBuf::from("/tmp"))
            });
        base.join("moku/tachidesk")
    }
}

/// Resolve the server binary path.
///
/// If the frontend passes a non-empty `binary` string (user override in
/// Settings) we always use that — on Linux this is the nixpkgs/Flatpak path.
///
/// Otherwise we look for the Tauri-bundled sidecar inside the .app's
/// Resources directory (macOS) or alongside the binary (other platforms).
fn resolve_server_binary(
    binary: &str,
    app: &tauri::AppHandle,
) -> Result<std::ffi::OsString, String> {
    if !binary.trim().is_empty() {
        return Ok(std::ffi::OsString::from(binary));
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Could not locate resource dir: {e}"))?;

    // Tauri places sidecars as  <stem>-<target-triple>  in the resource dir.
    let candidates = [
        "suwayomi-server-aarch64-apple-darwin",
        "suwayomi-server-x86_64-apple-darwin",
        // plain name as a dev/Linux fallback
        "suwayomi-server",
    ];

    for name in &candidates {
        let p = resource_dir.join(name);
        if p.exists() {
            return Ok(p.into_os_string());
        }
    }

    Err("Suwayomi server binary not found. Please set the path in Settings.".to_string())
}

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

    // Seed server.conf before launching so Suwayomi starts in headless mode.
    let data_dir = suwayomi_data_dir();
    seed_server_conf(&data_dir);

    let bin = resolve_server_binary(&binary, &app)?;
    let shell = app.shell();
    match shell
        .command(&bin)
        // Tell Suwayomi where to put its data (rootDir flag).
        .env("JAVA_TOOL_OPTIONS", "-Djava.awt.headless=true")
        .args([&format!(
            "-Dsuwayomi.tachidesk.config.server.rootDir={}",
            data_dir.to_string_lossy()
        )])
        .spawn()
    {
        Ok((_rx, child)) => {
            println!("Spawned server: {:?}", bin);
            let mut guard = state.0.lock().unwrap();
            *guard = Some(child);
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to spawn {:?}: {}", bin, e);
            Err(e.to_string())
        }
    }
}

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
            get_scale_factor,
        ])
        .setup(|_app| Ok(()))
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                kill_tachidesk(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running moku");
}