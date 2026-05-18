#[cfg(target_os = "windows")]
use crate::server::resolve::strip_unc;
#[cfg(target_os = "windows")]
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub fn get_platform_ui_scale(window: tauri::Window) -> f64 {
    window.scale_factor().unwrap_or(1.0)
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    tauri::process::restart(&app.env());
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let p = strip_unc(PathBuf::from(path.trim()));
        std::process::Command::new("explorer")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let p = std::path::Path::new(path.trim());
        std::process::Command::new("open")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let p = std::path::Path::new(path.trim());
        std::process::Command::new("xdg-open")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pick_downloads_folder(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    app.dialog()
        .file()
        .set_title("Choose Downloads Folder")
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn remove_dir_best_effort(path: &std::path::Path) {
    if path.is_file() {
        if let Err(e) = std::fs::remove_file(path) {
            if e.raw_os_error() == Some(32) {
                return;
            }
        }
    } else if path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                remove_dir_best_effort(&entry.path());
            }
        }
        let _ = std::fs::remove_dir(path);
    }
}

fn wait_until_deletable(path: &std::path::Path, timeout_secs: u64) -> bool {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    while std::time::Instant::now() < deadline {
        let locked = if path.is_file() {
            std::fs::OpenOptions::new().write(true).open(path).is_err()
        } else if path.is_dir() {
            std::fs::read_dir(path).is_err()
        } else {
            return true;
        };
        if !locked {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    false
}

#[tauri::command]
pub async fn clear_moku_cache(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("no main window")?;

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    // Note: We intentionally skip the WebView2 COM-level ClearBrowsingDataAll call here.
    // The webview2_com crate pulls in a different version of windows_core than Tauri's
    // own windows dependency, causing irreconcilable trait-impl conflicts at compile time.
    // The filesystem cache removal below (app_cache_dir) is sufficient for our purposes;
    // WebView2 will rebuild its cache on next launch from a clean directory.
    window
        .with_webview(move |_wv| {
            let _ = tx.send(Ok(()));
        })
        .map_err(|e| e.to_string())?;

    rx.await.map_err(|e| e.to_string())??;

    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    if cache_dir.exists() {
        wait_until_deletable(&cache_dir, 3);
        remove_dir_best_effort(&cache_dir);
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn clear_suwayomi_cache() -> Result<(), String> {
    use crate::server::resolve::suwayomi_data_dir;
    let data_dir = suwayomi_data_dir();
    for dir in &["cache/kcef", "logs"] {
        let p = data_dir.join(dir);
        if p.exists() {
            remove_dir_best_effort(&p);
        }
    }
    for dir in &["downloads/thumbnails"] {
        let p = data_dir.join(dir);
        if p.exists() {
            remove_dir_best_effort(&p);
            let _ = std::fs::create_dir_all(&p);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn reset_suwayomi_data(app: tauri::AppHandle) -> Result<(), String> {
    use crate::server::resolve::suwayomi_data_dir;

    crate::server::kill_tachidesk(&app);

    let data_dir = suwayomi_data_dir();
    let targets = ["database.mv.db", "extensions", "settings", "logs", "local"];

    for entry_name in &targets {
        let p = data_dir.join(entry_name);
        if p.exists() {
            wait_until_deletable(&p, 10);
        }
    }

    for entry_name in &targets {
        let p = data_dir.join(entry_name);
        if p.is_dir() {
            std::fs::remove_dir_all(&p).map_err(|e| format!("{entry_name}: {e}"))?;
        } else if p.exists() {
            std::fs::remove_file(&p).map_err(|e| format!("{entry_name}: {e}"))?;
        }
    }
    Ok(())
}