use std::path::PathBuf;
use tauri::Manager;

fn backup_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("backups")
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[tauri::command]
pub async fn export_app_data(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let filename = format!("moku-backup-{}.zip", unix_now());

    let path = app
        .dialog()
        .file()
        .set_title("Save Moku app data backup")
        .set_file_name(&filename)
        .add_filter("Moku Backup", &["zip"])
        .blocking_save_file()
        .ok_or("Cancelled")?;

    std::fs::write(PathBuf::from(path.to_string()), &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_app_data(app: tauri::AppHandle) -> Result<Vec<u8>, String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .set_title("Open Moku app data backup")
        .add_filter("Moku Backup", &["zip"])
        .blocking_pick_file()
        .ok_or("Cancelled")?;

    std::fs::read(PathBuf::from(path.to_string())).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn auto_backup_app_data(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    let dir = backup_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let dest = dir.join(format!("auto-moku-backup-{}.zip", unix_now()));
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;

    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("auto-moku-backup-")
        })
        .collect();

    entries.sort_by_key(|e| e.file_name());

    for old in entries.iter().take(entries.len().saturating_sub(5)) {
        let _ = std::fs::remove_file(old.path());
    }

    Ok(())
}

#[tauri::command]
pub fn get_auto_backup_dir(app: tauri::AppHandle) -> String {
    let dir = backup_dir(&app);
    let _ = std::fs::create_dir_all(&dir);
    dir.to_string_lossy().into_owned()
}

#[tauri::command]
pub fn read_store_files(app: tauri::AppHandle, names: Vec<String>) -> Vec<(String, String)> {
    let base = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    names
        .into_iter()
        .map(|name| {
            let content = std::fs::read_to_string(base.join(&name))
                .unwrap_or_else(|_| "{}".to_string());
            (name, content)
        })
        .collect()
}