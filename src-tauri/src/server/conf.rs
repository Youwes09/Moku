use std::path::PathBuf;

const DEFAULT_SERVER_CONF: &str = r#"server.ip = "127.0.0.1"
server.port = 4567
server.webUIEnabled = false
server.initialOpenInBrowserEnabled = false
server.systemTrayEnabled = false
server.webUIInterface = "browser"
server.webUIFlavor = "WebUI"
server.webUIChannel = "preview"
server.electronPath = ""
server.debugLogsEnabled = false
server.downloadAsCbz = true
server.autoDownloadNewChapters = false
server.globalUpdateInterval = 12
server.maxSourcesInParallel = 6
server.extensionRepos = []
"#;

pub fn seed_server_conf(data_dir: &PathBuf, web_ui_enabled: bool) {
    let conf_path = data_dir.join("server.conf");

    if !conf_path.exists() {
        if let Err(e) = std::fs::create_dir_all(data_dir) {
            eprintln!("Could not create Suwayomi data dir: {e}");
            return;
        }
        let initial = patch_conf_key(
            DEFAULT_SERVER_CONF.to_string(),
            "server.webUIEnabled",
            if web_ui_enabled { "true" } else { "false" },
        );
        if let Err(e) = std::fs::write(&conf_path, initial) {
            eprintln!("Could not write server.conf: {e}");
        }
        return;
    }

    let Ok(contents) = std::fs::read_to_string(&conf_path) else {
        return;
    };

    let patched = patch_conf_key(
        patch_conf_key(
            patch_conf_key(
                contents,
                "server.webUIEnabled",
                if web_ui_enabled { "true" } else { "false" },
            ),
            "server.initialOpenInBrowserEnabled",
            "false",
        ),
        "server.systemTrayEnabled",
        "false",
    );

    let _ = std::fs::write(&conf_path, patched);
}

fn patch_conf_key(text: String, key: &str, value: &str) -> String {
    let replacement = format!("{key} = {value}");
    let lines: Vec<&str> = text.lines().collect();

    if let Some(pos) = lines.iter().position(|l| l.trim_start().starts_with(key)) {
        let mut out = lines
            .iter()
            .enumerate()
            .map(|(i, l)| if i == pos { replacement.as_str() } else { l })
            .collect::<Vec<_>>()
            .join("\n");
        out.push('\n');
        return out;
    }

    let mut out = text;
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out.push_str(&replacement);
    out.push('\n');
    out
}