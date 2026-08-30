use serde::Serialize;
use std::path::PathBuf;
use sysinfo::Disks;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use walkdir::WalkDir;

#[tauri::command]
pub fn load_store(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let store = app
        .store(format!("{}.json", key))
        .map_err(|e| e.to_string())?;
    let value = store.get(&key);
    Ok(value.map(|v| v.to_string()))
}

#[tauri::command]
pub fn save_store(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let store = app
        .store(format!("{}.json", key))
        .map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&value).map_err(|e| e.to_string())?;
    store.set(key, parsed);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn store_credential(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let store = app.store("credentials.json").map_err(|e| e.to_string())?;
    if value.is_empty() {
        store.delete(&key);
    } else {
        store.set(&key, serde_json::Value::String(value));
    }
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_credential(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let store = app.store("credentials.json").map_err(|e| e.to_string())?;
    Ok(store
        .get(&key)
        .and_then(|v| v.as_str().map(|s| s.to_owned())))
}

#[derive(Serialize)]
pub struct StorageInfo {
    pub manga_bytes: u64,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub path: String,
}

fn moku_data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn resolve_downloads_path(app: &tauri::AppHandle, downloads_path: &str) -> PathBuf {
    if !downloads_path.trim().is_empty() {
        return PathBuf::from(downloads_path.trim());
    }
    moku_data_dir(app).join("downloads")
}

#[tauri::command]
pub fn get_storage_info(
    app: tauri::AppHandle,
    downloads_path: String,
) -> Result<StorageInfo, String> {
    let path = resolve_downloads_path(&app, &downloads_path);

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

    let stat_path = if path.exists() {
        path.clone()
    } else {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
    };

    let disks = Disks::new_with_refreshed_list();
    let disk = disks
        .iter()
        .filter(|d| stat_path.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .ok_or_else(|| "Could not find disk for path".to_string())?;

    Ok(StorageInfo {
        manga_bytes,
        total_bytes: disk.total_space(),
        free_bytes: disk.available_space(),
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn get_default_downloads_path(app: tauri::AppHandle) -> String {
    resolve_downloads_path(&app, "")
        .to_string_lossy()
        .into_owned()
}

#[tauri::command]
pub fn check_path_exists(path: String) -> bool {
    std::path::Path::new(path.trim()).is_dir()
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(path.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn migrate_downloads(
    app: tauri::AppHandle,
    src: String,
    dst: String,
) -> Result<(), String> {
    use std::fs;

    let src_path = PathBuf::from(src.trim());
    let dst_path = PathBuf::from(dst.trim());

    if !src_path.is_dir() {
        return Ok(());
    }

    let total: u64 = WalkDir::new(&src_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .count() as u64;

    let _ = app.emit(
        "migrate_progress",
        serde_json::json!({ "done": 0u64, "total": total, "current": "" }),
    );

    let mut done: u64 = 0;

    for entry in WalkDir::new(&src_path).into_iter().filter_map(|e| e.ok()) {
        let rel = entry
            .path()
            .strip_prefix(&src_path)
            .map_err(|e| e.to_string())?;
        let target = dst_path.join(rel);

        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
            done += 1;
            let _ = app.emit(
                "migrate_progress",
                serde_json::json!({
                    "done": done, "total": total, "current": rel.to_string_lossy()
                }),
            );
        }
    }

    fs::remove_dir_all(&src_path).map_err(|e| e.to_string())?;
    Ok(())
}
