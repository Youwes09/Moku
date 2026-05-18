use crate::server::do_log;
use serde::Serialize;
use std::path::PathBuf;
use walkdir::WalkDir;
use tauri::Manager;

#[derive(Serialize, Debug)]
#[serde(tag = "kind", content = "message")]
pub enum SpawnError {
    NotConfigured(String),
    SpawnFailed(String),
}

pub struct ServerInvocation {
    pub bin: String,
    pub args: Vec<String>,
    pub working_dir: Option<PathBuf>,
}

pub fn suwayomi_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("C:\\ProgramData"))
            .join("Tachidesk")
    }
    #[cfg(target_os = "macos")]
    {
        dirs::data_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from("~")))
            .join("Tachidesk")
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let base = std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| dirs::data_dir().unwrap_or_else(|| PathBuf::from("/tmp")));
        base.join("Tachidesk")
    }
}

pub fn strip_unc(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path
    }
}

#[cfg(not(target_os = "macos"))]
fn find_java_in_bundle(bundle_dir: &PathBuf, log: &mut Option<std::fs::File>) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let java = strip_unc(bundle_dir.join("jre").join("bin").join("java.exe"));
    #[cfg(not(target_os = "windows"))]
    let java = bundle_dir.join("jre").join("bin").join("java");

    do_log(
        log,
        &format!("[find_java] path: {:?} exists: {}", java, java.exists()),
    );
    if java.exists() {
        Some(java)
    } else {
        None
    }
}

fn data_root_args() -> Vec<String> {
    vec!["--dataRoot".to_string(), suwayomi_data_dir().to_string_lossy().into_owned()]
}

fn jar_data_root_flag() -> String {
    format!("-Dsuwayomi.server.rootDir={}", suwayomi_data_dir().to_string_lossy())
}

