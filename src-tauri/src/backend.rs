use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

pub struct Backend {
    child: Mutex<Option<Child>>,
    url: Mutex<Option<String>>,
    data_dir: Mutex<Option<PathBuf>>,
    log_tail: Mutex<Vec<String>>,
}

impl Backend {
    pub fn new() -> Self {
        Backend {
            child: Mutex::new(None),
            url: Mutex::new(None),
            data_dir: Mutex::new(None),
            log_tail: Mutex::new(Vec::new()),
        }
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum BackendEvent {
    Starting,
    Ready { url: String, version: String },
    Failed { message: String, log: String },
    Crashed { code: Option<i32>, log: String },
}

const READY_TIMEOUT_SECS: u64 = 20;
const LOG_CAP: usize = 4000;
const TSUNAGU_EXE: &str = if cfg!(windows) {
    "tsunagu.exe"
} else {
    "tsunagu"
};

async fn push_log(app: &AppHandle, line: String) {
    let st = app.state::<Backend>();
    {
        let mut t = st.log_tail.lock().await;
        t.push(line.clone());
        let n = t.len();
        if n > LOG_CAP {
            t.drain(0..n - LOG_CAP);
        }
    }
    let _ = app.emit("backend-log", line);
}

fn resource_root(app: &AppHandle) -> PathBuf {
    let res = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    if res.join(TSUNAGU_EXE).exists() {
        return res;
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    if dev.join(TSUNAGU_EXE).exists() {
        return dev;
    }
    res
}

fn tsunagu_bin(app: &AppHandle) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("TSUNAGU_BIN").map(PathBuf::from) {
        if p.exists() {
            return Some(p);
        }
    }
    let p = resource_root(app).join(TSUNAGU_EXE);
    p.exists().then_some(p)
}

fn tsunagu_data_dir(app: &AppHandle) -> PathBuf {
    if let Some(d) = std::env::var_os("TSUNAGU_DATA_DIR").map(PathBuf::from) {
        let _ = std::fs::create_dir_all(&d);
        return d;
    }
    let base = if cfg!(target_os = "linux") {
        dirs::data_dir()
    } else {
        dirs::config_dir()
    };
    let dir = base
        .or_else(|| app.path().app_config_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
        .join(if cfg!(target_os = "linux") {
            "tsunagu"
        } else {
            "Tsunagu"
        });
    let _ = std::fs::create_dir_all(&dir);
    dir
}

async fn tail_string(state: &State<'_, Backend>) -> String {
    state.log_tail.lock().await.join("\n")
}

pub async fn start(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Backend>();
    app.emit("backend", BackendEvent::Starting).ok();

    let root = resource_root(&app);
    let data = tsunagu_data_dir(&app);
    *state.data_dir.lock().await = Some(data.clone());
    state.log_tail.lock().await.clear();

    let Some(bin) = tsunagu_bin(&app) else {
        let msg = "server binary not found (no TSUNAGU_BIN, no bundled sidecar)".to_string();
        app.emit(
            "backend",
            BackendEvent::Failed {
                message: msg.clone(),
                log: String::new(),
            },
        )
        .ok();
        return Err(msg);
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755));
    }

    let mut cmd = Command::new(&bin);
    cmd.arg("--data-dir")
        .arg(&data)
        .env("TSUNAGU_ADDR", ":6007")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if root.join("sandbox").is_dir() {
        cmd.env("TSUNAGU_RESOURCE_DIR", &root);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    #[cfg(target_os = "linux")]
    unsafe {
        cmd.pre_exec(|| {
            nix::sys::prctl::set_pdeathsig(nix::sys::signal::Signal::SIGTERM)
                .map_err(std::io::Error::from)
        });
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("could not launch the server ({}): {e}", bin.display());
            app.emit(
                "backend",
                BackendEvent::Failed {
                    message: msg.clone(),
                    log: String::new(),
                },
            )
            .ok();
            return Err(msg);
        }
    };

    if let Some(stderr) = child.stderr.take() {
        let app2 = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                push_log(&app2, l).await;
            }
        });
    }

    let stdout = child.stdout.take().unwrap();
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<(String, String)>();
    {
        let app2 = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            let mut ready_tx = Some(ready_tx);
            while let Ok(Some(l)) = lines.next_line().await {
                if let Some(tx) = ready_tx.take() {
                    let mut url = String::new();
                    let mut ver = String::new();
                    if let Some(rest) = l.strip_prefix("TSUNAGU_READY ") {
                        for kv in rest.split_whitespace() {
                            if let Some(v) = kv.strip_prefix("url=") {
                                url = v.to_string();
                            } else if let Some(v) = kv.strip_prefix("version=") {
                                ver = v.to_string();
                            }
                        }
                    }
                    if url.is_empty() {
                        ready_tx = Some(tx);
                    } else {
                        let _ = tx.send((url, ver));
                    }
                }
                push_log(&app2, l).await;
            }
        });
    }

    let ready = tokio::time::timeout(Duration::from_secs(READY_TIMEOUT_SECS), ready_rx).await;

    match ready {
        Ok(Ok((url, version))) => {
            *state.child.lock().await = Some(child);
            *state.url.lock().await = Some(url.clone());

            let app3 = app.clone();
            tokio::spawn(async move {
                let st = app3.state::<Backend>();
                loop {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    let exited = {
                        let mut guard = st.child.lock().await;
                        let Some(c) = guard.as_mut() else { return };
                        match c.try_wait() {
                            Ok(Some(status)) => {
                                *guard = None;
                                Some(status.code())
                            }
                            Ok(None) => None,
                            Err(_) => return,
                        }
                    };
                    if let Some(code) = exited {
                        let log = st.log_tail.lock().await.join("\n");
                        app3.emit("backend", BackendEvent::Crashed { code, log })
                            .ok();
                        return;
                    }
                }
            });

            let client = reqwest::Client::new();
            for _ in 0..50 {
                if client
                    .get(format!("{url}/healthz"))
                    .send()
                    .await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false)
                {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }

            app.emit("backend", BackendEvent::Ready { url, version })
                .ok();
            Ok(())
        }
        Ok(Err(_)) => {
            let _ = child.kill().await;
            let log = tail_string(&state).await;
            app.emit(
                "backend",
                BackendEvent::Failed {
                    message: "the server exited before it was ready".into(),
                    log: log.clone(),
                },
            )
            .ok();
            Err(log)
        }
        Err(_) => {
            let _ = child.kill().await;
            let log = tail_string(&state).await;
            app.emit(
                "backend",
                BackendEvent::Failed {
                    message: format!("the server did not start within {READY_TIMEOUT_SECS}s"),
                    log: log.clone(),
                },
            )
            .ok();
            Err(log)
        }
    }
}

