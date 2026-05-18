pub mod conf;
pub mod resolve;

use std::io::Write;
use tauri::Manager;

use crate::ServerState;

pub use resolve::SpawnError;

pub fn do_log(log: &mut Option<std::fs::File>, msg: &str) {
    eprintln!("{}", msg);
    if let Some(f) = log {
        let _ = writeln!(f, "{}", msg);
    }
}

pub fn kill_tachidesk(app: &tauri::AppHandle) {
    let state = app.state::<ServerState>();
    if let Some(child) = state.0.lock().unwrap().take() {
        let _ = child.kill();
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/FI", "IMAGENAME eq java.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();

        for _ in 0..30 {
            let still_running = std::process::Command::new("tasklist")
                .args(["/FI", "IMAGENAME eq java.exe", "/NH"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).contains("java.exe"))
                .unwrap_or(false);

            if !still_running {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }

    #[cfg(not(target_os = "windows"))]
    let _ = std::process::Command::new("pkill")
        .args(["-f", "tachidesk"])
        .status();
}