pub fn resolve_server_binary(
    binary: &str,
    app: &tauri::AppHandle,
    log: &mut Option<std::fs::File>,
) -> Result<ServerInvocation, SpawnError> {
    do_log(log, &format!("[resolve] binary = {:?}", binary));

    if !binary.trim().is_empty() {
        let path = strip_unc(PathBuf::from(binary.trim()));
        do_log(
            log,
            &format!("[resolve] user path: {:?} exists={}", path, path.exists()),
        );
        if path.exists() {
            return Ok(ServerInvocation {
                bin: path.to_string_lossy().into_owned(),
                args: data_root_args(),
                working_dir: path.parent().map(|p| p.to_path_buf()),
            });
        }
        do_log(log, "[resolve] user path not found, falling through");
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(bin_dir) = exe.parent() {
            for name in &["tachidesk-server", "suwayomi-launcher"] {
                let p = bin_dir.join(name);
                do_log(
                    log,
                    &format!("[resolve] sibling: {:?} exists={}", p, p.exists()),
                );
                if p.exists() {
                    return Ok(ServerInvocation {
                        bin: p.to_string_lossy().into_owned(),
                        args: data_root_args(),
                        working_dir: Some(bin_dir.to_path_buf()),
                    });
                }
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    let resource_dir = {
        let raw = app.path().resource_dir().unwrap_or_default();
        let stripped = strip_unc(raw);
        do_log(log, &format!("[resolve] resource_dir = {:?}", stripped));
        stripped
    };

    #[cfg(not(target_os = "macos"))]
    {
        let bundle_dir = resource_dir.join("binaries").join("suwayomi-bundle");
        let jar = bundle_dir.join("bin").join("Suwayomi-Server.jar");

        do_log(
            log,
            &format!(
                "[resolve] bundle_dir={:?} exists={}",
                bundle_dir,
                bundle_dir.exists()
            ),
        );
        do_log(
            log,
            &format!("[resolve] jar={:?} exists={}", jar, jar.exists()),
        );

        match find_java_in_bundle(&bundle_dir, log) {
            Some(java) if jar.exists() => {
                do_log(log, "[resolve] using bundled JRE");
                return Ok(ServerInvocation {
                    bin: java.to_string_lossy().into_owned(),
                    args: vec![jar_data_root_flag(), "-jar".to_string(), jar.to_string_lossy().into_owned()],
                    working_dir: Some(bundle_dir),
                });
            }
            _ => do_log(log, "[resolve] bundled JRE/jar not found, falling through"),
        }

        for name in &[
            "suwayomi-launcher",
            "suwayomi-launcher.sh",
            "tachidesk-server",
        ] {
            let p = resource_dir.join(name);
            do_log(
                log,
                &format!("[resolve] sidecar: {:?} exists={}", p, p.exists()),
            );
            if p.exists() {
                return Ok(ServerInvocation {
                    bin: p.to_string_lossy().into_owned(),
                    args: data_root_args(),
                    working_dir: Some(resource_dir.clone()),
                });
            }
        }

        if let Some(java) = find_java_in_bundle(&resource_dir, log) {
            let jar = std::fs::read_dir(&resource_dir).ok().and_then(|mut rd| {
                rd.find(|e| {
                    e.as_ref()
                        .map(|e| e.file_name().to_string_lossy().ends_with(".jar"))
                        .unwrap_or(false)
                })
                .and_then(|e| e.ok())
                .map(|e| e.path())
            });

            if let Some(jar_path) = jar {
                do_log(
                    log,
                    &format!("[resolve] generic JRE java={:?} jar={:?}", java, jar_path),
                );
                return Ok(ServerInvocation {
                    bin: java.to_string_lossy().into_owned(),
                    args: vec![jar_data_root_flag(), "-jar".to_string(), jar_path.to_string_lossy().into_owned()],
                    working_dir: Some(resource_dir),
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let resource_dir = app.path().resource_dir().unwrap_or_default();
        let contents_dir = resource_dir.parent().unwrap_or(&resource_dir).to_path_buf();

        do_log(
            log,
            &format!("[resolve] macOS contents_dir = {:?}", contents_dir),
        );

        const NATIVE_NAMES: &[&str] = &[
            "suwayomi-server-aarch64-apple-darwin",
            "suwayomi-server-x86_64-apple-darwin",
            "suwayomi-server",
            "suwayomi-launcher",
            "suwayomi-launcher.sh",
            "tachidesk-server",
        ];

        let mut found_binary: Option<ServerInvocation> = None;
        let mut found_java: Option<(PathBuf, PathBuf)> = None;

        'outer: for depth in 0u8..=8 {
            let entries: Vec<PathBuf> = WalkDir::new(&contents_dir)
                .min_depth(depth as usize)
                .max_depth(depth as usize)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_dir())
                .map(|e| e.into_path())
                .collect();

            for dir in &entries {
                do_log(
                    log,
                    &format!("[resolve] scanning depth={} dir={:?}", depth, dir),
                );

                for name in NATIVE_NAMES {
                    let p = dir.join(name);
                    if p.exists() {
                        do_log(log, &format!("[resolve] found native binary: {:?}", p));
                        found_binary = Some(ServerInvocation {
                            bin: p.to_string_lossy().into_owned(),
                            args: data_root_args(),
                            working_dir: Some(dir.clone()),
                        });
                        break 'outer;
                    }
                }

                if found_java.is_none() {
                    let java_exe = dir.join("bin").join("java");
                    if java_exe.exists() {
                        do_log(log, &format!("[resolve] found java: {:?}", java_exe));
                        let mut search = dir.as_path();
                        'jar: for _ in 0..5 {
                            if let Ok(rd) = std::fs::read_dir(search) {
                                for entry in rd.filter_map(|e| e.ok()) {
                                    if entry.file_name().to_string_lossy().ends_with(".jar") {
                                        let jar = entry.path();
                                        do_log(log, &format!("[resolve] found jar: {:?}", jar));
                                        found_java = Some((java_exe.clone(), jar));
                                        break 'jar;
                                    }
                                }
                            }
                            let bin_sibling = search.join("bin");
                            if let Ok(rd) = std::fs::read_dir(&bin_sibling) {
                                for entry in rd.filter_map(|e| e.ok()) {
                                    if entry.file_name().to_string_lossy().ends_with(".jar") {
                                        let jar = entry.path();
                                        do_log(
                                            log,
                                            &format!("[resolve] found jar in bin/: {:?}", jar),
                                        );
                                        found_java = Some((java_exe.clone(), jar));
                                        break 'jar;
                                    }
                                }
                            }
                            match search.parent() {
                                Some(p) => search = p,
                                None => break,
                            }
                        }
                    }
                }
            }
        }

        if let Some(inv) = found_binary {
            return Ok(inv);
        }

        if let Some((java, jar)) = found_java {
            let working_dir = jar.parent().map(|p| p.to_path_buf());
            return Ok(ServerInvocation {
                bin: java.to_string_lossy().into_owned(),
                args: vec![jar_data_root_flag(), "-jar".to_string(), jar.to_string_lossy().into_owned()],
                working_dir,
            });
        }

        do_log(log, "[resolve] macOS scan found nothing in bundle");
    }

    for name in &["suwayomi-server", "tachidesk-server"] {
        #[cfg(target_os = "windows")]
        let resolved = std::process::Command::new("where")
            .arg(name)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.lines().next().map(|l| l.trim().to_string()));
        #[cfg(not(target_os = "windows"))]
        let resolved = std::process::Command::new("which")
            .arg(name)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.lines().next().map(|l| l.trim().to_string()));

        if let Some(bin_path) = resolved {
            do_log(log, &format!("[resolve] found on PATH: {:?}", bin_path));
            return Ok(ServerInvocation {
                bin: bin_path,
                args: vec![],
                working_dir: None,
            });
        }
    }

    Err(SpawnError::NotConfigured(
        "Server binary not found. Install Suwayomi-Server or set the path in Settings.".to_string(),
    ))
}