pub async fn stop(state: &State<'_, Backend>) {
    let Some(mut child) = state.child.lock().await.take() else {
        return;
    };
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;
        let _ = kill(Pid::from_raw(pid as i32), Signal::SIGTERM);
        let _ = tokio::time::timeout(Duration::from_secs(8), child.wait()).await;
    }
    let _ = child.kill().await;
}

#[tauri::command]
pub async fn backend_url(state: State<'_, Backend>) -> Result<Option<String>, ()> {
    Ok(state.url.lock().await.clone())
}

#[tauri::command]
pub async fn backend_data_dir(state: State<'_, Backend>) -> Result<Option<String>, ()> {
    Ok(state
        .data_dir
        .lock()
        .await
        .clone()
        .map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn get_backend_log(state: State<'_, Backend>) -> Result<Vec<String>, ()> {
    Ok(state.log_tail.lock().await.clone())
}

#[tauri::command]
pub async fn start_backend(app: AppHandle) -> Result<(), String> {
    if app.state::<Backend>().child.lock().await.is_some() {
        return Ok(());
    }
    start(app).await
}

#[tauri::command]
pub async fn restart_backend(app: AppHandle, state: State<'_, Backend>) -> Result<(), String> {
    stop(&state).await;
    *state.url.lock().await = None;
    start(app).await
}
