use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
pub struct ReleaseInfo {
    pub tag_name: String,
    pub name: String,
    pub body: String,
    pub published_at: String,
    pub html_url: String,
}

#[derive(Clone, Serialize)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn list_releases() -> Result<Vec<ReleaseInfo>, String> {
    use tauri_plugin_http::reqwest;

    #[derive(Deserialize)]
    struct GhRelease {
        tag_name: String,
        name: Option<String>,
        body: Option<String>,
        published_at: Option<String>,
        html_url: String,
    }

    let client = reqwest::Client::builder()
        .user_agent("Moku")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://api.github.com/repos/moku-project/Moku/releases?per_page=30")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    let releases: Vec<GhRelease> =
        serde_json::from_str(&resp.text().await.map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

    Ok(releases
        .into_iter()
        .map(|r| ReleaseInfo {
            tag_name: r.tag_name.clone(),
            name: r.name.unwrap_or_else(|| r.tag_name.clone()),
            body: r.body.unwrap_or_default(),
            published_at: r.published_at.unwrap_or_default(),
            html_url: r.html_url,
        })
        .collect())
}

#[tauri::command]
#[allow(unused_variables)]
pub async fn download_and_install_update(app: tauri::AppHandle, tag: String) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    return Err("Native install is Windows-only; open the GitHub release page instead.".into());

    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        use tauri::Emitter;
        use tauri_plugin_http::reqwest;

        #[derive(Deserialize)]
        struct Asset {
            name: String,
            browser_download_url: String,
            size: u64,
        }
        #[derive(Deserialize)]
        struct Release {
            assets: Vec<Asset>,
        }

        let client = reqwest::Client::builder()
            .user_agent("Moku")
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(format!(
                "https://api.github.com/repos/moku-project/Moku/releases/tags/{}",
                tag
            ))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!(
                "GitHub API returned {} for tag {}",
                resp.status(),
                tag
            ));
        }

        let release: Release = serde_json::from_str(&resp.text().await.map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

        let asset = release
            .assets
            .into_iter()
            .find(|a| a.name.ends_with("_x64-setup.exe"))
            .ok_or_else(|| format!("No x64-setup.exe asset found in release {}", tag))?;

        let total = if asset.size > 0 {
            Some(asset.size)
        } else {
            None
        };
        let mut resp = client
            .get(&asset.browser_download_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let tmp_path = std::env::temp_dir().join(&asset.name);
        let mut file = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        let mut downloaded: u64 = 0;

        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            let _ = app.emit("update-progress", UpdateProgress { downloaded, total });
        }
        drop(file);

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new(&tmp_path)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;

        let _ = app.emit("update-launching", ());

        Ok(())
    }
}
