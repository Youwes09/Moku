use tauri::Manager;

#[cfg(target_os = "windows")]
use std::path::PathBuf;

#[cfg(target_os = "windows")]
fn strip_unc(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    let stripped = s.strip_prefix(r"\\?\").unwrap_or(&s);
    PathBuf::from(stripped)
}

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

#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    use font_kit::source::SystemSource;
    let mut families = SystemSource::new().all_families().unwrap_or_default();
    families.retain(|f| !f.is_empty() && !f.starts_with('.'));
    families.sort_by_key(|f| f.to_lowercase());
    families.dedup();
    families
}

fn remove_dir_best_effort(path: &std::path::Path) {
    if path.is_file() {
        let _ = std::fs::remove_file(path);
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
